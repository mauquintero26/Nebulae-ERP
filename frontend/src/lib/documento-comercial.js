/**
 * El documento que ve el cliente: solicitud, cotización y pedido (Bloque 3, T12: PLANTILLA, U22+H38, U23; C2, C3,
 * C5, R24, RP25 y la nota del controlador después de T9). JS plano para probarlo con node
 * (frontend/tests/test_documento_comercial.mjs); lo pinta components/documento/DocumentoComercial.tsx.
 *
 * - El documento llega del servidor con la forma ÚNICA de backend/app/core/documento_cliente.py (armar_documento,
 *   CLAVES_DOCUMENTO): tipo, titulo, numero, estado, fecha_emision ('…Z'), fecha_entrega_estimada ('AAAA-MM-DD'),
 *   cliente {nombre, direccion_entrega}, atendido_por, con_precios, lineas, totales | null, pago | null, notas,
 *   valida_hasta, terminos, mensaje_pie. Los números vienen del servidor: aquí no se recalcula nada (el IVA llega en
 *   totales.impuestos desde iva.desglose_documento); solo se completa total_linea si falta.
 * - Los textos de la forma de pago y de los totales son los del PDF (core/pdf_documento.py): la misma precedencia
 *   (manual -> 100% -> > 0% -> 0%) y los mismos textos, para que la página y el PDF digan lo mismo (T13 lo compara).
 */

import { redondearPeso, formatoPesos } from './pesos.js';
import { formatoPct } from './dinero-ventas.js';
import { waUrl } from './whatsapp.js';
import { etiquetaModalidad, pctAnticipoDeModalidad } from './etiquetas-solicitud.js';
import { resumenPagoPedido } from './resumen-pago.js';
import { comoUTC } from './hub-ventas.js';
import { fechaLarga, fechaSolo } from './fechas-colombia.js';
import { correoValido, normalizarMarca } from './marca-empresa.js';

/**
 * Cómo se pinta cada tipo de documento: el título de la hoja, cómo se nombra en una frase y la variante (C3): la
 * solicitud con la franja degradada, la cotización y el pedido con la hoja blanca y el acento. Inmutable.
 */
export const TIPOS_DOCUMENTO = Object.freeze({
  SC: Object.freeze({ titulo: 'SOLICITUD', nombre: 'solicitud', articulo: 'la', variante: 'degradado' }),
  COT: Object.freeze({ titulo: 'COTIZACIÓN', nombre: 'cotización', articulo: 'la', variante: 'acento' }),
  PVEN: Object.freeze({ titulo: 'PEDIDO DE VENTA', nombre: 'pedido', articulo: 'el', variante: 'acento' }),
});

/**
 * @typedef {{ n: number, descripcion: string, cantidad: number | null, precio_unitario: number | null,
 *   total_linea: number | null, iva_etiqueta: string | null, iva_pct: number | null, anticipo: number | null }} LineaDocumento
 * @typedef {{ etiqueta: string | null, base: number | null, valor: number | null }} ImpuestoDocumento
 * @typedef {{ subtotal: number | null, descuento_pct: number | null, descuento: number | null,
 *   impuestos: ImpuestoDocumento[], ajuste_redondeo: number | null, total: number | null }} TotalesDocumento
 * @typedef {{ concepto: string | null, monto: number | null, metodo: string | null, fecha: string | null }} PagoRegistrado
 * @typedef {{ modalidad: string | null, anticipo_pct: number | null, anticipo: number | null, saldo: number | null,
 *   saldo_a_favor: number | null, anticipo_por_pagar: number | null, pagado: number | null,
 *   pagos: PagoRegistrado[] | null, instrucciones: string | null, manual: boolean }} PagoDocumento
 * @typedef {{ titulo: string | null, texto: string }} NotaDocumento
 * @typedef {{ tipo: string | null, titulo: string, numero: string, estado: string | null, fecha_emision: string | null,
 *   fecha_entrega_estimada: string | null, cliente: { nombre: string | null, direccion_entrega: string | null },
 *   atendido_por: string | null, con_precios: boolean, lineas: LineaDocumento[], totales: TotalesDocumento | null,
 *   pago: PagoDocumento | null, notas: NotaDocumento[], valida_hasta: string | null, terminos: string | null,
 *   mensaje_pie: string | null }} DocumentoCliente
 * @typedef {{ clave: string, etiqueta: string, valor: number, estilo: null | 'total' | 'fuerte' | 'ambar' }} FilaTotal
 * @typedef {{ tipo: 'telefono' | 'whatsapp' | 'correo' | 'web', etiqueta: string, texto: string, href: string,
 *   externo: boolean }} ContactoEmpresa
 */

