/**
 * Dinero de la cotizacion y del pedido en pantalla: anticipo (H36+H43, R3), verificacion del pago al crear el pedido
 * (N1, R4, R6), pagos del pedido y su orden de pago (H44+N6, H45). JS plano para probarlo con node
 * (frontend/tests/test_dinero_ventas.mjs), como pricing.js y pesos.js.
 *
 * El servidor es la autoridad (backend/app/core/ventas_dinero.py y convertir_cotizacion_a_venta): aqui solo se
 * muestran sus cuentas y se valida lo mismo antes de enviar, para que el boton no se habilite con datos que van a
 * dar 422. Todo en pesos enteros (pesos.js).
 */
import { redondearPeso, formatoPesos } from './pesos.js';
import { pedidoVigente } from './listas-ventas.js';
import { humanizarCodigo } from './estados-pedido.js';

const esObjeto = (v) => v !== null && typeof v === 'object';
const texto = (v) => (typeof v === 'string' ? v.trim() : v === null || v === undefined ? '' : String(v).trim());

/**
 * N1: medios con que se verifica el anticipo, en el mismo orden y con los mismos nombres que
 * METODOS_PAGO_ANTICIPO del servidor (la prueba lo compara con ventas_dinero.py). 'TRASLADO' no esta: lo pone el
 * servidor al trasladar un saldo a favor (R6). Inmutable.
 * @type {ReadonlyArray<string>}
 */
export const METODOS_PAGO_ANTICIPO = Object.freeze(['Transferencia bancaria', 'Consignación', 'Efectivo', 'Tarjeta',
  'Nequi', 'Daviplata', 'PSE', 'Otro']);

// Un % con a lo sumo 2 decimales, en centesimas enteras (toPrecision quita el ruido binario: 12.345 * 100).
const centesimas = (pct) => {
  const n = Number(pct);
  return Number.isFinite(n) ? Math.round(Number((n * 100).toPrecision(12))) : 0;
};

/** '60%', '100%', '12,5%', '66,67%' (coma decimal, maximo 2 decimales), como formato_pct del servidor. */
export function formatoPct(pct) {
  const c = centesimas(pct);
  const abs = Math.abs(c);
  const entero = Math.floor(abs / 100);
  const decimales = String(abs % 100).padStart(2, '0').replace(/0+$/, '');
  return `${c < 0 ? '-' : ''}${entero}${decimales ? `,${decimales}` : ''}%`;
}

/** round(total x pct / 100) al peso (half-up) sobre el total ya redondeado: anticipo_requerido del servidor, exacto. */
export function porcentajeDePesos(total, pct) {
  const x = redondearPeso(total) * centesimas(pct); // pesos x centesimas de %: entero exacto
  return x <= 0 ? 0 : Math.floor((x + 5000) / 10000);
}

