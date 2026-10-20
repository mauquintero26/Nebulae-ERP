/**
 * IVA de Ventas (Bloque 3, T13: IVA-PRODUCTO punto 8 e IVA punto 9). ESPEJO EXACTO de backend/app/core/iva.py: las
 * mismas tarifas, la misma normalización y la misma REGLA DE CÁLCULO en pesos enteros. El servidor recalcula y gana;
 * esto es para que la calculadora, el Cotizador Rápido y las pantallas muestren los mismos pesos antes de guardar.
 * JS plano para probarlo con node (frontend/tests/test_iva.mjs); la paridad que corre los dos lados de verdad es
 * backend/tests/test_paridad_bloque3.py (RP21).
 *
 * Aritmética: nunca el flotante. Los montos, las cantidades y el descuento se leen como decimales EXACTOS (el texto del
 * número, como Decimal(str(x)) en Python) y se opera con BigInt, con medio peso hacia arriba (ROUND_HALF_UP): 1,005 ×
 * $100 es $101, no los $100 de Math.round(1.005 * 100), que da 100.49999999999999. Por eso aquí no se usa redondearPeso
 * de pesos.js (Math.round sobre el flotante, que además toma true como 1 y '0x10' como 16): redondearPesoExacto es el
 * redondear_peso del backend.
 *
 * Contrato (nota del controlador tras T3): normalizarTarifaIva devuelve null con un valor vacío o no válido (el backend
 * lanza con los no válidos); pctTarifaIva y etiquetaTarifaIva nunca lanzan. calcularTotalesCotizacion lanza un Error con
 * el MISMO mensaje que el ValueError del backend (salvo el desborde de abajo).
 *
 * Divergencias conocidas con el backend (ninguna se alcanza desde la pantalla: piden más de 9 × 10^15 pesos o datos
 * que la pantalla no manda; la paridad de test_paridad_bloque3.py cubre todo lo realista):
 * - El BigInt es solo interno: las salidas son Number, exactas solo hasta 2^53 (9.007.199.254.740.992).
 *   desgloseDocumento con una base '9007199254740993' da iva_discriminado false (el backend, true), y
 *   repartirProporcional([1e20, 1], 1e20) da [1e20, 1] (el backend, [99999999999999999999, 1]).
 * - Un monto de 10^28 o más: el mensaje es «Monto no válido en '<línea>'.» (el backend: «Monto no válido:
 *   Decimal('1.0E+28')»); el texto del error de repartirProporcional tampoco es el de Python (true/abc frente a
 *   True/'abc').
 * - El texto de un número no acepta los '_' ni los dígitos no ASCII que Decimal sí acepta, y una cantidad con más de 28
 *   cifras significativas se multiplica exacta (Python redondea el producto al contexto).
 * - Un nombre de línea que no es texto sale distinto en los mensajes: 7.0 sale '7' (JSON no distingue 7.0 de 7) y una
 *   lista, un objeto o 1e16 se escriben a la manera de JS.
 */

import { stripPy } from './marca-empresa.js';
// B3 T17 (parte 4): formatoPesos y formatoCantidad solo escriben los textos de las pantallas, sobre montos ya enteros
// (pesoEntero).
import { formatoPesos, formatoCantidad } from './pesos.js';

// ─── Tarifas (parte 1) ─────────────────────────────────────────────────────────────────────────────────────────

/** Las tarifas en el orden en que se muestran (core/iva.TARIFAS_IVA, ORDEN_TARIFAS y ETIQUETAS_TARIFA_IVA). */
export const TARIFAS_IVA = Object.freeze([
  Object.freeze({ codigo: '19', pct: 19, etiqueta: 'IVA 19%' }),
  Object.freeze({ codigo: '5', pct: 5, etiqueta: 'IVA 5%' }),
  Object.freeze({ codigo: 'EXENTO', pct: 0, etiqueta: 'Exento' }),
  Object.freeze({ codigo: 'EXCLUIDO', pct: 0, etiqueta: 'Excluido' }),
]);
export const ORDEN_TARIFAS = Object.freeze(TARIFAS_IVA.map((t) => t.codigo));
export const ETIQUETAS_TARIFA_IVA = Object.freeze(Object.fromEntries(TARIFAS_IVA.map((t) => [t.codigo, t.etiqueta])));
const PCT_TARIFA = Object.freeze(Object.fromEntries(TARIFAS_IVA.map((t) => [t.codigo, t.pct])));
export const ETIQUETA_SIN_TARIFA = 'IVA no discriminado';
/** R8: la respuesta del usuario a iva_tarifa_defecto. */
export const TARIFA_IVA_POR_DEFECTO = '19';
export const MENSAJE_TARIFA_INVALIDA = 'Tarifa de IVA no válida: usa 19%, 5%, Exento o Excluido.';
export const MENSAJE_DESCUENTO_INVALIDO = 'El descuento debe estar entre 0 y 100%.';