const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
/** Un número de JSON (no un texto, no un booleano, finito): como _es_numero del PDF. */
const esNumero = (v) => typeof v === 'number' && Number.isFinite(v);
const numeroONull = (v) => (esNumero(v) ? v : null);
const positivo = (v) => esNumero(v) && v > 0;
const textoONull = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
/** _pesos del PDF: '$1.062.523' de un monto; '' si no viene o no es un monto. */
const pesos = (v) => (esNumero(v) ? formatoPesos(v) : '');

const tieneTipo = (tipo) => typeof tipo === 'string' && Object.prototype.hasOwnProperty.call(TIPOS_DOCUMENTO, tipo);

// ─── Normalizar ─────────────────────────────────────────────────────────────────────────────────────────────────

/** @returns {LineaDocumento | null} */
function normalizarLinea(linea, posicion, conPrecios) {
  if (!esObjeto(linea)) return null;
  const cantidad = numeroONull(linea.cantidad);
  const precio = conPrecios ? numeroONull(linea.precio_unitario) : null;
  let total = conPrecios ? numeroONull(linea.total_linea) : null;
  if (conPrecios && total === null && precio !== null && cantidad !== null) total = redondearPeso(precio * cantidad);
  return {
    n: esNumero(linea.n) ? linea.n : posicion,
    descripcion: textoONull(linea.descripcion) ?? 'Producto',
    cantidad,
    precio_unitario: precio,
    total_linea: total,
    iva_etiqueta: conPrecios ? textoONull(linea.iva_etiqueta) : null,
    iva_pct: conPrecios ? numeroONull(linea.iva_pct) : null,
    anticipo: conPrecios ? numeroONull(linea.anticipo) : null,
  };
}

/** @returns {TotalesDocumento | null} */
function normalizarTotales(t) {
  if (!esObjeto(t)) return null;
  return {
    subtotal: numeroONull(t.subtotal), descuento_pct: numeroONull(t.descuento_pct), descuento: numeroONull(t.descuento),
    impuestos: (Array.isArray(t.impuestos) ? t.impuestos : []).filter(esObjeto)
      .map((i) => ({ etiqueta: textoONull(i.etiqueta), base: numeroONull(i.base), valor: numeroONull(i.valor) })),
    ajuste_redondeo: numeroONull(t.ajuste_redondeo), total: numeroONull(t.total),
  };
}

/** @returns {PagoDocumento | null} */
function normalizarPago(p) {
  if (!esObjeto(p)) return null;
  return {
    modalidad: textoONull(p.modalidad), anticipo_pct: numeroONull(p.anticipo_pct), anticipo: numeroONull(p.anticipo),
    saldo: numeroONull(p.saldo), saldo_a_favor: numeroONull(p.saldo_a_favor),
    anticipo_por_pagar: numeroONull(p.anticipo_por_pagar), pagado: numeroONull(p.pagado),
    pagos: Array.isArray(p.pagos) ? p.pagos.filter(esObjeto).map((x) => ({ concepto: textoONull(x.concepto),
      monto: numeroONull(x.monto), metodo: textoONull(x.metodo), fecha: textoONull(x.fecha) })) : null,
    instrucciones: textoONull(p.instrucciones), manual: p.manual === true,
  };
}

/**
 * El documento con todas sus claves (las de CLAVES_DOCUMENTO), listo para pintar, sin recalcular nada: completa
 * total_linea si falta (redondearPeso(precio × cantidad)), una línea sin descripción queda como 'Producto', numera las
 * líneas que no traen n y descarta lo que no es una línea y las notas vacías. Sin precios (la SC), las líneas no
 * llevan ningún monto y no hay totales. Cualquier cosa que no sea un documento da uno vacío.
 * @param {unknown} raw
 * @returns {DocumentoCliente}
 */
