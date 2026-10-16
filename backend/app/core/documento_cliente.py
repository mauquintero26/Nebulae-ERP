"""El documento que ve el cliente: contrato ÚNICO para la solicitud, la cotización y el pedido (Bloque 3: PLANTILLA, C2,
C4 y R24).

armar_documento(db, tipo, *, ...) devuelve SIEMPRE exactamente estas claves (CLAVES_DOCUMENTO), con los nombres de R24:
  tipo, titulo, numero, estado,
  fecha_emision ('...Z': instante UTC que el navegador pasa a Colombia), fecha_entrega_estimada ('AAAA-MM-DD'),
  cliente {nombre, direccion_entrega}, atendido_por (solo el nombre del asesor), con_precios,
  lineas [{n, descripcion, cantidad, precio_unitario, total_linea, iva_etiqueta, iva_pct, anticipo}] (CLAVES_LINEA),
  totales {subtotal, descuento_pct, descuento, impuestos [{etiqueta, base, valor}], ajuste_redondeo, total} | None,
  pago {modalidad, anticipo_pct, anticipo, saldo, saldo_a_favor, anticipo_por_pagar, pagado, pagos, instrucciones,
        manual} | None (CLAVES_PAGO; 'manual' = el anticipo lo puso el asesor a mano, nunca su nota),
  notas [{titulo, texto}], valida_hasta ('AAAA-MM-DD'), terminos, mensaje_pie.
None donde no aplica. Montos en pesos enteros (redondear_peso). La 'empresa' NO va dentro del documento: viaja al lado
en la respuesta pública (C26). terminos, pago.instrucciones y mensaje_pie salen de empresa.textos_documento y solo
viajan en respuestas con token (R8).

Aquí solo se ARMA el dict: los totales, el anticipo y el IVA los calcula quien llama (T4 desglose_documento para los
impuestos, que nunca se recalculan aquí). Los constructores documento_sc, documento_cot y documento_pven son de T5 y
llaman linea_publica + armar_documento. Sin FastAPI.
"""
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from sqlalchemy.orm import Session

from app.core import empresa
from app.core.fechas import iso_z
from app.core.ventas_dinero import redondear_peso

TITULOS = {"SC": "Solicitud", "COT": "Cotización", "PVEN": "Pedido de venta"}

CLAVES_DOCUMENTO = frozenset({
    "tipo", "titulo", "numero", "estado", "fecha_emision", "fecha_entrega_estimada", "cliente", "atendido_por",
    "con_precios", "lineas", "totales", "pago", "notas", "valida_hasta", "terminos", "mensaje_pie"})
CLAVES_CLIENTE = frozenset({"nombre", "direccion_entrega"})
# Orden de las claves de una línea (el JSON sale en este orden; la prueba de contrato compara el conjunto).
_ORDEN_LINEA = ("n", "descripcion", "cantidad", "precio_unitario", "total_linea", "iva_etiqueta", "iva_pct", "anticipo")
CLAVES_LINEA = frozenset(_ORDEN_LINEA)
_PRECIOS_LINEA = ("precio_unitario", "total_linea", "iva_etiqueta", "iva_pct", "anticipo")
CLAVES_TOTALES = frozenset({"subtotal", "descuento_pct", "descuento", "impuestos", "ajuste_redondeo", "total"})
CLAVES_IMPUESTO = frozenset({"etiqueta", "base", "valor"})
CLAVES_PAGO = frozenset({"modalidad", "anticipo_pct", "anticipo", "saldo", "saldo_a_favor", "anticipo_por_pagar",
                         "pagado", "pagos", "instrucciones", "manual"})
_MONTOS_PAGO = ("anticipo", "saldo", "saldo_a_favor", "anticipo_por_pagar", "pagado")
CLAVES_PAGO_REGISTRADO = frozenset({"concepto", "monto", "metodo", "fecha"})
CLAVES_NOTA = frozenset({"titulo", "texto"})


# ─── Conversión de valores (un dato viejo que no es un monto da None: la página del cliente no se cae) ───────────

def _monto(valor):
    """Pesos enteros como float (como el resto del API), o None si no viene o no es un monto."""
    if valor is None:
        return None
    try:
        return float(redondear_peso(valor))
    except ValueError:
        return None