const tiene = (o, k) => Object.hasOwn(o, k); // solo claves propias: 'toString' no es una tarifa
const esObjeto = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * El código de la tarifa ('19', '5', 'EXENTO', 'EXCLUIDO') o null si viene vacío o no es válido.
 * - Un número entero (19, 5) se lee como su texto; 19.5, NaN o Infinity no son válidos.
 * - Un texto se recorta (strip de Python), se pasa a mayúsculas y se le quitan 'IVA' y '%': '19%', ' iva 19 ' y
 *   'IVA19' dan '19'; 'exento' da 'EXENTO'.
 * - '0' (no dice si es exento o excluido), '16', '19.0', un booleano, una lista... no son válidos.
 * @param {unknown} valor
 * @returns {string | null}
 */
export function normalizarTarifaIva(valor) {
  let texto;
  if (typeof valor === 'number') {
    if (!Number.isInteger(valor)) return null;
    texto = String(valor);
  } else if (typeof valor === 'bigint') {
    texto = String(valor);
  } else if (typeof valor === 'string') {
    if (!stripPy(valor)) return null;
    texto = stripPy(valor.toUpperCase().replaceAll('IVA', '').replaceAll('%', ''));
  } else {
    return null;
  }
  return tiene(PCT_TARIFA, texto) ? texto : null;
}

/**
 * El porcentaje de la tarifa: 19, 5 o 0 (Exento y Excluido). Sin tarifa o con un código no válido, 0 (sin lanzar).
 * @param {unknown} codigo
 * @returns {number}
 */
export function pctTarifaIva(codigo) {
  const tarifa = normalizarTarifaIva(codigo);
  return tarifa === null ? 0 : PCT_TARIFA[tarifa];
}

/**
 * 'IVA 19%', 'IVA 5%', 'Exento' o 'Excluido'. Sin tarifa o con un código no válido, 'IVA no discriminado'.
 * @param {unknown} codigo
 * @returns {string}
 */
export function etiquetaTarifaIva(codigo) {
  const tarifa = normalizarTarifaIva(codigo);
  return tarifa === null ? ETIQUETA_SIN_TARIFA : ETIQUETAS_TARIFA_IVA[tarifa];
}

/** La etiqueta de un producto sin tarifa en la lista del catálogo (T14). */
export const ETIQUETA_CATALOGO_SIN_TARIFA = 'Sin tarifa';

/**
 * La etiqueta pequeña de cada fila del catálogo (T14): la de etiquetaTarifaIva o, si el producto no tiene tarifa (o
 * no es válida), 'Sin tarifa' (no 'IVA no discriminado', que es el texto de los documentos).
 * @param {unknown} codigo products.tarifa_iva
 * @returns {string}
 */
export function etiquetaTarifaCatalogo(codigo) {
  return normalizarTarifaIva(codigo) === null ? ETIQUETA_CATALOGO_SIN_TARIFA : etiquetaTarifaIva(codigo);
}

/**
 * true si el producto del catálogo no tiene tarifa de IVA (el botón «Sin tarifa de IVA», que filtra en el cliente).
 * Exento y Excluido sí son tarifas. Dice lo mismo que etiquetaTarifaCatalogo.
 * @param {unknown} producto un producto de GET /products ({tarifa_iva, ...})
 * @returns {boolean}
 */
export function sinTarifaIva(producto) {
  return normalizarTarifaIva(esObjeto(producto) ? producto.tarifa_iva : null) === null;
}

// ─── Decimales exactos (Decimal de Python) ─────────────────────────────────────────────────────────────────────

const DECIMAL = /^([+-])?(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/;
const PRECISION = 28; // la precisión del contexto de Decimal: quantize lanza si el entero no cabe
const UNO_PB = 10000n; // 100% en puntos básicos

/**
 * El valor exacto de un número o de un texto numérico: {neg, digitos (BigInt), exp} con valor = ±digitos × 10^exp, o
 * null si no es un número finito. Como Decimal(str(x).strip()): un número se lee por su texto ('1.15', '1e+21'); un
 * texto, sin los espacios de los bordes (strip de Python). No acepta los '_' ni los dígitos no ASCII que Decimal sí
 * acepta (la pantalla nunca los manda).
 */
function decimalExacto(valor) {
  let texto;
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) return null;
    texto = String(valor);
  } else if (typeof valor === 'bigint' || typeof valor === 'string') {
    texto = stripPy(String(valor));
  } else {
    return null;
  }
  const m = DECIMAL.exec(texto);
  if (!m) return null;
  const fraccion = m[3] ?? m[4] ?? '';
  const exp = Number(m[5] ?? 0) - fraccion.length;
  if (!Number.isSafeInteger(exp)) return null;
  const digitos = BigInt(`${m[2] ?? ''}${fraccion}` || '0');
  return { neg: m[1] === '-' && digitos !== 0n, digitos, exp };
}