export function normalizarDocumento(raw) {
  const d = esObjeto(raw) ? raw : {};
  const conPrecios = d.con_precios === true;
  const tipo = tieneTipo(d.tipo) ? d.tipo : null;
  const cliente = esObjeto(d.cliente) ? d.cliente : {};
  const lineas = (Array.isArray(d.lineas) ? d.lineas : []).filter(esObjeto)
    .map((l, i) => /** @type {LineaDocumento} */ (normalizarLinea(l, i + 1, conPrecios)));
  return {
    tipo,
    titulo: textoONull(d.titulo) ?? '',
    numero: textoONull(d.numero) ?? '',
    estado: textoONull(d.estado),
    fecha_emision: textoONull(d.fecha_emision),
    fecha_entrega_estimada: textoONull(d.fecha_entrega_estimada),
    cliente: { nombre: textoONull(cliente.nombre), direccion_entrega: textoONull(cliente.direccion_entrega) },
    atendido_por: textoONull(d.atendido_por),
    con_precios: conPrecios,
    lineas,
    totales: conPrecios ? normalizarTotales(d.totales) : null,
    pago: normalizarPago(d.pago),
    notas: (Array.isArray(d.notas) ? d.notas : []).filter((n) => esObjeto(n) && textoONull(n.texto))
      .map((n) => ({ titulo: textoONull(n.titulo), texto: n.texto.trim() })),
    valida_hasta: textoONull(d.valida_hasta),
    terminos: textoONull(d.terminos),
    mensaje_pie: textoONull(d.mensaje_pie),
  };
}

// ─── Totales y forma de pago (los mismos del PDF) ─────────────────────────────────────────────────────────────

/**
 * Las filas del bloque de totales, en el orden del PDF (pdf_documento._filas_totales): Subtotal; 'Descuento (x%)' en
 * negativo, solo si es mayor que 0; una fila por impuesto ('IVA 19% sobre $X'); 'Ajuste por redondeo' si es distinto
 * de 0; 'TOTAL' (estilo 'total'). Con pago: 'Anticipo (x%)'; con saldo a favor, 'Saldo a favor' y 'Anticipo por pagar'
 * ('fuerte'); 'Pagado' si es mayor que 0; en el pedido, 'Anticipo pendiente' si es mayor que 0 ('ambar', R4); y
 * 'Saldo' ('Saldo por pagar', 'fuerte', en el pedido). Sin precios (con_precios false), la lista queda vacía.
 * @param {unknown} doc
 * @returns {FilaTotal[]}
 */
export function filasTotales(doc) {
  if (!esObjeto(doc) || doc.con_precios !== true) return [];
  /** @type {FilaTotal[]} */
  const filas = [];
  const fila = (clave, etiqueta, valor, estilo = null) => filas.push({ clave, etiqueta, valor, estilo });
  const t = doc.totales;
  if (esObjeto(t)) {
    fila('subtotal', 'Subtotal', redondearPeso(t.subtotal));
    if (positivo(t.descuento)) {
      fila('descuento', esNumero(t.descuento_pct) ? `Descuento (${formatoPct(t.descuento_pct)})` : 'Descuento', -t.descuento);
    }
    (Array.isArray(t.impuestos) ? t.impuestos : []).filter(esObjeto).forEach((imp, i) => {
      const etiqueta = textoONull(imp.etiqueta) ?? 'IVA';
      fila(`impuesto-${i}`, esNumero(imp.base) ? `${etiqueta} sobre ${formatoPesos(imp.base)}` : etiqueta,
        redondearPeso(imp.valor));
    });
    if (esNumero(t.ajuste_redondeo) && t.ajuste_redondeo !== 0) fila('ajuste', 'Ajuste por redondeo', t.ajuste_redondeo);
    fila('total', 'TOTAL', redondearPeso(t.total), 'total');
  }
  const p = doc.pago;
  if (!esObjeto(p)) return filas;
  const esPedido = doc.tipo === 'PVEN';
  if (p.anticipo !== null && p.anticipo !== undefined) {
    fila('anticipo', esNumero(p.anticipo_pct) ? `Anticipo (${formatoPct(p.anticipo_pct)})` : 'Anticipo',
      redondearPeso(p.anticipo));
  }
  if (positivo(p.saldo_a_favor)) {
    fila('saldo_a_favor', 'Saldo a favor', p.saldo_a_favor);
    if (p.anticipo_por_pagar !== null && p.anticipo_por_pagar !== undefined) {
      fila('anticipo_por_pagar', 'Anticipo por pagar', redondearPeso(p.anticipo_por_pagar), 'fuerte');
    }
  }
  if (positivo(p.pagado)) fila('pagado', 'Pagado', p.pagado);
  if (esPedido && positivo(p.anticipo_por_pagar)) fila('anticipo_pendiente', 'Anticipo pendiente', p.anticipo_por_pagar, 'ambar');
  if (p.saldo !== null && p.saldo !== undefined) {
    fila('saldo', esPedido ? 'Saldo por pagar' : 'Saldo', redondearPeso(p.saldo), esPedido ? 'fuerte' : null);
  }
  return filas;
}