/** 'AAAA-MM-DD' de hoy en la hora local (el maximo de la fecha del pago). */
export function hoyLocal(d = new Date()) {
  const dos = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

// ─── Anticipo de la cotizacion (H36+H43, R3) ─────────────────────────────────────────────────────────

const esManual = (cot) => cot?.anticipo_pct_manual !== null && cot?.anticipo_pct_manual !== undefined;

/** '60% · 60/40 (…)', '50% · manual', '60% · sin solicitud' o '60% · solicitud sin modalidad'. */
export function etiquetaAnticipoCotizacion(cot) {
  const pct = formatoPct(cot?.anticipo_pct ?? 60);
  if (esManual(cot)) return `${pct} · manual`;
  if (!cot?.sc_id) return `${pct} · sin solicitud`;
  const modalidad = texto(cot.sc_modalidad_pago);
  return `${pct} · ${modalidad || 'solicitud sin modalidad'}`;
}

/** De donde sale el anticipo, para una frase: 'Modalidad Contado', 'Anticipo manual de 50%', 'Cotización sin solicitud'. */
export function origenAnticipo(cot) {
  if (esManual(cot)) return `Anticipo manual de ${formatoPct(cot.anticipo_pct_manual)}`;
  if (!cot?.sc_id) return 'Cotización sin solicitud';
  const modalidad = texto(cot.sc_modalidad_pago);
  return modalidad ? `Modalidad ${modalidad}` : 'Solicitud sin modalidad de pago';
}

/**
 * Lo que muestra la cotizacion junto al total.
 * - Sin pedido vigente: el anticipo que exige HOY (anticipo_requerido del GET, no el anticipo_cop guardado, que puede
 *   estar viejo) y el saldo = total - requerido; `manual` = {pct, nota} si el anticipo se ajusto a mano (R3).
 * - Ya convertida (tiene pedido vigente): los valores DEL PEDIDO (su % guardado, lo pagado y el saldo), porque el GET
 *   recalcula el anticipo con la modalidad de hoy y ese ya no es el trato. `pendiente` = anticipo que falta (R4).
 */
export function resumenAnticipoCotizacion(cot) {
  const pven = pedidoVigente(cot);
  if (pven) {
    const pct = pven.anticipo_pct ?? 60; // sin snapshot: 60, como anticipo_del_pedido del servidor
    const requerido = porcentajeDePesos(pven.total_cop, pct);
    const pagado = redondearPeso((Number(pven.total_cop) || 0) - (Number(pven.saldo_cop) || 0));
    return {
      convertida: true, pedido: pven, pct: Number(pct), etiqueta: `${formatoPct(pct)} · pedido ${pven.numero}`,
      requerido, saldo: redondearPeso(pven.saldo_cop), pagado, pendiente: Math.max(0, requerido - pagado), manual: null,
    };
  }
  const total = redondearPeso(cot?.total_cop);
  const requerido = redondearPeso(cot?.anticipo_requerido ?? cot?.anticipo_cop);
  return {
    convertida: false, pedido: null, pct: Number(cot?.anticipo_pct ?? 60), etiqueta: etiquetaAnticipoCotizacion(cot),
    requerido, saldo: total - requerido, pagado: null, pendiente: null,
    manual: esManual(cot) ? { pct: Number(cot.anticipo_pct_manual), nota: texto(cot.anticipo_manual_nota) } : null,
  };
}

const MENSAJE_PCT_MANUAL = 'El anticipo manual debe ser un porcentaje entre 0% y 100%.';
const MENSAJE_NOTA_MANUAL = 'Escribe una nota de al menos 5 caracteres que explique el anticipo manual.';

/**
 * R3: valida el ajuste manual antes del PATCH (los mismos mensajes del 422 del servidor). Acepta coma decimal.
 * @returns {{pct: number | null, nota: string, error: string | null}}
 */
export function validarAjusteAnticipo(pctTexto, nota) {
  const t = texto(pctTexto).replace(',', '.');
  const pct = t === '' ? NaN : Number(t);
  const n = texto(nota);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return { pct: null, nota: n, error: MENSAJE_PCT_MANUAL };
  if (n.length < 5) return { pct, nota: n, error: MENSAJE_NOTA_MANUAL };
  return { pct, nota: n, error: null };
}

// ─── Verificacion del pago al crear el pedido (N1, R4, R6) ──────────────────────────────────────────

/**
 * Cuentas del modal con los datos del GET de la cotizacion: total, requerido, saldo a favor de pedidos cancelados de
 * esta misma cotizacion (hasta el total), lo que falta verificar y el maximo que se puede registrar (el pago mas el
 * saldo a favor no pasan del total). Igual que convertir_cotizacion_a_venta.
 * @returns {{total: number, requerido: number, saldoAFavor: number, porVerificar: number, maximo: number,
 *   saldos: Array<{numero: string, monto: number}>}}
 */
export function cuentaVerificacion(cot) {
  const total = redondearPeso(cot?.total_cop);
  const requerido = redondearPeso(cot?.anticipo_requerido ?? cot?.anticipo_cop);
  const saldoAFavor = Math.min(Math.max(0, redondearPeso(cot?.saldo_a_favor)), total);
  const porVerificar = cot?.anticipo_por_verificar !== null && cot?.anticipo_por_verificar !== undefined
    ? Math.max(0, redondearPeso(cot.anticipo_por_verificar))
    : Math.max(0, requerido - saldoAFavor);
  const saldos = (Array.isArray(cot?.saldo_a_favor_detalle) ? cot.saldo_a_favor_detalle : [])
    .filter(esObjeto).map((s) => ({ numero: s.pven_numero, monto: redondearPeso(s.monto) }));
  return { total, requerido, saldoAFavor, porVerificar, maximo: Math.max(0, total - saldoAFavor), saldos };
}

/**
 * Monto en pesos escrito a mano, como se escribe en Colombia: '1.500.000', '$1.500.000', '1 500 000' o con coma
 * decimal '1.500.000,50' (se redondea al peso). Un punto que no agrupa de a 3 cifras ('600000.4') se toma como decimal.
 * Un numero se devuelve redondeado. null si esta vacio o no es un monto.
 * @returns {number | null}
 */
export function montoDesdeTexto(valor) {
  if (typeof valor === 'number') return Number.isFinite(valor) ? redondearPeso(valor) : null;
  let t = texto(valor).replace(/[$\s]/g, '');
  if (!t) return null;
  if (t.includes(',')) {
    const [entero, ...resto] = t.split(',');
    if (resto.length !== 1 || !/^-?(\d+|\d{1,3}(\.\d{3})+)$/.test(entero)) return null;
    t = `${entero.replace(/\./g, '')}.${resto[0]}`;
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, '');
  }
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return redondearPeso(t);
}