def _decimal(valor):
    if valor is None or isinstance(valor, bool):
        return None
    try:
        d = Decimal(str(valor).strip())
    except InvalidOperation:
        return None
    return d if d.is_finite() else None


def _cantidad(valor):
    """int si es entera (2, '2', 2.0), float si no; None si no es un número."""
    d = _decimal(valor)
    if d is None:
        return None
    return int(d) if d == d.to_integral_value() else float(d)


def _pct(valor):
    d = _decimal(valor)
    return None if d is None else float(d)


def _texto(valor):
    """El texto sin espacios de los bordes, o None si no es texto o queda vacío."""
    if not isinstance(valor, str):
        return None
    return valor.strip() or None


def fecha_solo(valor):
    """'AAAA-MM-DD' de una fecha de calendario (date, datetime guardado o texto 'AAAA-MM-DD...'), SIN pasar a otra zona:
    la entrega estimada o la validez no se corren de día. None o texto en blanco -> None."""
    if valor is None:
        return None
    if isinstance(valor, datetime):
        return valor.date().isoformat()
    if isinstance(valor, date):
        return valor.isoformat()
    if isinstance(valor, str):
        valor = valor.strip()
        return date.fromisoformat(valor[:10]).isoformat() if valor else None
    raise TypeError(f"fecha_solo espera una fecha, no {type(valor).__name__}")


def _fecha_de_pago(valor):
    if isinstance(valor, datetime):
        return iso_z(valor)
    if isinstance(valor, date):
        return valor.isoformat()
    return _texto(valor)


# ─── Líneas ──────────────────────────────────────────────────────────────────────────────────────────────────

def _descripcion(p: dict) -> str:
    return str(p.get("product_name") or p.get("nombre") or p.get("name") or "").strip()


def _total_linea(p: dict, cantidad):
    """C4: redondear_peso(total_cop), SIN IVA y antes del descuento global (nunca total_con_iva_cop ni monto_linea con
    IVA, que solo sirve para repartir el anticipo). Sin total_cop: precio unitario x cantidad, en pesos."""
    total = _monto(p.get("total_cop"))
    if total is not None:
        return total
    precio, cantidad = _decimal(p.get("unit_price_cop")), _decimal(cantidad)
    if precio is None or cantidad is None:
        return None
    return float(redondear_peso(precio * cantidad))


def linea_publica(p, con_precio: bool, iva=None, anticipo=None) -> dict:
    """Una línea del documento a partir de una línea de productos (JSON de la SC, COT o PVEN), con LISTA BLANCA: nunca
    copia costos, margen, flete, proveedor, sku ni otro campo interno. n queda en None (lo numera armar_documento).

    Sin precio (con_precio False, la SC): solo descripción y cantidad. Con precio: precio_unitario (pesos), total_linea
    (C4: total_cop sin IVA), iva = {'etiqueta': 'IVA 19%', 'pct': 19} de la línea si el IVA está discriminado (T4/T5) y
    anticipo = su parte del anticipo (U19, repartir_anticipo_por_linea; solo en la COT, C3)."""
    p = p if isinstance(p, dict) else {}
    cantidad = p.get("qty") if p.get("qty") is not None else p.get("cantidad")
    linea = dict.fromkeys(_ORDEN_LINEA)
    linea["descripcion"] = _descripcion(p)
    linea["cantidad"] = _cantidad(cantidad)
    if con_precio:
        linea["precio_unitario"] = _monto(p.get("unit_price_cop"))
        linea["total_linea"] = _total_linea(p, cantidad)
        if isinstance(iva, dict):
            linea["iva_etiqueta"] = _texto(iva.get("etiqueta"))
            linea["iva_pct"] = _pct(iva.get("pct"))
        linea["anticipo"] = _monto(anticipo)
    return linea


def _linea_del_documento(linea, n: int, con_precios: bool) -> dict:
    """Proyección de una salida de linea_publica a CLAVES_LINEA, numerada. Sin precios, los campos de dinero quedan en
    None aunque la línea los traiga."""
    linea = linea if isinstance(linea, dict) else {}
    resultado = {clave: linea.get(clave) for clave in _ORDEN_LINEA}
    resultado["n"] = n
    if not con_precios:
        for clave in _PRECIOS_LINEA:
            resultado[clave] = None
    return resultado


# ─── Totales, pago y notas ───────────────────────────────────────────────────────────────────────────────────