/** U17 (R24): la forma de pago de la SC, sin montos. Reconoce la modalidad con pctAnticipoDeModalidad (R2). */
function textoFormaPagoSolicitud(p) {
  const reconocida = pctAnticipoDeModalidad(p.modalidad);
  const pct = esNumero(p.anticipo_pct) ? p.anticipo_pct : (reconocida ?? 60);
  if (reconocida === null) {
    return `Anticipo del ${formatoPct(pct)} del valor de la cotización antes del pedido; tu asesor te confirma la forma de pago.`;
  }
  if (pct >= 100) return 'Pagas el 100% del valor de la cotización antes de que hagamos tu pedido.';
  if (pct > 0) {
    return `Pagas un anticipo del ${formatoPct(pct)} del valor de la cotización antes de que hagamos tu pedido; el `
      + `${formatoPct(100 - pct)} restante, después.`;
  }
  return 'Sin anticipo: pagas según el crédito acordado con tu asesor.';
}

/**
 * El renglón de la forma de pago, SIN la modalidad (va en su propio renglón: formaDePagoDocumento().etiqueta).
 * - Con anticipo (la COT): los textos y la precedencia de pdf_documento._texto_anticipo_cotizacion (nota del
 *   controlador después de T9): manual -> 'Anticipo acordado: 50% ($X). Saldo: $Y.'; >= 100% -> 'Pagas el 100% ($X)
 *   antes de que procesemos el pedido.'; > 0% -> 'Anticipo del 60% ($X) para confirmar el pedido. Saldo: $Y.'; 0% ->
 *   'Sin anticipo. Total a pagar: $X.' (totales.total; sin totales, anticipo + saldo). Con saldo a favor agrega 'Ya
 *   tienes $Z a favor de un pedido anterior: te falta pagar $W de anticipo.'. Sin % numérico, ''.
 * - Sin anticipo (pago.anticipo None, la SC): los textos de U17 para 100, 60, 0 y modalidad no reconocida (R24).
 * @param {unknown} pago
 * @param {unknown} [totales]
 * @returns {string}
 */
export function textoFormaPago(pago, totales) {
  if (!esObjeto(pago)) return '';
  if (pago.anticipo === null || pago.anticipo === undefined) return textoFormaPagoSolicitud(pago);
  const pct = pago.anticipo_pct;
  if (!esNumero(pct)) return '';
  let texto;
  if (pago.manual === true) {
    texto = `Anticipo acordado: ${formatoPct(pct)} (${pesos(pago.anticipo)}). Saldo: ${pesos(pago.saldo)}.`;
  } else if (pct >= 100) {
    texto = `Pagas el 100% (${pesos(pago.anticipo)}) antes de que procesemos el pedido.`;
  } else if (pct > 0) {
    texto = `Anticipo del ${formatoPct(pct)} (${pesos(pago.anticipo)}) para confirmar el pedido. Saldo: ${pesos(pago.saldo)}.`;
  } else {
    const total = esObjeto(totales) ? totales.total
      : (esNumero(pago.anticipo) && esNumero(pago.saldo) ? pago.anticipo + pago.saldo : null);
    texto = `Sin anticipo. Total a pagar: ${pesos(total)}.`;
  }
  if (positivo(pago.saldo_a_favor)) {
    texto += ` Ya tienes ${pesos(pago.saldo_a_favor)} a favor de un pedido anterior: te falta pagar `
      + `${pesos(pago.anticipo_por_pagar)} de anticipo.`;
  }
  return texto;
}

/**
 * La sección 'Forma de pago' del documento, como el PDF: {etiqueta (la modalidad con etiquetaModalidad, p. ej.
 * 'Crédito 30 días'), texto (textoFormaPago; '' en el pedido, que muestra sus pagos), instrucciones (datos para
 * pagar, con sus saltos de línea)}, o null sin pago.
 * @param {unknown} doc
 * @returns {{etiqueta: string, texto: string, instrucciones: string | null} | null}
 */
export function formaDePagoDocumento(doc) {
  if (!esObjeto(doc) || !esObjeto(doc.pago)) return null;
  const pago = doc.pago;
  return {
    etiqueta: etiquetaModalidad(textoONull(pago.modalidad)),
    texto: doc.tipo === 'PVEN' ? '' : textoFormaPago(pago, doc.totales),
    instrucciones: textoONull(pago.instrucciones),
  };
}

// ─── Colores ────────────────────────────────────────────────────────────────────────────────────────────────────

const BLANCO = '#FFFFFF';
const OSCURO = '#111827';
const HEX = /^#[0-9A-Fa-f]{6}$/;

