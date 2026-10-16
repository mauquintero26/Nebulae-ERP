"""Telefonos de WhatsApp del cliente (Bloque 3, T1: U16-envio, C27, RP19 y RP20).

Modulo puro: sin base de datos ni FastAPI, y sin efectos al importarlo (T13 lo compara con el frontend corriendo node).

- numero_whatsapp(t): solo normaliza, con la misma regla que numeroWhatsApp de frontend/src/lib/whatsapp.js (H5): deja
  los digitos, quita un '00' inicial y a un numero colombiano de 10 digitos le antepone 57. No decide si es valido.
- e164_whatsapp(t): la UNICA regla que decide si un WhatsApp es valido (RP19): '+' y de 11 a 15 digitos, sin 0 inicial
  y, con indicativo 57, exactamente 12; si no, None (un numero de 9 digitos no sirve). La usan el canal de envio, el
  envio, el seguimiento y los dicts (telefono_whatsapp).
- telefono_legible(e164): '+57 300 123 4567' para mostrarlo; otros indicativos quedan tal cual.
- telefono_del_documento(doc): el telefono crudo de una SC, COT o PVEN: el del documento o, si esta vacio (sin
  digitos), el del cliente por la relacion `customer` que ya existe (RP20: no recibe db). Quien lo necesite en e164
  aplica e164_whatsapp.
"""
import re

_NO_DIGITO = re.compile(r"[^0-9]")  # como /\D/g de JS: solo 0-9 cuentan como digitos
E164_MIN_DIGITOS = 11
E164_MAX_DIGITOS = 15
INDICATIVO_COLOMBIA = "57"
DIGITOS_COLOMBIA = 12  # 57 + 10


def numero_whatsapp(telefono) -> str | None:
    """Numero para wa.me ('573001234567'), o None si el telefono no tiene digitos."""
    d = _NO_DIGITO.sub("", "" if telefono is None else str(telefono))
    if d.startswith("00"):
        d = d[2:]
    if not d:
        return None
    return "57" + d if len(d) == 10 else d


def e164_whatsapp(telefono) -> str | None:
    """'+573001234567' si el numero normalizado tiene de 11 a 15 digitos, no empieza en 0 (ningun indicativo E.164
    empieza en 0) y, si empieza en 57 (Colombia), tiene exactamente 12 (57 + 10). Si no, None.

    Un celular con una extension pegada ('300 123 4567 ext 12' -> 12 digitos que no empiezan en 57) pasa como numero de
    otro pais: con solo los digitos no se distingue de uno extranjero real (ruling r1 de la revision de T1)."""
    n = numero_whatsapp(telefono)
    if n is None or not (E164_MIN_DIGITOS <= len(n) <= E164_MAX_DIGITOS) or n.startswith("0"):
        return None
    if n.startswith(INDICATIVO_COLOMBIA) and len(n) != DIGITOS_COLOMBIA:
        return None
    return "+" + n


def telefono_legible(e164: str | None) -> str | None:
    """'+573001234567' -> '+57 300 123 4567'. Un numero de otro pais queda igual; None -> None."""
    if e164 is None:
        return None
    if re.fullmatch(r"\+57\d{10}", e164):
        return f"+57 {e164[3:6]} {e164[6:9]} {e164[9:]}"
    return e164


def telefono_del_documento(doc) -> str | None:
    """El telefono del documento (customer_phone) o, si esta vacio, el del cliente (doc.customer.phone). Crudo.

    «Vacio» es sin digitos: None, '', '   ' o datos viejos como 'N/A' o '-' (numero_whatsapp da None). Uno con digitos se
    queda aunque sea corto: lo escribio el asesor (ruling r1)."""
    propio = getattr(doc, "customer_phone", None)
    if numero_whatsapp(propio) is not None:
        return propio
    cliente = getattr(doc, "customer", None)
    del_cliente = getattr(cliente, "phone", None) if cliente is not None else None
    return del_cliente if numero_whatsapp(del_cliente) is not None else None