/** ±digitos × 10^exp al entero, con medio hacia arriba (lejos de cero); null si no cabe en PRECISION dígitos. */
function enteroMedioArriba({ neg, digitos, exp }) {
  let entero;
  if (digitos === 0n) {
    entero = 0n;
  } else if (exp >= 0) {
    if (digitos.toString().length + exp > PRECISION) return null;
    entero = digitos * 10n ** BigInt(exp);
  } else if (-exp > digitos.toString().length) {
    entero = 0n; // menos de 0,1
  } else {
    const divisor = 10n ** BigInt(-exp);
    entero = digitos / divisor + ((digitos % divisor) * 2n >= divisor ? 1n : 0n);
    if (entero.toString().length > PRECISION) return null;
  }
  return neg ? -entero : entero;
}

/**
 * redondear_peso del backend (ventas_dinero.py), en BigInt: null, undefined y un texto en blanco valen 0; un número
 * finito o un texto numérico se redondea al peso con medio peso hacia arriba; lo demás (un booleano, 'abc', NaN, una
 * lista...) da null, donde el backend lanza ValueError.
 * @param {unknown} valor
 * @returns {bigint | null}
 */
function redondearPesoExacto(valor) {
  if (valor === null || valor === undefined) return 0n;
  if (typeof valor === 'string' && !stripPy(valor)) return 0n;
  const d = decimalExacto(valor);
  return d === null ? null : enteroMedioArriba(d);
}

/** _peso_entero del backend: redondear_peso como entero, y 0 si no es un monto (presentación de datos guardados). */
const pesoEntero = (valor) => redondearPesoExacto(valor) ?? 0n;

/** n / d con medio hacia arriba, para n >= 0 y d > 0 (BigInt). */
const divMedioArriba = (n, d) => n / d + ((n % d) * 2n >= d ? 1n : 0n);

// ─── Reparto proporcional ──────────────────────────────────────────────────────────────────────────────────────

/** El reparto de ventas_dinero.repartir_proporcional sobre BigInt ya redondeados. */
function repartirBig(montos, objetivo) {
  const pesos = montos.map((m) => (m > 0n ? m : 0n));
  const total = pesos.reduce((a, b) => a + b, 0n);
  if (objetivo <= 0n || total <= 0n) return pesos.map(() => 0n);
  const partes = pesos.map((p) => (objetivo * p) / total);
  const restos = pesos.map((p) => (objetivo * p) % total);
  const faltan = Number(objetivo - partes.reduce((a, b) => a + b, 0n));
  const orden = partes.map((_, i) => i).sort((a, b) => (restos[a] === restos[b] ? a - b : (restos[a] > restos[b] ? -1 : 1)));
  for (const i of orden.slice(0, faltan)) partes[i] += 1n;
  return partes;
}

/**
 * Reparte `objetivo` (pesos enteros) entre las líneas en proporción a sus `montos`, por el método del mayor residuo y
 * solo con enteros (BigInt: objetivo × monto puede pasar de 2^53): (q_i, r_i) = divmod(objetivo × m_i, Σm); los pesos
 * que faltan van, de a uno, a las de mayor r_i (en empate, la primera). La suma da exactamente el objetivo.
 * Los montos y el objetivo se redondean al peso; un monto negativo cuenta como 0; ceros si el objetivo o la suma no
 * son positivos; [] sin líneas. Un monto que no es un monto lanza, como en el backend.
 * @param {unknown[]} montos
 * @param {unknown} objetivo
 * @returns {number[]}
 */
export function repartirProporcional(montos, objetivo) {
  const lista = Array.isArray(montos) ? montos : [];
  const redondeado = (v) => {
    const n = redondearPesoExacto(v);
    if (n === null) throw new Error(`Monto no válido: ${String(v)}`);
    return n;
  };
  return repartirBig(lista.map(redondeado), redondeado(objetivo)).map(Number);
}

// ─── El IVA de la cotización (parte 2) ─────────────────────────────────────────────────────────────────────────

const NOMBRES_LINEA = ['product_name', 'nombre', 'name', 'producto', 'descripcion'];

/** str() de Python para el nombre de una línea (un booleano es 'True' / 'False'). */
const textoPy = (v) => (typeof v === 'boolean' ? (v ? 'True' : 'False') : String(v));

/**
 * El nombre de una línea en los mensajes (iva.nombre_de_linea): el primer valor que no sea null ni '' de product_name,
 * nombre, name, producto o descripcion, como texto y sin los espacios de los bordes; una línea que no es un objeto se
 * nombra con su propio texto. Si no queda nada, 'Línea N' (N desde 1).
 * @param {unknown} p
 * @param {number} indice
 * @returns {string}
 */
export function nombreDeLinea(p, indice) {
  let valor;
  if (esObjeto(p)) {
    const clave = NOMBRES_LINEA.find((k) => p[k] !== null && p[k] !== undefined && p[k] !== '');
    valor = clave === undefined ? null : p[clave];
  } else {
    valor = p;
  }
  const texto = valor === null || valor === undefined ? '' : stripPy(textoPy(valor));
  return texto || `Línea ${indice + 1}`;
}