/** Luminancia relativa (WCAG 2) de un '#RRGGBB'. */
function luminancia(hex) {
  const canal = (i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);
}

const contraste = (a, b) => {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

/**
 * El color del texto que va encima de los colores dados (la franja degradada, el bloque del TOTAL): '#FFFFFF' u
 * '#111827', el de mayor contraste mínimo frente a todos; en empate, blanco. Los valores que no son '#RRGGBB' no
 * cuentan; sin ninguno válido, blanco. Es la misma regla de correo_documento.color_texto_sobre (backend).
 * @param {...unknown} colores
 * @returns {string}
 */
export function colorTextoSobre(...colores) {
  const validos = colores.flat().filter((c) => typeof c === 'string' && HEX.test(c));
  if (validos.length === 0) return BLANCO;
  const minimo = (texto) => Math.min(...validos.map((c) => contraste(texto, c)));
  return minimo(BLANCO) >= minimo(OSCURO) ? BLANCO : OSCURO;
}

/**
 * B3 T15: los colores del botón principal de la página del cliente ('Confirmar solicitud', 'Confirmar cotización',
 * 'Enviar cambios'), con la marca: en la variante 'degradado' (la SC) el degradado principal -> secundario; en
 * cualquier otra ('acento', la COT y el PVEN) el color de acento. texto es el que se lee encima (colorTextoSobre). Sin
 * marca, los colores de la referencia (normalizarMarca): nunca un color interno.
 * @param {unknown} marca
 * @param {unknown} variante
 * @returns {{fondo: string, texto: string}} fondo es un valor para la propiedad CSS background
 */
export function coloresBotonPrincipal(marca, variante) {
  const { principal, secundario, acento } = normalizarMarca(marca).colores;
  if (variante === 'degradado') {
    return { fondo: `linear-gradient(90deg, ${principal}, ${secundario})`, texto: colorTextoSobre(principal, secundario) };
  }
  return { fondo: acento, texto: colorTextoSobre(acento) };
}

/**
 * Un color de la marca usado como texto sobre la hoja blanca (el título en color de acento): el mismo si se lee
 * (contraste de al menos 3:1, texto grande), si no '#111827'.
 * @param {unknown} hex
 * @returns {string}
 */
export function colorSobreBlanco(hex) {
  return typeof hex === 'string' && HEX.test(hex) && contraste(hex, BLANCO) >= 3 ? hex.toUpperCase() : OSCURO;
}

// ─── Enlaces y contacto ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * La URL si es http(s) completa con dominio, sin espacios y sin credenciales (nunca javascript:, data: ni otro esquema
 * en un href, ni 'https://mitienda.com@evil.com', que lleva a evil.com), o null.
 * @param {unknown} url
 * @returns {string | null}
 */
