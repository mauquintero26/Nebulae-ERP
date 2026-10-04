/**
 * Enlaces de WhatsApp (H5). JS plano para probarlo con node (frontend/tests/test_whatsapp.mjs), como busqueda.js.
 *
 * wa.me necesita el numero con indicativo de pais y sin simbolos. Los telefonos se guardan de muchas formas
 * ('300 123 4567', '+57 300…', '0057…'): se dejan solo los digitos, se quita un '00' inicial y a un numero
 * colombiano de 10 digitos se le antepone 57. Si ya trae el 57 (o otro indicativo) queda igual: nunca '5757…'.
 */

/** Numero para wa.me ('573001234567'), o null si el telefono no tiene digitos. */
export function numeroWhatsApp(telefono) {
  let d = String(telefono ?? '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (!d) return null;
  return d.length === 10 ? '57' + d : d;
}

/** 'https://wa.me/57…' con el texto opcional ya codificado, o null si no hay numero (no se muestra el boton). */
export function waUrl(telefono, texto) {
  const n = numeroWhatsApp(telefono);
  if (!n) return null;
  return `https://wa.me/${n}` + (texto ? `?text=${encodeURIComponent(texto)}` : '');
}