/** La línea trae iva_tarifa (sea o no válida): un objeto con un valor que no es null ni un texto en blanco. */
function tieneTarifa(p) {
  if (!esObjeto(p)) return false;
  const v = p.iva_tarifa;
  return v !== null && v !== undefined && !(typeof v === 'string' && !stripPy(v));
}

/**
 * 'todas' (hay líneas y todas traen iva_tarifa), 'ninguna' (ninguna, o no hay líneas) o 'mezcla'.
 * @param {unknown} productos
 * @returns {'todas' | 'ninguna' | 'mezcla'}
 */
export function lineasConTarifa(productos) {
  const lineas = Array.isArray(productos) ? productos : [];
  const conTarifa = lineas.filter(tieneTarifa).length;
  if (!lineas.length || conTarifa === 0) return 'ninguna';
  return conTarifa === lineas.length ? 'todas' : 'mezcla';
}

/**
 * [{tarifa, etiqueta, base_cop, iva_cop}] en el orden de las tarifas, una fila por tarifa presente, sumando lo YA
 * GUARDADO en cada línea (base_iva_cop e iva_cop, al peso). No cuentan las líneas sin tarifa, con un código no válido
 * o que no son objetos; un monto que no es un monto vale 0 (no recalcula nada).
 * @param {unknown} productos
 * @returns {{tarifa: string, etiqueta: string, base_cop: number, iva_cop: number}[]}
 */
export function resumenIvaPorTarifa(productos) {
  const sumas = new Map();
  for (const p of Array.isArray(productos) ? productos : []) {
    if (!esObjeto(p)) continue;
    const tarifa = normalizarTarifaIva(p.iva_tarifa);
    if (tarifa === null) continue;
    const [base, iva] = sumas.get(tarifa) ?? [0n, 0n];
    sumas.set(tarifa, [base + pesoEntero(p.base_iva_cop), iva + pesoEntero(p.iva_cop)]);
  }
  return ORDEN_TARIFAS.filter((t) => sumas.has(t)).map((t) => ({
    tarifa: t, etiqueta: ETIQUETAS_TARIFA_IVA[t], base_cop: Number(sumas.get(t)[0]), iva_cop: Number(sumas.get(t)[1]),
  }));
}

/** El decimal (no negativo) es mayor que 100, comparado exacto y sin potencias enormes. */
function mayorQueCien({ digitos, exp }) {
  if (digitos === 0n) return false;
  const largoEntero = digitos.toString().length + exp; // cuántos dígitos tiene su parte entera
  if (largoEntero !== 3) return largoEntero > 3;
  return exp >= 0 ? digitos * 10n ** BigInt(exp) > 100n : digitos > 100n * 10n ** BigInt(-exp);
}

/**
 * El descuento global en puntos básicos enteros (BigInt, 0 a 10000): round(descuento × 100), medio hacia arriba.
 * null, undefined o un texto en blanco valen 0. Lanza MENSAJE_DESCUENTO_INVALIDO si no es un número o está fuera de
 * 0..100 (un booleano tampoco es un número, como en el backend).
 */
function puntosBasicos(descuentoPct) {
  if (descuentoPct === null || descuentoPct === undefined) return 0n;
  if (typeof descuentoPct === 'string' && !stripPy(descuentoPct)) return 0n;
  const d = typeof descuentoPct === 'boolean' ? null : decimalExacto(descuentoPct);
  if (d === null || d.neg || mayorQueCien(d)) throw new Error(MENSAJE_DESCUENTO_INVALIDO);
  return enteroMedioArriba({ ...d, exp: d.exp + 2 });
}

/** La cantidad de la línea (qty) como decimal exacto mayor que 0, o lanza el mensaje del backend. */
function cantidad(p, nombre) {
  const valor = p.qty;
  const d = valor === null || valor === undefined || typeof valor === 'boolean' ? null : decimalExacto(valor);
  if (d === null || d.neg || d.digitos === 0n) throw new Error(`La cantidad de '${nombre}' debe ser mayor que 0.`);
  return d;
}

/**
 * El IVA de la cotización con la REGLA DE CÁLCULO de core/iva.py, en pesos enteros. Por línea, con
 * unit = redondear_peso(unit_price_cop) y qty > 0: bruto = redondear_peso(unit × qty) (total_cop, sin IVA y antes del
 * descuento); subtotal = Σ bruto; pb = round(descuento × 100); D = redondear_peso(subtotal × pb / 10000), repartido con
 * repartirProporcional; base = bruto − d; iva = redondear_peso(base × pct / 100); total con IVA = base + iva.
 * Devuelve {lineas (COPIAS nuevas: la entrada no se toca, con iva_tarifa normalizada, iva_pct, unit_price_cop,
 * total_cop, descuento_cop, base_iva_cop, iva_cop y total_con_iva_cop), subtotal_cop, descuento_cop, iva_cop,
 * total_cop, iva_por_tarifa}. Lanza un Error con el mensaje del backend si una línea no es un producto, no trae
 * tarifa, la tarifa no es válida, la cantidad no es mayor que 0 o el precio no es un monto >= 0, o si el descuento no
 * es un número entre 0 y 100.
 * @param {unknown} productos
 * @param {unknown} descuentoPct
 */