export function enlaceSeguro(url) {
  if (typeof url !== 'string') return null;
  const t = url.trim();
  if (!/^https?:\/\//i.test(t) || /\s/.test(t)) return null;
  try {
    const u = new URL(t);
    if (u.username || u.password) return null;
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname ? t : null;
  } catch {
    return null;
  }
}

/**
 * El saludo de WhatsApp del cliente: 'Hola, te escribo por la solicitud SC-….' ('la cotización', 'el pedido'); '' sin
 * número.
 * @param {unknown} tipo
 * @param {unknown} numero
 * @returns {string}
 */
export function mensajeWhatsAppDocumento(tipo, numero) {
  const n = textoONull(numero);
  if (!n) return '';
  const t = tieneTipo(tipo) ? TIPOS_DOCUMENTO[/** @type {'SC'|'COT'|'PVEN'} */ (tipo)] : TIPOS_DOCUMENTO.SC;
  return `Hola, te escribo por ${t.articulo} ${t.nombre} ${n}.`;
}

/**
 * Los contactos de la empresa, en el orden del pie del correo y del PDF (empresa.contacto_empresa): teléfono (tel:),
 * WhatsApp (waUrl de lib/whatsapp.js, con el saludo opcional), correo (mailto:) y página web (solo http(s), con
 * enlaceSeguro). Solo los que tienen un enlace válido: nunca un href inseguro. externo = abre en otra pestaña.
 * @param {unknown} marca
 * @param {string} [textoWhatsApp]
 * @returns {ContactoEmpresa[]}
 */
export function contactosEmpresa(marca, textoWhatsApp) {
  const m = normalizarMarca(marca);
  /** @type {ContactoEmpresa[]} */
  const lista = [];
  const telefono = m.telefono.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
  if (/\d{7,}/.test(telefono)) {
    lista.push({ tipo: 'telefono', etiqueta: 'Llamar', texto: m.telefono, href: `tel:${telefono}`, externo: false });
  }
  const wa = m.whatsapp ? waUrl(m.whatsapp, textoWhatsApp || undefined) : null;
  if (wa) lista.push({ tipo: 'whatsapp', etiqueta: 'WhatsApp', texto: m.whatsapp, href: wa, externo: true });
  if (correoValido(m.correo)) {
    lista.push({ tipo: 'correo', etiqueta: 'Correo', texto: m.correo,
      href: `mailto:${encodeURIComponent(m.correo).replace(/%40/g, '@')}`, externo: false });
  }
  const web = enlaceSeguro(m.sitio_web);
  if (web) {
    lista.push({ tipo: 'web', etiqueta: 'Página web', texto: web.replace(/^https?:\/\//i, '').replace(/\/$/, ''),
      href: web, externo: true });
  }
  return lista;
}

// ─── Pagos del pedido (U23, RP25) ───────────────────────────────────────────────────────────────────────────────

/**
 * El resumen de pagos del pedido que ve el cliente: un ADAPTADOR de resumenPagoPedido (resumen-pago.js, el mismo
 * Resumen Financiero del asesor) con el mapeo de RP25: total_cop = totales.total, saldo_cop = pago.saldo,
 * anticipo_requerido = pago.anticipo, anticipo_pendiente = pago.anticipo_por_pagar, anticipo_pct = pago.anticipo_pct.
 * Suma pagos (cada uno con su concepto, como lo manda el servidor, el método, la fecha en palabras, el monto y el
 * detalle 'Transferencia bancaria · 3 de octubre de 2026') y avisoAnticipo ('Anticipo pendiente: $X' si falta
 * anticipo, R4; si no, null).
 * @param {unknown} pago
 * @param {unknown} totales
 */
export function resumenPagosCliente(pago, totales) {
  const p = esObjeto(pago) ? pago : {};
  const t = esObjeto(totales) ? totales : {};
  const resumen = resumenPagoPedido({ total_cop: t.total, saldo_cop: p.saldo, anticipo_requerido: p.anticipo,
    anticipo_pendiente: p.anticipo_por_pagar, anticipo_pct: p.anticipo_pct });
  const pagos = (Array.isArray(p.pagos) ? p.pagos : []).filter(esObjeto).map((x) => {
    const metodo = textoONull(x.metodo);
    const fecha = fechaLarga(x.fecha);
    return { concepto: textoONull(x.concepto) ?? 'Pago', metodo, fecha, monto: redondearPeso(x.monto),
      detalle: [metodo, fecha].filter(Boolean).join(' · ') };
  });
  const pendiente = resumen.anticipoPendiente;
  return { ...resumen, pagos,
    avisoAnticipo: pendiente !== null && pendiente > 0 ? `Anticipo pendiente: ${formatoPesos(pendiente)}` : null };
}

/**
 * La línea del enlace del cliente bajo el Resumen Financiero del pedido (U23), con el enlace_cliente de get_pedido
 * ({vigente, enviado_at ('…Z'), vence_at ('…Z', el instante en que deja de servir), vence ('AAAA-MM-DD', el último
 * día)}): 'Enviado al cliente el 3 de octubre de 2026 · el enlace sirve hasta el 2 de noviembre de 2026'; si ya no
 * sirve (o venció con la página abierta), 'El enlace del cliente venció: reenvíaselo'; si nunca se envió, null.
 * r1: con el pedido CANCELADO, null: el backend da vigente False también cuando revocó el enlace al cancelar, y un
 * pedido cancelado no se puede reenviar (el botón se oculta y /pedido-cliente/ver lo rechaza).
 * @param {unknown} enlace
 * @param {string | null} [estadoDelPedido] el estado del PVEN ('CANCELADO'…); sin él, no se mira
 * @param {Date | number} [ahora]
 * @returns {string | null}
 */
export function textoEnlaceVigente(enlace, estadoDelPedido = null, ahora = new Date()) {
  if (!esObjeto(enlace) || estadoDelPedido === 'CANCELADO') return null;
  const venceAt = typeof enlace.vence_at === 'string' ? new Date(comoUTC(enlace.vence_at)).getTime() : NaN;
  const referencia = ahora instanceof Date ? ahora.getTime() : Number(ahora);
  const vigente = enlace.vigente === true && !(Number.isFinite(venceAt) && venceAt <= referencia);
  if (vigente) {
    const ultimoDia = fechaSolo(enlace.vence) || (Number.isFinite(venceAt) ? fechaLarga(new Date(venceAt - 1)) : '');
    const enviado = fechaLarga(enlace.enviado_at);
    const sirve = ultimoDia ? `el enlace sirve hasta el ${ultimoDia}` : 'el enlace está vigente';
    return enviado ? `Enviado al cliente el ${enviado} · ${sirve}` : sirve.charAt(0).toUpperCase() + sirve.slice(1);
  }
  return enlace.enviado_at || enlace.vigente === true ? 'El enlace del cliente venció: reenvíaselo' : null;
}

// ─── Pequeños textos del documento ─────────────────────────────────────────────────────────────────────────────

/**
 * La entrega estimada en palabras ('21 de octubre de 2026', sin corrimiento de día); en la SC con la aclaración de U17
 * '(aproximada; la fecha final llega en la cotización)'. '' sin fecha.
 * @param {unknown} doc
 * @returns {string}
 */
export function textoEntregaEstimada(doc) {
  const fecha = esObjeto(doc) ? fechaSolo(doc.fecha_entrega_estimada) : '';
  if (!fecha) return '';
  return doc.tipo === 'SC' ? `${fecha} (aproximada; la fecha final llega en la cotización)` : fecha;
}

/**
 * La cantidad como la escribe el documento (y el PDF): '2', '2,5'. '' si no es un número.
 * @param {unknown} v
 * @returns {string}
 */
export function formatoCantidad(v) {
  return esNumero(v) ? String(v).replace('.', ',') : '';
}

/**
 * B3 T15 (U17): el 'Total de unidades' de la pastilla de la solicitud, la suma de documento.lineas[].cantidad
 * (total_unidades no es clave del contrato, R24). Solo cuenta las cantidades que son números de JSON (como
 * normalizarDocumento) y redondea a milésimas (sin el 0,30000000000000004 de la coma flotante). null si ninguna línea
 * trae cantidad: la página no pinta la pastilla.
 * @param {unknown} doc
 * @returns {number | null}
 */
export function totalUnidades(doc) {
  const cantidades = (esObjeto(doc) && Array.isArray(doc.lineas) ? doc.lineas : [])
    .filter(esObjeto).map((l) => l.cantidad).filter(esNumero);
  if (cantidades.length === 0) return null;
  return Math.round(cantidades.reduce((a, b) => a + b, 0) * 1000) / 1000;
}

/**
 * El título de la pestaña (fijarTitulo): 'Cotización COT-… · Empresa'; sin nombre de empresa, solo el documento.
 * @param {unknown} doc
 * @param {unknown} marca
 * @returns {string}
 */
export function tituloDePestana(doc, marca) {
  const d = esObjeto(doc) ? doc : {};
  const documento = [textoONull(d.titulo), textoONull(d.numero)].filter(Boolean).join(' ');
  return [documento, normalizarMarca(marca).nombre_comercial].filter(Boolean).join(' · ');
}

// ─── Documentos de ejemplo (vista previa de Configuración y pruebas) ───────────────────────────────────────────

const congelar = (v) => {
  if (v !== null && typeof v === 'object') {
    Object.values(v).forEach(congelar);
    Object.freeze(v);
  }
  return v;
};

/**
 * Una solicitud DEMO con la forma exacta de documento_sc: sin precios ni totales, pago con la modalidad y el % (sin
 * montos ni datos para pagar), solo la «Nota para el cliente» (R3). Inmutable.
 * @type {Readonly<DocumentoCliente>}
 */
export const DOCUMENTO_EJEMPLO_SC = congelar({
  tipo: 'SC', titulo: 'Solicitud', numero: 'SC-DEMO-0001', estado: 'PENDIENTE_CONFIRMACION',
  fecha_emision: '2026-10-02T15:30:00Z', fecha_entrega_estimada: '2026-10-21',
  cliente: { nombre: 'Cliente DEMO', direccion_entrega: 'Calle DEMO 12 # 34-56, Bogotá' },
  atendido_por: 'Asesor DEMO', con_precios: false,
  lineas: [
    { n: 1, descripcion: 'Pintura vinilo blanca DEMO, galón', cantidad: 4, precio_unitario: null, total_linea: null,
      iva_etiqueta: null, iva_pct: null, anticipo: null },
    { n: 2, descripcion: 'Rodillo antigoteo DEMO de 9 pulgadas con extensión', cantidad: 2, precio_unitario: null,
      total_linea: null, iva_etiqueta: null, iva_pct: null, anticipo: null },
  ],
  totales: null,
  pago: { modalidad: '60/40 (60% anticipo - 40% pendiente)', anticipo_pct: 60, anticipo: null, saldo: null,
    saldo_a_favor: null, anticipo_por_pagar: null, pagado: null, pagos: null, instrucciones: null, manual: false },
  notas: [{ titulo: 'Nota para el cliente', texto: 'Texto DEMO de la nota para el cliente.\nSegunda línea DEMO.' }],
  valida_hasta: null, terminos: null, mensaje_pie: 'Mensaje de pie DEMO.',
});

/**
 * Una cotización DEMO con la forma exacta de documento_cot: IVA 19% discriminado, 60/40, anticipo por línea (U19) y
 * cuentas que cuadran (total = subtotal − descuento + IVA). Inmutable.
 * @type {Readonly<DocumentoCliente>}
 */
export const DOCUMENTO_EJEMPLO_COT = congelar({
  tipo: 'COT', titulo: 'Cotización', numero: 'COT-DEMO-0001', estado: 'PENDIENTE_CONFIRMACION',
  fecha_emision: '2026-10-03T14:00:00Z', fecha_entrega_estimada: '2026-10-21',
  cliente: { nombre: 'Cliente DEMO', direccion_entrega: 'Calle DEMO 12 # 34-56, Bogotá' },
  atendido_por: 'Asesor DEMO', con_precios: true,
  lineas: [
    { n: 1, descripcion: 'Pintura vinilo blanca DEMO, galón', cantidad: 2, precio_unitario: 342462, total_linea: 684924,
      iva_etiqueta: 'IVA 19%', iva_pct: 19, anticipo: 489036 },
    { n: 2, descripcion: 'Rodillo antigoteo DEMO de 9 pulgadas con extensión', cantidad: 4, precio_unitario: 117000,
      total_linea: 468000, iva_etiqueta: 'IVA 19%', iva_pct: 19, anticipo: 334152 },
  ],
  totales: { subtotal: 1152924, descuento_pct: 0, descuento: 0,
    impuestos: [{ etiqueta: 'IVA 19%', base: 1152924, valor: 219056 }], ajuste_redondeo: null, total: 1371980 },
  pago: { modalidad: '60/40 (60% anticipo - 40% pendiente)', anticipo_pct: 60, anticipo: 823188, saldo: 548792,
    saldo_a_favor: 0, anticipo_por_pagar: 823188, pagado: null, pagos: null,
    instrucciones: 'Banco DEMO · Cuenta de ahorros 000-000000-00\nTitular: Empresa DEMO S.A.S.', manual: false },
  notas: [
    { titulo: 'Nota para el cliente', texto: 'Texto DEMO de la nota para el cliente.' },
    { titulo: 'Notas', texto: 'Texto DEMO de las notas de la cotización.' },
  ],
  valida_hasta: '2026-10-08', terminos: 'Términos y condiciones DEMO de la cotización.',
  mensaje_pie: 'Mensaje de pie DEMO.',
});

/**
 * El documento de la vista previa de «Diseño de documentos» (T14): DOCUMENTO_EJEMPLO_COT o DOCUMENTO_EJEMPLO_SC con los
 * textos del formulario todavía sin guardar, donde los pone el servidor (empresa.textos_documento y documento_cliente):
 * la solicitud solo lleva el mensaje de pie; la cotización, además, sus términos (terminos_cotizacion) y los datos para
 * pagar (pago.instrucciones). Un texto vacío no aparece (null), como en el documento real, aunque el ejemplo DEMO traiga
 * uno. Devuelve una copia: los ejemplos no cambian.
 * @param {'SC' | 'COT'} tipo cualquier otro valor da la solicitud
 * @param {unknown} textos los valores del formulario ({terminos_cotizacion, instrucciones_pago, mensaje_pie, ...})
 * @returns {DocumentoCliente}
 */
export function documentoVistaPrevia(tipo, textos) {
  const t = esObjeto(textos) ? textos : {};
  const mensajePie = textoONull(t.mensaje_pie);
  if (tipo === 'COT') {
    return {
      ...DOCUMENTO_EJEMPLO_COT,
      terminos: textoONull(t.terminos_cotizacion),
      pago: { ...DOCUMENTO_EJEMPLO_COT.pago, instrucciones: textoONull(t.instrucciones_pago) },
      mensaje_pie: mensajePie,
    };
  }
  return { ...DOCUMENTO_EJEMPLO_SC, mensaje_pie: mensajePie };
}