/**
 * Valida el formulario del modal. `errores`: lo que esta mal y se muestra; `pendientes`: lo que falta llenar (solo
 * deja el boton deshabilitado; la pantalla los lista). `monto` es lo que se entendio de lo escrito (montoDesdeTexto),
 * para mostrarlo bajo el campo. R4: un pago menor que lo que falta es `parcial` y exige `confirmoParcial`; `deuda` es
 * el anticipo que el pedido quedara debiendo.
 * form: {monto, metodo, referencia, fecha ('AAAA-MM-DD' o ''), confirmoRevision, confirmoParcial}
 */
export function evaluarVerificacion(cuenta, form, hoy = hoyLocal()) {
  const errores = [];
  const pendientes = [];
  const montoTexto = texto(form?.monto);
  const leido = montoDesdeTexto(form?.monto);
  const monto = leido ?? 0;
  if (montoTexto === '') pendientes.push('el monto recibido');
  else if (leido === null) errores.push('Escribe el monto en pesos, por ejemplo 1.500.000.');
  else if (!(monto > 0)) errores.push('El monto recibido debe ser mayor que $0.');
  else if (monto > cuenta.maximo) {
    errores.push(cuenta.saldoAFavor > 0
      ? `El pago (${formatoPesos(monto)}) más el saldo a favor (${formatoPesos(cuenta.saldoAFavor)}) supera el total del pedido (${formatoPesos(cuenta.total)}).`
      : `El pago (${formatoPesos(monto)}) supera el total del pedido (${formatoPesos(cuenta.total)}).`);
  }
  const metodo = texto(form?.metodo);
  if (!metodo) pendientes.push('el método de pago');
  else if (!METODOS_PAGO_ANTICIPO.includes(metodo)) errores.push('Elige un método de pago de la lista.');
  const referencia = texto(form?.referencia);
  if (!referencia) pendientes.push('la referencia');
  else if (referencia.length < 3) {
    errores.push('La referencia debe tener al menos 3 caracteres (en efectivo, el número de recibo).');
  }
  const fecha = texto(form?.fecha);
  if (fecha && fecha > hoy) errores.push('La fecha del pago no puede ser posterior a hoy.');
  if (!form?.confirmoRevision) pendientes.push('la casilla de revisión');
  const parcial = monto > 0 && monto < cuenta.porVerificar;
  const deuda = parcial ? cuenta.porVerificar - monto : 0;
  if (parcial && !form?.confirmoParcial) pendientes.push('la casilla del pago parcial');
  return { monto, parcial, deuda, errores, pendientes, valido: errores.length === 0 && pendientes.length === 0 };
}

/** El `verificacion_anticipo` que espera POST /cotizaciones/{id}/confirmar (sin fecha, el servidor pone hoy). */
export function verificacionParaEnviar(form) {
  const v = { monto: montoDesdeTexto(form?.monto) ?? 0, metodo_pago: texto(form?.metodo), referencia: texto(form?.referencia) };
  const fecha = texto(form?.fecha);
  if (fecha) v.fecha_pago = fecha;
  return v;
}

// ─── Pagos del pedido ───────────────────────────────────────────────────────────────────────────────

const TIPOS_PAGO = Object.freeze({
  ANTICIPO: 'Anticipo', ABONO: 'Abono', PAGO_TOTAL: 'Pago total', PAGO_SALDO: 'Pago del saldo',
  DEVOLUCION: 'Devolución', REVERSION: 'Reversión', AJUSTE_AUTORIZADO: 'Ajuste autorizado',
});
const ESTADOS_PAGO = Object.freeze({
  CONFIRMADO: 'Confirmado', REVERTIDO: 'Revertido', ANULADO: 'Anulado', TRASLADADO: 'Trasladado a otro pedido',
});
// Metodos que pone el servidor (R6 y el pago automatico anterior a N1).
const METODOS_DEL_SISTEMA = Object.freeze({
  TRASLADO: 'Saldo a favor trasladado',
  SALDO_A_FAVOR: 'Saldo a favor del cliente',
  CONVERSION_COTIZACION: 'Registrado automáticamente',
});
const METODO_SIN_VERIFICAR = 'CONVERSION_COTIZACION';