export function calcularTotalesCotizacion(productos, descuentoPct) {
  const pb = puntosBasicos(descuentoPct);
  const lineas = [];
  const brutos = [];
  (Array.isArray(productos) ? productos : []).forEach((p, i) => {
    if (!esObjeto(p)) throw new Error(`La línea ${i + 1} no es un producto válido.`);
    const nombre = nombreDeLinea(p, i);
    if (!tieneTarifa(p)) throw new Error(`Indica la tarifa de IVA de '${nombre}'.`);
    const tarifa = normalizarTarifaIva(p.iva_tarifa);
    if (tarifa === null) {
      throw new Error(`Tarifa de IVA no válida en '${nombre}': usa 19%, 5%, Exento o Excluido.`);
    }
    const qty = cantidad(p, nombre);
    const unit = redondearPesoExacto(p.unit_price_cop);
    if (unit === null || unit < 0n) throw new Error(`El precio unitario de '${nombre}' no es válido.`);
    const bruto = enteroMedioArriba({ neg: false, digitos: unit * qty.digitos, exp: qty.exp });
    if (bruto === null) throw new Error(`Monto no válido en '${nombre}'.`);
    brutos.push(bruto);
    lineas.push({ ...p, iva_tarifa: tarifa, iva_pct: PCT_TARIFA[tarifa], unit_price_cop: Number(unit),
      total_cop: Number(bruto) });
  });
  const subtotal = brutos.reduce((a, b) => a + b, 0n);
  const descuento = divMedioArriba(subtotal * pb, UNO_PB);
  const partes = repartirBig(brutos, descuento);
  lineas.forEach((linea, i) => {
    const base = brutos[i] - partes[i];
    const iva = divMedioArriba(base * BigInt(linea.iva_pct), 100n);
    Object.assign(linea, { descuento_cop: Number(partes[i]), base_iva_cop: Number(base), iva_cop: Number(iva),
      total_con_iva_cop: Number(base + iva) });
  });
  const suma = (clave) => lineas.reduce((a, l) => a + l[clave], 0);
  return {
    lineas, subtotal_cop: suma('total_cop'), descuento_cop: suma('descuento_cop'), iva_cop: suma('iva_cop'),
    total_cop: suma('total_con_iva_cop'), iva_por_tarifa: resumenIvaPorTarifa(lineas),
  };
}

/**
 * {iva_discriminado, iva_cop, descuento_cop, iva_por_tarifa} de una cotización o un pedido ({productos, subtotal_cop,
 * tax_cop, total_cop}), en pesos enteros y sin recalcular nada (iva.desglose_documento):
 * - iva_discriminado: hay líneas, todas traen iva_tarifa y su resumen CUADRA con la cabecera (la suma del IVA por
 *   tarifa es tax_cop y la de las bases es total − IVA); si no cuadra, IVA no discriminado.
 * - iva_cop: tax_cop al peso (0 si falta); descuento_cop: max(0, subtotal + IVA − total).
 * - iva_por_tarifa: resumenIvaPorTarifa de las líneas, o [] si no está discriminado.
 * Un documento viejo (sin tarifas) da iva_discriminado false.
 * @param {unknown} doc
 */
export function desgloseDocumento(doc) {
  const campo = (nombre) => (typeof doc === 'object' && doc !== null ? doc[nombre] : undefined);
  const productos = campo('productos');
  const subtotal = pesoEntero(campo('subtotal_cop'));
  const iva = pesoEntero(campo('tax_cop'));
  const total = pesoEntero(campo('total_cop'));
  let resumen = lineasConTarifa(productos) === 'todas' ? resumenIvaPorTarifa(productos) : [];
  const cuadra = resumen.reduce((a, f) => a + BigInt(f.iva_cop), 0n) === iva
    && resumen.reduce((a, f) => a + BigInt(f.base_cop), 0n) === total - iva;
  if (!(resumen.length && cuadra)) resumen = [];
  const descuento = subtotal + iva - total;
  return { iva_discriminado: resumen.length > 0, iva_cop: Number(iva), descuento_cop: Number(descuento > 0n ? descuento : 0n),
    iva_por_tarifa: resumen };
}

// ─── Las pantallas de la cotización (parte 4, B3 T17) ──────────────────────────────────────────────────────────

/**
 * La etiqueta corta de una tarifa en el selector de cada línea (la calculadora y el Cotizador Rápido): '19%', '5%',
 * 'Exento' o 'Excluido'; '' si no es una tarifa válida.
 * @param {unknown} codigo
 * @returns {string}
 */
export function etiquetaCortaTarifaIva(codigo) {
  const tarifa = normalizarTarifaIva(codigo);
  if (tarifa === null) return '';
  return PCT_TARIFA[tarifa] > 0 ? `${PCT_TARIFA[tarifa]}%` : ETIQUETAS_TARIFA_IVA[tarifa];
}