def _totales(t: dict) -> dict:
    impuestos = [{"etiqueta": _texto(i.get("etiqueta")), "base": _monto(i.get("base")), "valor": _monto(i.get("valor"))}
                 for i in (t.get("impuestos") or []) if isinstance(i, dict)]
    return {"subtotal": _monto(t.get("subtotal")), "descuento_pct": _pct(t.get("descuento_pct")),
            "descuento": _monto(t.get("descuento")), "impuestos": impuestos,
            "ajuste_redondeo": _monto(t.get("ajuste_redondeo")), "total": _monto(t.get("total"))}


def _pago(p: dict, con_precios: bool, instrucciones) -> dict:
    """La forma de pago con la lista blanca de R24. Sin precios (SC): modalidad y %, sin montos. Los pagos registrados
    solo con {concepto, monto, metodo, fecha}: nunca la referencia bancaria ni quién verificó (U23)."""
    pago = {"modalidad": _texto(p.get("modalidad")), "anticipo_pct": _pct(p.get("anticipo_pct"))}
    for clave in _MONTOS_PAGO:
        pago[clave] = _monto(p.get(clave)) if con_precios else None
    pagos = p.get("pagos")
    pago["pagos"] = ([{"concepto": _texto(x.get("concepto")), "monto": _monto(x.get("monto")),
                       "metodo": _texto(x.get("metodo")), "fecha": _fecha_de_pago(x.get("fecha"))}
                      for x in pagos if isinstance(x, dict)]
                     if con_precios and isinstance(pagos, list) else None)
    pago["instrucciones"] = instrucciones
    pago["manual"] = bool(p.get("manual"))
    return pago


def _notas(notas) -> list:
    """[{titulo, texto}] sin las notas vacías o con solo espacios."""
    resultado = []
    for nota in notas or []:
        if isinstance(nota, dict) and _texto(nota.get("texto")):
            resultado.append({"titulo": _texto(nota.get("titulo")), "texto": nota["texto"].strip()})
    return resultado


def armar_documento(db: Session, tipo: str, *, numero, fecha_emision, cliente_nombre, lineas, con_precios: bool,
                    direccion_entrega=None, fecha_entrega_estimada=None, totales=None, pago=None, notas=None,
                    atendido_por=None, estado=None, valida_hasta=None) -> dict:
    """El documento del cliente con la forma única de C2 (ver el docstring del módulo).

    - lineas: salidas de linea_publica (se proyectan a CLAVES_LINEA y se numeran desde 1).
    - con_precios False (la SC): sin precios en las líneas, totales None y pago sin montos.
    - fecha_emision: instante en UTC (datetime sin zona, como se guarda) -> '...Z' (iso_z); un date es TypeError.
    - fecha_entrega_estimada y valida_hasta: fecha de calendario -> 'AAAA-MM-DD' (fecha_solo, sin corrimiento de día).
    - totales y pago: dicts con las claves de C2/R24 (lo que falte queda None); se normalizan a pesos enteros. Sin pago
      no se inventa una forma de pago (pago None).
    ValueError si el tipo no es SC, COT ni PVEN."""
    if tipo not in TITULOS:
        raise ValueError(f"Tipo de documento desconocido: {tipo!r}")
    con_precios = bool(con_precios)
    textos = empresa.textos_documento(db, tipo)
    return {
        "tipo": tipo,
        "titulo": TITULOS[tipo],
        "numero": numero,
        "estado": estado,
        "fecha_emision": iso_z(fecha_emision),
        "fecha_entrega_estimada": fecha_solo(fecha_entrega_estimada),
        "cliente": {"nombre": _texto(cliente_nombre), "direccion_entrega": _texto(direccion_entrega)},
        "atendido_por": _texto(atendido_por),
        "con_precios": con_precios,
        "lineas": [_linea_del_documento(linea, n, con_precios) for n, linea in enumerate(lineas or [], start=1)],
        "totales": _totales(totales) if con_precios and isinstance(totales, dict) else None,
        "pago": _pago(pago, con_precios, textos["instrucciones_pago"]) if isinstance(pago, dict) else None,
        "notas": _notas(notas),
        "valida_hasta": fecha_solo(valida_hasta),
        "terminos": textos["terminos"],
        "mensaje_pie": textos["mensaje_pie"],
    }