export function etiquetaTipoPago(t) {
  return TIPOS_PAGO[t] || humanizarCodigo(t) || 'Pago';
}

export function etiquetaEstadoPago(e) {
  return ESTADOS_PAGO[e] || humanizarCodigo(e);
}

/** Los 8 medios tal cual; TRASLADO / SALDO_A_FAVOR / CONVERSION_COTIZACION con su nombre; otro CODIGO humanizado. */
export function etiquetaMetodoPago(m) {
  const t = texto(m);
  if (!t) return 'Sin método';
  if (METODOS_PAGO_ANTICIPO.includes(t)) return t;
  if (METODOS_DEL_SISTEMA[t]) return METODOS_DEL_SISTEMA[t];
  return /^[A-Z0-9_]+$/.test(t) ? humanizarCodigo(t) : t;
}

/**
 * Un renglon del libro de pagos del pedido: {titulo: 'Anticipo $600.000', partes: ['Transferencia bancaria',
 * 'ref. X', 'verificado por y'], estado: etiqueta si no esta CONFIRMADO, sinVerificar: pago automatico anterior a N1}.
 * La fecha la formatea la pantalla.
 */
export function describirPago(p) {
  const metodo = texto(p?.metodo_pago);
  const partes = [etiquetaMetodoPago(metodo)];
  const ref = texto(p?.referencia_bancaria);
  if (ref) partes.push(metodo === 'TRASLADO' ? `desde ${ref}` : `ref. ${ref}`);
  const usuario = texto(p?.usuario);
  if (usuario) partes.push(`${METODOS_PAGO_ANTICIPO.includes(metodo) ? 'verificado' : 'registrado'} por ${usuario}`);
  return {
    titulo: `${etiquetaTipoPago(p?.tipo)} ${formatoPesos(p?.monto)}`,
    partes,
    estado: p?.estado && p.estado !== 'CONFIRMADO' ? etiquetaEstadoPago(p.estado) : null,
    sinVerificar: metodo === METODO_SIN_VERIFICAR,
  };
}

// ─── Orden de pago del pedido (H44+N6, H45) ─────────────────────────────────────────────────────────

const ESTADOS_PXP = Object.freeze({ PENDIENTE: 'Pendiente', PAGADA: 'Pagada', CANCELADA: 'Cancelada' });

export function etiquetaEstadoPxp(e) {
  return ESTADOS_PXP[e] || humanizarCodigo(e);
}

/** Chip de la PXP vigente: 'PXP: X · Pendiente · pendiente $Y'; lo pendiente solo mientras esta PENDIENTE. */
export function textoChipPxp(pxp) {
  const base = `PXP: ${pxp?.numero || ''} · ${etiquetaEstadoPxp(pxp?.estado)}`;
  return pxp?.estado === 'PENDIENTE' ? `${base} · pendiente ${formatoPesos(pxp.monto_pendiente)}` : base;
}

/** La PXP vigente del pedido (la que no esta CANCELADA) y la cancelada mas reciente, de `pedido.pxps` (por id). */
export function pxpsDelPedido(pedido) {
  const pxps = Array.isArray(pedido?.pxps) ? pedido.pxps.filter(esObjeto) : [];
  const canceladas = pxps.filter((p) => p.estado === 'CANCELADA');
  return {
    vigente: pxps.find((p) => p.estado !== 'CANCELADA') || null,
    cancelada: canceladas.length > 0 ? canceladas[canceladas.length - 1] : null,
  };
}

/**
 * Se puede crear una orden de pago (lo mismo que exige POST /pedidos/{id}/crear-pxp): pedido no CANCELADO, con saldo
 * (al peso) y sin otra PXP vigente. El detalle trae `pxps`; una fila de la lista solo `pxp_id` (que se limpia al
 * anularla, H45). El rol lo decide puedeCrearOrdenDePago (flujo.tsx).
 */
export function pedidoAdmitePxp(p) {
  if (!esObjeto(p) || p.estado === 'CANCELADO' || !(redondearPeso(p.saldo_cop) > 0)) return false;
  return Array.isArray(p.pxps) ? pxpsDelPedido(p).vigente === null : !p.pxp_id;
}