/**
 * calcularTotalesCotizacion sin lanzar (nota del controlador tras T13): {totales, error}. Con una línea incompleta (qty
 * '', '-' o '.', un precio no válido, una línea sin tarifa) o un descuento fuera de 0..100, totales es null y error el
 * mensaje que lanzó, que es el mismo del 422 del servidor; si no, error es ''. La pantalla muestra el error en línea y
 * los totales en «—»: nunca se cae.
 * @param {unknown} productos
 * @param {unknown} descuentoPct
 * @returns {{totales: ReturnType<typeof calcularTotalesCotizacion> | null, error: string}}
 */
export function intentarTotalesCotizacion(productos, descuentoPct) {
  try {
    return { totales: calcularTotalesCotizacion(productos, descuentoPct), error: '' };
  } catch (e) {
    return { totales: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * El renglón de una tarifa en un bloque de totales: 'IVA 19% sobre $1.537.753', 'Exento sobre $132.000' (su IVA va
 * aparte). `fila` es una de iva_por_tarifa ({tarifa, base_cop, iva_cop}).
 * @param {unknown} fila
 * @returns {string}
 */
export function textoBaseIva(fila) {
  const f = esObjeto(fila) ? /** @type {any} */ (fila) : {};
  return `${etiquetaTarifaIva(f.tarifa)} sobre ${formatoPesos(Number(pesoEntero(f.base_cop)))}`;
}

/**
 * Los renglones del IVA en un bloque de totales (IVA puntos 10 y 11): la calculadora (el resultado de
 * calcularTotalesCotizacion) y TOTALES del detalle (el desglose del GET: iva_discriminado, iva_por_tarifa, total_cop).
 * - Una fila por tarifa: {clave: 'iva-19', etiqueta: 'IVA 19% sobre $1.537.753', valor: 292173}.
 * - Un documento con iva_discriminado false (una cotización vieja) y total mayor que 0: una sola fila
 *   {clave: 'sin-iva', etiqueta: 'IVA no discriminado', valor: null}. Sin precios todavía, nada.
 * - B3 T19 r1: sin discriminar pero con IVA conocido (iva_cop, el tax_cop de la cabecera, > 0), el criterio de
 *   documento_cliente._totales_del_documento (lo que ve el cliente): {clave: 'iva', etiqueta: 'IVA sobre $(total − IVA)',
 *   valor: iva_cop}, en lugar de la fila gris.
 * @param {unknown} t
 * @returns {{clave: string, etiqueta: string, valor: number | null}[]}
 */
export function filasIvaTotales(t) {
  if (!esObjeto(t)) return [];
  const doc = /** @type {any} */ (t);
  if (doc.iva_discriminado === false) {
    const total = pesoEntero(doc.total_cop);
    const iva = pesoEntero(doc.iva_cop);
    if (iva > 0n) return [{ clave: 'iva', etiqueta: `IVA sobre ${formatoPesos(Number(total - iva))}`, valor: Number(iva) }];
    return total > 0n ? [{ clave: 'sin-iva', etiqueta: ETIQUETA_SIN_TARIFA, valor: null }] : [];
  }
  return (Array.isArray(doc.iva_por_tarifa) ? doc.iva_por_tarifa : []).filter(esObjeto).map((f) => ({
    clave: `iva-${normalizarTarifaIva(f.tarifa) ?? f.tarifa}`, etiqueta: textoBaseIva(f), valor: Number(pesoEntero(f.iva_cop)),
  }));
}

/**
 * El IVA de una línea guardada de la cotización, para su tarjeta en el detalle (IVA punto 11):
 * - null si la línea vale $0 (totalSinIvaDeLinea: total_cop o, sin él, unitario × cantidad exacto): no se dice nada
 *   del IVA;
 * - {discriminado: false, texto: 'IVA no discriminado'} si no trae una tarifa válida (una cotización vieja);
 * - con tarifa: {discriminado: true, cantidad: 'Cant. 6 × $206.769 sin IVA' ('Cant. 2,5 × …' con formatoCantidad), iva:
 *   'IVA 19% · $235.717', descuento:
 *   'Descuento −$124.061' (null sin descuento), total_con_iva_cop}. Los montos son los GUARDADOS (no recalcula nada);
 *   sin total_con_iva_cop, base + IVA (montosIvaDeLinea, la misma regla de la fila del pedido).
 * @param {unknown} linea
 */
export function ivaDeLinea(linea) {
  if (!esObjeto(linea)) return null;
  const l = /** @type {any} */ (linea);
  if (!(totalSinIvaDeLinea(l) > 0)) return null;
  const tarifa = normalizarTarifaIva(l.iva_tarifa);
  if (tarifa === null) return { discriminado: false, texto: ETIQUETA_SIN_TARIFA };
  const { iva, descuento, conIva } = montosIvaDeLinea(l);
  return {
    discriminado: true,
    // r1: la cantidad como en el documento del cliente ('2,5'); una guardada como texto ('3') también se lee.
    cantidad: `Cant. ${formatoCantidad(Number(l.qty ?? 0)) || '0'} × ${formatoPesos(Number(pesoEntero(l.unit_price_cop)))} sin IVA`,
    iva: `${ETIQUETAS_TARIFA_IVA[tarifa]} · ${formatoPesos(iva)}`,
    descuento: textoDescuentoLinea(descuento),
    total_con_iva_cop: conIva,
  };
}

/** 'Descuento −$124.061' (la parte del descuento global de una línea), o null sin descuento. */
const textoDescuentoLinea = (descuento) => (descuento > 0 ? `Descuento −${formatoPesos(descuento)}` : null);

/**
 * B3 T19 r1: los montos de IVA GUARDADOS en una línea con tarifa, en pesos enteros (Number): iva (iva_cop), descuento
 * (descuento_cop, su parte del descuento global) y conIva (total_con_iva_cop; sin él, base + IVA = total sin IVA −
 * descuento + IVA). Una sola regla para ivaDeLinea (la tarjeta de la COT) y filaProductoPedido (la tabla del pedido).
 * @param {any} l una línea (objeto)
 * @returns {{iva: number, descuento: number, conIva: number}}
 */
function montosIvaDeLinea(l) {
  const iva = Number(pesoEntero(l.iva_cop));
  const descuento = Number(pesoEntero(l.descuento_cop));
  const conIva = l.total_con_iva_cop !== null && l.total_con_iva_cop !== undefined
    ? Number(pesoEntero(l.total_con_iva_cop)) : totalSinIvaDeLinea(l) - descuento + iva;
  return { iva, descuento, conIva };
}

// ─── El pedido de venta (B3 T19) ───────────────────────────────────────────────────────────────────────────────

// El nombre que ve el cliente en su documento (documento_cliente._descripcion de linea_publica: product_name, nombre,
// name) y, detrás, los respaldos que ya usaba la tabla del pedido (descripcion, producto_nombre). No es la lista de
// nombreDeLinea (NOMBRES_LINEA, con 'producto' y el 'Línea N' de los mensajes de error del cálculo).
const NOMBRES_FILA_PEDIDO = ['product_name', 'nombre', 'name', 'descripcion', 'producto_nombre'];

/**
 * El total SIN IVA de una línea guardada, como documento_cliente._total_linea: total_cop al peso (o subtotal, el campo
 * de las líneas viejas de la pantalla); sin ninguno, precio × cantidad, exacto y al peso (nunca el flotante). 0 si no
 * hay con qué calcularlo. La única regla del archivo para ese total (r1): la usan ivaDeLinea, montosIvaDeLinea y
 * filaProductoPedido.
 */
function totalSinIvaDeLinea(l) {
  const guardado = l.total_cop ?? l.subtotal;
  if (guardado !== null && guardado !== undefined) return Number(pesoEntero(guardado));
  const precio = decimalExacto(l.unit_price_cop ?? l.precio_unitario);
  const cant = decimalExacto(l.qty ?? l.cantidad);
  if (precio === null || cant === null) return 0;
  const total = enteroMedioArriba({ neg: precio.neg !== cant.neg, digitos: precio.digitos * cant.digitos,
    exp: precio.exp + cant.exp });
  return total === null ? 0 : Number(total);
}

/**
 * Una fila de la tabla Productos del pedido de venta (venta/[id], IVA punto 12): PRODUCTO / CANT. / P. UNIT. SIN IVA /
 * IVA / TOTAL CON IVA. El nombre, la cantidad, el precio y la etiqueta de IVA son los de la línea de su documento del
 * cliente (documento_pven: linea_publica con _iva_de_linea). El total NO: el documento del cliente pone el total SIN
 * IVA de cada línea (C4) y aquí va el total CON IVA (el brief; la columna dice «Total con IVA», ruling r1). No recalcula
 * nada: los montos son los GUARDADOS en la línea.
 * - producto: el primer texto no vacío de product_name, nombre, name, descripcion o producto_nombre; si no,
 *   'Producto sin nombre'. cantidad: qty (o cantidad) con formatoCantidad ('2,5'); unitario: unit_price_cop (o
 *   precio_unitario) al peso.
 * - Con el IVA discriminado en el PEDIDO (`ivaDiscriminado`, el iva_discriminado del GET; como _iva_de_linea, no basta
 *   con que la línea traiga tarifa): iva = {etiqueta ('IVA 19%', 'Exento'…), valor (el iva_cop de la línea), descuento
 *   ('Descuento −$X' o null)} y total = total_con_iva_cop (sin él, base + IVA). Las filas suman el total del pedido.
 * - Sin IVA discriminado (un pedido viejo, o uno cuyo resumen no cuadra): iva null, total = el total sin IVA de la línea
 *   (C4: nunca total_con_iva_cop) y sinDiscriminar true si la línea vale más de $0 (la celda dice 'IVA no
 *   discriminado'; una línea en $0 no dice nada del IVA).
 * Lo que no es una línea da una fila vacía ('Producto sin nombre', '0', $0).
 * @param {unknown} linea
 * @param {unknown} ivaDiscriminado
 * @returns {{producto: string, cantidad: string, unitario: number, sinDiscriminar: boolean, total: number,
 *   iva: {etiqueta: string, valor: number, descuento: string | null} | null}}
 */
export function filaProductoPedido(linea, ivaDiscriminado) {
  if (!esObjeto(linea)) {
    return { producto: 'Producto sin nombre', cantidad: '0', unitario: 0, iva: null, sinDiscriminar: false, total: 0 };
  }
  const l = /** @type {any} */ (linea);
  const nombre = NOMBRES_FILA_PEDIDO.map((k) => (typeof l[k] === 'string' ? stripPy(l[k]) : '')).find(Boolean);
  const base = {
    producto: nombre || 'Producto sin nombre',
    cantidad: formatoCantidad(Number(l.qty ?? l.cantidad ?? 0)) || '0',
    unitario: Number(pesoEntero(l.unit_price_cop ?? l.precio_unitario)),
  };
  const sinIva = totalSinIvaDeLinea(l);
  if (ivaDiscriminado !== true) return { ...base, iva: null, sinDiscriminar: sinIva > 0, total: sinIva };
  const { iva, descuento, conIva } = montosIvaDeLinea(l);
  return { ...base, iva: { etiqueta: etiquetaTarifaIva(l.iva_tarifa), valor: iva, descuento: textoDescuentoLinea(descuento) },
    sinDiscriminar: false, total: conIva };
}

/**
 * B3 T19 r1 (Important): la misma fila de filaProductoPedido como tarjeta, cuando la columna del pedido no cabe la tabla
 * (bajo @xl: a 1024 px mide unos 390 px). En el lenguaje de PrecioLineaIva de la COT:
 * - precio: '6 × $206.769 sin IVA' ('sin IVA' solo con el IVA discriminado; en un pedido viejo no se sabe);
 * - iva: 'IVA 19% · $212.145 · Descuento −$124.061', 'IVA no discriminado' o null (una línea en $0 de un pedido viejo).
 * @param {unknown} fila el resultado de filaProductoPedido
 * @returns {{precio: string, iva: string | null}}
 */
export function textosTarjetaPedido(fila) {
  const f = esObjeto(fila) ? /** @type {any} */ (fila) : {};
  const precio = `${f.cantidad || '0'} × ${formatoPesos(Number(f.unitario) || 0)}${esObjeto(f.iva) ? ' sin IVA' : ''}`;
  if (esObjeto(f.iva)) {
    return { precio, iva: [f.iva.etiqueta, formatoPesos(f.iva.valor), f.iva.descuento].filter(Boolean).join(' · ') };
  }
  return { precio, iva: f.sinDiscriminar === true ? ETIQUETA_SIN_TARIFA : null };
}

/** La nota de los productos cancelados del documento del cliente (documento_cliente.TEXTO_PRODUCTOS_CANCELADOS). */
export const TEXTO_PRODUCTOS_CANCELADOS = 'Se cancelaron productos; los totales ya lo reflejan.';

/**
 * B3 T19 r1: bajo la tabla del pedido, la misma nota que ve el cliente si se cancelaron productos: la Actividad trae un
 * renglón LINEA_CANCELADA (erp_ventas_fase4). En un pedido sin IVA discriminado la línea cancelada sigue en el JSON con
 * su cantidad completa (nota del controlador tras T4), así que las filas pueden sumar más que la cabecera; los totales
 * son los de la cabecera. null sin cancelaciones.
 * @param {unknown} actividades
 * @returns {string | null}
 */
export function notaProductosCancelados(actividades) {
  if (!Array.isArray(actividades)) return null;
  return actividades.some((a) => esObjeto(a) && /** @type {any} */ (a).action === 'LINEA_CANCELADA')
    ? TEXTO_PRODUCTOS_CANCELADOS : null;
}

/**
 * La línea bajo «Total del pedido» en el Resumen Financiero (IVA punto 12): 'IVA incluido: $298.113' si el pedido tiene
 * el IVA discriminado (iva_cop del GET, el tax_cop de la cabecera; 'IVA incluido: $0' si todo es exento o excluido) o,
 * sin discriminar, si su IVA guardado es mayor que 0 (r1: como documento_cliente._totales_del_documento); 'IVA no
 * discriminado' en un pedido viejo con total y sin IVA; null sin total o si no es un pedido.
 * @param {unknown} doc
 * @returns {string | null}
 */
export function textoIvaIncluido(doc) {
  if (!esObjeto(doc)) return null;
  const d = /** @type {any} */ (doc);
  const iva = pesoEntero(d.iva_cop);
  if (d.iva_discriminado === true || iva > 0n) return `IVA incluido: ${formatoPesos(Number(iva))}`;
  return pesoEntero(d.total_cop) > 0n ? ETIQUETA_SIN_TARIFA : null;
}
