"""Telefonos de WhatsApp del cliente (Bloque 3, T1: U16-envio, C27, RP19 y RP20).

Modulo puro: sin base de datos ni FastAPI, y sin efectos al importarlo (T13 lo compara con el frontend corriendo node).

- numero_whatsapp(t): solo normaliza, con la misma regla que numeroWhatsApp de frontend/src/lib/whatsapp.js (H5): deja
  los digitos, quita un '00' inicial y a un numero colombiano de 10 digitos le antepone 57. No decide si es valido.
- e164_whatsapp(t): la UNICA regla que decide si un WhatsApp es valido (RP19): '+' y de 11 a 15 digitos; si no, None
  (un numero de 9 digitos no sirve). La usan el canal de envio, el envio, el seguimiento y los dicts (telefono_whatsapp).
- telefono_legible(e164): '+57 300 123 4567' para mostrarlo; otros indicativos quedan tal cual.
- telefono_del_documento(doc): el telefono crudo de una SC, COT o PVEN: el del documento o, si esta vacio, el del
  cliente por la relacion `customer` que ya existe (RP20: no recibe db). Quien lo necesite en e164 aplica e164_whatsapp.
"""
import re

_NO_DIGITO = re.compile(r"[^0-9]")  # como /\D/g de JS: solo 0-9 cuentan como digitos
E164_MIN_DIGITOS = 11
E164_MAX_DIGITOS = 15


def numero_whatsapp(telefono) -> str | None:
    """Numero para wa.me ('573001234567'), o None si el telefono no tiene digitos."""
    d = _NO_DIGITO.sub("", "" if telefono is None else str(telefono))
    if d.startswith("00"):
        d = d[2:]
    if not d:
        return None
    return "57" + d if len(d) == 10 else d


def e164_whatsapp(telefono) -> str | None:
    """'+573001234567' si el numero normalizado tiene de 11 a 15 digitos; si no, None."""
    n = numero_whatsapp(telefono)
    if n is None or not (E164_MIN_DIGITOS <= len(n) <= E164_MAX_DIGITOS):
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
    """El telefono del documento (customer_phone) o, si esta vacio, el del cliente (doc.customer.phone). Crudo."""
    propio = (getattr(doc, "customer_phone", None) or "").strip()
    if propio:
        return doc.customer_phone
    cliente = getattr(doc, "customer", None)
    del_cliente = (getattr(cliente, "phone", None) or "").strip() if cliente is not None else ""
    return cliente.phone if del_cliente else None
