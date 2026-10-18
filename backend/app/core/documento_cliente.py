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

armar_documento solo ARMA el dict: los totales, el anticipo y el IVA los calcula quien llama (T4 desglose_documento
para los impuestos, que nunca se recalculan aquí). Sin FastAPI.

T5 (U17+H28, U22+H38 y U23; C2, C3, C4, C10, R3, R24): los constructores documento_sc, documento_cot y documento_pven
(linea_publica + armar_documento), las piezas que usan (etiqueta_modalidad, forma_de_pago, notas_para_cliente,
pagos_para_cliente, siguiente_paso_sc) y estado_enlace, el estado del enlace de una SC o una COT en palabras
(reglas a-i). Los modelos y confirmation_tokens se importan dentro de las funciones: etiqueta_modalidad y forma_de_pago
quedan puras e importables sin base (T13 compara etiqueta_modalidad con etiquetaModalidad, RP21).
"""
import logging
import re
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation

from sqlalchemy.orm import Session

from app.core import empresa
from app.core.fechas import ahora_utc, fecha_larga, iso_z
from app.core.iva import desglose_documento, etiqueta_tarifa_iva, pct_tarifa_iva
from app.core.textos_actividad import ESTADOS_SC_HEREDADOS, TIPOS_PAGO
from app.core.ventas_dinero import (METODO_PAGO_SIN_VERIFICAR, METODO_PAGO_TRASLADO, ORIGEN_MANUAL,
                                    PCT_ANTICIPO_POR_DEFECTO, TIPOS_PAGO_INGRESO, _sin_tildes, anticipo_cotizacion,
                                    formato_pct, monto_linea, pct_anticipo_de_modalidad, redondear_peso,
                                    repartir_anticipo_por_linea, resumen_anticipo_cotizacion,
                                    resumen_anticipo_del_pedido, unidades)

logger = logging.getLogger(__name__)

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


# ─── T5: modalidad de pago, notas y pagos (U17+H28, R3, RP3, RP5) ──────────────────────────────────────────────

# El texto de H10 para la modalidad 60/40 (el mismo ETIQUETA_60_40 de frontend/src/lib/etiquetas-ventas.js).
ETIQUETA_60_40 = "60/40 (60% de anticipo y 40% al entregar)"
# Las formas conocidas de un plazo de crédito (PLAZO_DE_CREDITO del frontend): 'credito 30 dias', 'credito 30d',
# 'cred 45', 'cr. 90 dias', 'credito'. Solo dan el texto 'Crédito N días'; no deciden el anticipo (B2.1-D7). [0-9] y no
# \d: en JS \d son solo los dígitos ASCII.
_PLAZO_DE_CREDITO = re.compile(r"(?:credito|cred\.?|cr\.?)\s*([0-9]+)?\s*(?:d|dias?)?\.?")
# tildesPorPalabra: las palabras completas 'credito' y 'dias' (\b de JS sin la bandera u: solo ASCII), sin importar las
# mayúsculas, y la posición de su vocal con tilde.
_PALABRA_CON_TILDE = re.compile(r"\b(credito|dias)\b", re.IGNORECASE | re.ASCII)
_VOCAL_CON_TILDE = {"credito": 2, "dias": 1}
_CON_TILDE = {"e": "é", "E": "É", "i": "í", "I": "Í"}

TITULO_NOTA_CLIENTE = "Nota para el cliente"
TITULO_NOTAS_COT = "Notas"
# Hueco 3: el pedido tiene unidades canceladas (SaleOrderLineErp.quantity_cancelled) y sus totales ya las descuentan. r1
# (C7): la nota nombra los productos y las unidades canceladas (en un pedido sin tarifas la linea sigue a la vista).
TITULO_PRODUCTOS_CANCELADOS = "Productos cancelados"
TEXTO_PRODUCTOS_CANCELADOS = "Se cancelaron productos; los totales ya lo reflejan."
# Conceptos de pago que dependen del método (RP3: los demás salen de textos_actividad.TIPOS_PAGO).
CONCEPTO_TRASLADO = "Saldo a favor de tu pedido anterior"
CONCEPTO_SIN_VERIFICAR = "Anticipo registrado"


def _con_tilde(m) -> str:
    palabra = m.group(0)
    i = _VOCAL_CON_TILDE[palabra.lower()]
    return palabra[:i] + _CON_TILDE[palabra[i]] + palabra[i + 1:]


def etiqueta_modalidad(modalidad) -> str:
    """La modalidad de pago para mostrar: ESPEJO EXACTO de etiquetaModalidad (frontend/src/lib/etiquetas-ventas.js,
    RP5). Se compara sin tildes, mayúsculas, caracteres de formato ni espacios en los bordes (_sin_tildes, el
    claveModalidad del backend):
    - un plazo de crédito ('Credito 30 dias', 'Credito 30d', 'cr. 90 dias', 'CRÉDITO') -> 'Crédito N días' o 'Crédito'
      (solo el texto: el anticipo lo decide pct_anticipo_de_modalidad con la lista exacta MODALIDADES_CREDITO);
    - lo que dice '60/40' -> ETIQUETA_60_40; 'contado' -> 'Contado'; 'otro' -> 'Otro';
    - cualquier otro valor queda como está, con la tilde en las palabras completas 'credito' y 'dias'.
    None -> ''. Pura (sin base): la paridad con el frontend la prueba T13 (test_paridad_bloque3)."""
    if modalidad is None:
        return ""
    original = str(modalidad)
    clave = _sin_tildes(original)
    plazo = _PLAZO_DE_CREDITO.fullmatch(clave)
    if plazo:
        return f"Crédito {int(plazo.group(1))} días" if plazo.group(1) else "Crédito"
    if "60/40" in clave:
        return ETIQUETA_60_40
    if clave == "contado":
        return "Contado"
    if clave == "otro":
        return "Otro"
    return _PALABRA_CON_TILDE.sub(_con_tilde, original)


def forma_de_pago(modalidad) -> dict:
    """{modalidad (el valor guardado), etiqueta (etiqueta_modalidad), anticipo_pct (int)} de una SC: el % de
    pct_anticipo_de_modalidad, o 60 si no la reconoce (R2). Los textos para el cliente (100, 60, 0 y no reconocida) los
    arma textoFormaPago(pago) del frontend cuando pago.anticipo es None (R24): aquí no se duplican."""
    pct = pct_anticipo_de_modalidad(modalidad)
    return {"modalidad": modalidad, "etiqueta": etiqueta_modalidad(modalidad),
            "anticipo_pct": int(PCT_ANTICIPO_POR_DEFECTO if pct is None else pct)}


def siguiente_paso_sc(sc, forma_pago) -> list:
    """Los 3 pasos de '¿Qué sigue?' de una SC confirmada (U17): quién prepara la cotización (el asesor o 'Tu asesor'),
    que se la enviamos por el mismo medio y que al aprobarla se hace el pedido, con el anticipo si es mayor que 0."""
    asesor = _texto(getattr(sc, "advisor_name", None)) or "Tu asesor"
    pct = (forma_pago or {}).get("anticipo_pct") or 0
    anticipo = f" con el anticipo del {formato_pct(pct)}" if pct > 0 else ""
    return [f"{asesor} prepara tu cotización con los precios.",
            "Te la enviamos por el mismo medio para que la revises y la apruebes.",
            f"Cuando la apruebes, hacemos tu pedido{anticipo}."]


def notas_para_cliente(sc, cot=None) -> list:
    """Las notas que ve el cliente (R3, C19), sin las vacías: la «Nota para el cliente» de la SC (sc.nota_cliente; sus
    Notas, sc.notas, son internas y NUNCA salen) y las «Notas» de la COT, las dos con el aviso «El cliente verá esta
    nota» en las pantallas internas. r1 (P5): las notas del pedido (so.notas) tampoco salen: su pantalla no tiene ese
    aviso y el usuario solo aprobó estas dos (mostrarlas queda como decisión del usuario para el informe del B3)."""
    notas = []

    def agregar(titulo, texto):
        texto = _texto(texto)
        if texto:
            notas.append({"titulo": titulo, "texto": texto})

    if sc is not None:
        agregar(TITULO_NOTA_CLIENTE, sc.nota_cliente)
    if cot is not None:
        agregar(TITULO_NOTAS_COT, cot.notas)
    return notas


def pagos_para_cliente(db: Session, so) -> list:
    """Los pagos del pedido que ve el cliente (U23, R6, RP3): los CONFIRMADO de ingreso (TIPOS_PAGO_INGRESO) y las
    devoluciones (en negativo), por fecha. [{concepto, monto, metodo, fecha}]: el concepto sale de
    textos_actividad.TIPOS_PAGO, salvo el traslado de un pedido cancelado (CONCEPTO_TRASLADO) y el pago automático de la
    conversión sin verificar (CONCEPTO_SIN_VERIFICAR), que van sin método. Nunca la referencia bancaria, quién lo
    registró ni sus notas."""
    from app.models.fase4 import SaleOrderPayment
    pagos = (db.query(SaleOrderPayment)
             .filter(SaleOrderPayment.sale_order_id == so.id, SaleOrderPayment.estado == "CONFIRMADO",
                     SaleOrderPayment.tipo.in_(TIPOS_PAGO_INGRESO + ("DEVOLUCION",)))
             .order_by(SaleOrderPayment.fecha.asc(), SaleOrderPayment.id.asc()).all())
    resultado = []
    for p in pagos:
        metodo = _texto(p.metodo_pago)
        if metodo == METODO_PAGO_TRASLADO:
            concepto, metodo = CONCEPTO_TRASLADO, None
        elif metodo == METODO_PAGO_SIN_VERIFICAR:
            concepto, metodo = CONCEPTO_SIN_VERIFICAR, None
        else:
            concepto = TIPOS_PAGO[p.tipo]
        monto = _pesos_enteros(p.monto)
        resultado.append({"concepto": concepto, "monto": -monto if p.tipo == "DEVOLUCION" else monto,
                          "metodo": metodo, "fecha": p.fecha})
    return resultado


# ─── T5: constructores del documento (C2, C3, C4, R24) ─────────────────────────────────────────────────────────

def _pesos_enteros(valor) -> int:
    """Un monto guardado en pesos enteros; lo que no es un monto (dato viejo) vale 0, para que la página no se caiga."""
    try:
        return int(redondear_peso(valor))
    except ValueError:
        return 0


def _lineas_visibles(productos) -> list:
    """Las líneas que ve el cliente: dicts con descripción (sin líneas vacías ni datos que no son una línea)."""
    return [p for p in (productos if isinstance(productos, list) else []) if isinstance(p, dict) and _descripcion(p)]


def productos_publicos_sc(productos) -> list:
    """[{n, descripcion, cantidad}] de una SC (U17, data.productos de /confirmar/ver): sin precio ni sku."""
    lineas = (linea_publica(p, False) for p in _lineas_visibles(productos))
    return [{"n": n, "descripcion": l["descripcion"], "cantidad": l["cantidad"]} for n, l in enumerate(lineas, start=1)]


def _iva_de_linea(p: dict, desglose: dict):
    """{'etiqueta', 'pct'} de la tarifa de la línea si el documento tiene el IVA discriminado (T4); si no, None."""
    if not desglose["iva_discriminado"]:
        return None
    return {"etiqueta": etiqueta_tarifa_iva(p.get("iva_tarifa")), "pct": pct_tarifa_iva(p.get("iva_tarifa"))}


def _totales_del_documento(doc, lineas: list, desglose: dict, sumar_lineas: bool = True) -> dict:
    """totales de la COT o del PVEN (C2). El total es SIEMPRE el guardado y el IVA y el descuento salen de
    desglose_documento (T4), sin recalcularse.
    - IVA discriminado: el subtotal de la cabecera, una fila de impuesto por tarifa y sin ajuste (ajuste_redondeo None).
    - Sin IVA discriminado (documentos viejos): el subtotal es la suma de las líneas que ve el cliente y
      ajuste_redondeo = total − (subtotal − descuento + IVA), la diferencia por centavos viejos (0 con datos nuevos;
      si no es 0 queda en el registro). Un IVA guardado sin tarifas por línea va en una sola fila 'IVA'.
    sumar_lineas False (pedido con líneas canceladas, hueco 3): el subtotal también es el de la cabecera, porque la
    diferencia con las líneas del JSON es la cancelación y NO un ajuste por redondeo."""
    total = _pesos_enteros(doc.total_cop)
    iva = desglose["iva_cop"]
    descuento = desglose["descuento_cop"]
    totales = {"descuento_pct": doc.descuento_pct, "descuento": descuento, "total": total}
    if desglose["iva_discriminado"]:
        impuestos = [{"etiqueta": f["etiqueta"], "base": f["base_cop"], "valor": f["iva_cop"]}
                     for f in desglose["iva_por_tarifa"]]
        return dict(totales, subtotal=_pesos_enteros(doc.subtotal_cop), impuestos=impuestos, ajuste_redondeo=None)
    totales_linea = [l["total_linea"] for l in lineas]
    if sumar_lineas and totales_linea and None not in totales_linea:
        subtotal = int(sum(totales_linea))
    else:
        subtotal = _pesos_enteros(doc.subtotal_cop)
    ajuste = total - (subtotal - descuento + iva)
    if ajuste:
        logger.warning("Documento del cliente %s: ajuste por redondeo de %s (las líneas no suman la cabecera)",
                       doc.numero, ajuste)
    impuestos = [{"etiqueta": "IVA", "base": total - iva, "valor": iva}] if iva > 0 else []
    return dict(totales, subtotal=subtotal, impuestos=impuestos, ajuste_redondeo=ajuste)


def _cargar(db: Session, modelo, doc_id):
    return db.query(modelo).filter(modelo.id == doc_id).first() if doc_id else None


def _creado(token_row):
    """created_at del enlace (el dict de consultar_token o la fila del ORM), o None."""
    if token_row is None:
        return None
    return token_row.get("created_at") if isinstance(token_row, dict) else getattr(token_row, "created_at", None)


def documento_sc(db: Session, sc) -> dict:
    """La SC que ve el cliente (U17+H28 con C2/R24): sin precios ni totales; líneas con descripción y cantidad; pago con
    la modalidad y el % de anticipo (forma_de_pago) y lo demás None; la «Nota para el cliente» (R3). Nunca las notas
    internas, el teléfono, el correo ni ids."""
    forma = forma_de_pago(sc.modalidad_pago)
    return armar_documento(
        db, "SC", numero=sc.numero, fecha_emision=sc.fecha_solicitud or sc.created_at, cliente_nombre=sc.customer_name,
        lineas=[linea_publica(p, False) for p in _lineas_visibles(sc.productos)], con_precios=False,
        direccion_entrega=sc.customer_address, fecha_entrega_estimada=sc.fecha_entrega_estimada,
        pago={"modalidad": forma["modalidad"], "anticipo_pct": forma["anticipo_pct"], "manual": False},
        notas=notas_para_cliente(sc), atendido_por=sc.advisor_name, estado=sc.estado)


def documento_cot(db: Session, cot, token_row=None) -> dict:
    """La COT que ve el cliente (U22+H38 con C2/C3/C4/R24). Lee la SC UNA vez (C9 del Bloque 2).
    - fecha_emision: cuándo se le envió (token_row.created_at, el dict de consultar_token o la fila); sin enlace, la
      fecha de la cotización.
    - lineas: precio unitario, total sin IVA (C4), la etiqueta y el % de IVA si está discriminado y su parte del
      anticipo (U19; solo en la COT, C3).
    - pago: el anticipo que exigirá crear el pedido (anticipo_cotizacion: manual R3, modalidad R2, conservado o por
      defecto; manual = origen manual, nunca su nota), el saldo, el saldo a favor de pedidos cancelados de esta COT y el
      anticipo que falta pagar (R6).
    - notas: la «Nota para el cliente» de su SC y las «Notas» de la COT (R3); valida_hasta (U22-validez)."""
    from app.models.erp_documents import CustomerRequest
    sc = _cargar(db, CustomerRequest, cot.sc_id)
    productos = _lineas_visibles(cot.productos)
    desglose = desglose_documento(cot)
    # r1 (C8): la misma cuenta que la pantalla del asesor (get_cotizacion): una sola fuente.
    anticipo = resumen_anticipo_cotizacion(cot, db, sc=sc)
    por_linea = repartir_anticipo_por_linea([monto_linea(p) for p in productos], anticipo.requerido)
    lineas = [linea_publica(p, True, iva=_iva_de_linea(p, desglose), anticipo=parte)
              for p, parte in zip(productos, por_linea)]
    pago = {"modalidad": anticipo.modalidad, "anticipo_pct": anticipo.pct_mostrar, "anticipo": anticipo.requerido,
            "saldo": _pesos_enteros(cot.total_cop) - int(anticipo.requerido), "saldo_a_favor": anticipo.saldo_a_favor,
            "anticipo_por_pagar": anticipo.por_pagar, "manual": anticipo.manual}
    return armar_documento(
        db, "COT", numero=cot.numero, fecha_emision=_creado(token_row) or cot.fecha_cotizacion or cot.created_at,
        cliente_nombre=cot.customer_name, lineas=lineas, con_precios=True,
        direccion_entrega=cot.direccion_entrega or cot.customer_address,
        fecha_entrega_estimada=cot.fecha_entrega_estimada, totales=_totales_del_documento(cot, lineas, desglose),
        pago=pago, notas=notas_para_cliente(sc, cot), atendido_por=sc.advisor_name if sc is not None else None,
        estado=cot.estado, valida_hasta=cot.valida_hasta)


def _unir(partes: list) -> str:
    """'a', 'a y b', 'a, b y c'."""
    return partes[0] if len(partes) == 1 else f"{', '.join(partes[:-1])} y {partes[-1]}"


def _nota_de_cancelaciones(db: Session, so_id):
    """La nota de los productos cancelados del pedido (hueco 3, r1 C7), o None si no hay unidades canceladas. Sale de
    SaleOrderLineErp.quantity_cancelled (nota del controlador después de T4: en un pedido sin tarifas la línea cancelada
    sigue en el JSON con su cantidad completa) y nombra cada producto con sus unidades: «Se cancelaron productos; los
    totales ya lo reflejan. Cancelado: 1 unidad de Lámpara y 2 unidades de Silla.»."""
    from app.models.fase1b import SaleOrderLineErp
    canceladas = (db.query(SaleOrderLineErp.description, SaleOrderLineErp.quantity_cancelled)
                  .filter(SaleOrderLineErp.so_id == so_id, SaleOrderLineErp.quantity_cancelled > 0)
                  .order_by(SaleOrderLineErp.id.asc()).all())
    if not canceladas:
        return None
    partes = [f"{unidades(cantidad)} de {_texto(descripcion) or 'Producto'}" for descripcion, cantidad in canceladas]
    return {"titulo": TITULO_PRODUCTOS_CANCELADOS,
            "texto": f"{TEXTO_PRODUCTOS_CANCELADOS} Cancelado: {_unir(partes)}."}


def documento_pven(db: Session, so) -> dict:
    """El pedido que ve el cliente por su enlace de consulta (U23 con C2/R24). Lee la SC y la COT una vez cada una.
    - lineas: las del JSON del pedido (hueco 3), con precio, total sin IVA y su IVA; sin anticipo por línea (C3).
    - totales: los de la cabecera y desglose_documento (C2). Con unidades canceladas (SaleOrderLineErp) el subtotal
      también es el de la cabecera, la diferencia con el JSON no es un ajuste por redondeo y va la nota que nombra lo
      cancelado (_nota_de_cancelaciones).
    - pago: el %, el anticipo (requerido), lo pagado (total − saldo) y lo que falta del anticipo (pendiente) de
      resumen_anticipo_del_pedido, la misma cuenta de get_pedido (R4, r1 C8); saldo, la modalidad de la SC y pagos
      (pagos_para_cliente). manual = el origen del anticipo de su COT es el manual (anticipo_cotizacion, R3).
    - notas: la «Nota para el cliente» de la SC y las «Notas» de la COT (R3); las del pedido no (r1, P5)."""
    from app.models.erp_documents import CustomerRequest, SalesQuotation
    sc = _cargar(db, CustomerRequest, so.sc_id)
    cot = _cargar(db, SalesQuotation, so.cot_id)
    productos = _lineas_visibles(so.productos)
    desglose = desglose_documento(so)
    nota_cancelaciones = _nota_de_cancelaciones(db, so.id)
    lineas = [linea_publica(p, True, iva=_iva_de_linea(p, desglose)) for p in productos]
    anticipo = resumen_anticipo_del_pedido(so)
    pago = {"modalidad": sc.modalidad_pago if sc is not None else None, "anticipo_pct": anticipo.pct,
            "anticipo": anticipo.requerido, "saldo": so.saldo_cop, "saldo_a_favor": None,
            "anticipo_por_pagar": anticipo.pendiente, "pagado": anticipo.pagado, "pagos": pagos_para_cliente(db, so),
            "manual": cot is not None and anticipo_cotizacion(cot, db, sc=sc).origen == ORIGEN_MANUAL}
    notas = notas_para_cliente(sc, cot) + ([nota_cancelaciones] if nota_cancelaciones else [])
    return armar_documento(
        db, "PVEN", numero=so.numero, fecha_emision=so.created_at, cliente_nombre=so.customer_name, lineas=lineas,
        con_precios=True, direccion_entrega=so.direccion_entrega or so.customer_address,
        fecha_entrega_estimada=so.fecha_entrega_estimada,
        totales=_totales_del_documento(so, lineas, desglose, sumar_lineas=nota_cancelaciones is None), pago=pago,
        notas=notas,
        atendido_por=sc.advisor_name if sc is not None else None, estado=so.estado)


# ─── T5: estado del enlace en palabras (U17 reglas a-i, C10; regla g con H28-cambios) ───────────────────────────

DIAS_RESUMEN_CONFIRMADO = 30
MENSAJE_GRACIAS = "¡Gracias! Tu confirmación fue registrada."
MENSAJES_ENLACE = {
    "invalido": "Este enlace no es válido. Ábrelo completo desde el mensaje que te enviamos o pide uno nuevo.",
    "no_disponible": "Este enlace ya no está disponible. Si tienes dudas, escríbenos.",
    "confirmada": "Esta {documento} ya fue confirmada.",
    "vencido": "Este enlace venció el {fecha}. Escríbenos y te enviamos uno nuevo.",
    "reemplazado": ("Te enviamos un enlace más reciente para esta {documento}. Ábrelo desde el último mensaje que "
                    "recibiste."),
    "cambios_enviados": ("Ya nos enviaste tus cambios el {fecha}. {asesor} ajustará la {documento} y te enviará un "
                         "enlace nuevo."),
    "actualizada": ("Tu asesor actualizó esta {documento} después de tu confirmación. Te enviaremos un enlace nuevo "
                    "para que la revises."),
}
# Regla h: el documento volvió a un estado anterior a la confirmación (el asesor lo cambió después).
_ESTADOS_ANTES_DE_CONFIRMAR = {"SC": ("BORRADOR", "ASIGNADA", "PENDIENTE_CONFIRMACION"),
                               "COT": ("BORRADOR", "ENVIADA", "PENDIENTE_CONFIRMACION")}
# Regla b: el documento ya no existe para el cliente (sin decir por qué).
_ESTADOS_SIN_ENLACE = {"SC": ("CANCELADA",), "COT": ("RECHAZADA",)}


def _ultima_confirmacion_en_actividad(db: Session, tipo: str, doc_id: int):
    """Cuándo quedó confirmado el documento según su Actividad (el último renglón con new_estado CONFIRMADA: la
    confirmación por un enlace o, en la SC, la sincronización al aprobar su cotización, U15), o None."""
    from app.models.erp_documents import ActivityLog
    fila = (db.query(ActivityLog.created_at)
            .filter(ActivityLog.entity_type == tipo, ActivityLog.entity_id == doc_id,
                    ActivityLog.new_estado == "CONFIRMADA")
            .order_by(ActivityLog.created_at.desc(), ActivityLog.id.desc()).first())
    return fila[0] if fila else None


def _cambio_el_cliente_despues(db: Session, sc_id: int, desde) -> bool:
    """r1 (P4): la SC cambió de cliente (su ficha, nombre, dirección, correo o teléfono) después de `desde` (cuando se
    creó el enlace). Lo dice su Actividad, con cualquiera de estas marcas (el enlace no guarda a qué cliente se envió):
    - el renglón de cambios con esos campos en extra_data.cambios (cambios_documento.CAMPOS_CLIENTE). Es auxiliar:
      _registrar_cambios se traga sus errores, así que solo no basta (r2);
    - el marcador OBLIGATORIO (r2): un renglón cambios_documento.ACCION_CLIENTE_CAMBIADO (update_solicitud, cuando el
      renglón de cambios no registró al cliente) o extra_data[MARCA_CLIENTE_CAMBIADO] en el renglón obligatorio de
      PATCH /solicitudes/{id}/cliente. Los dos van en el commit del cambio: si no se pueden escribir, el cambio falla.
    r3: el marcador sigue la regla de la revocación (ficha, correo, teléfono o nombre; la dirección no, por R18 del
    Bloque 2), pero esta guarda sigue siendo conservadora: también cuenta un cambio de dirección del renglón de cambios
    (CAMPOS_CLIENTE). Solo esconde el resumen; no anula ningún enlace.
    """
    from app.core.cambios_documento import ACCION_CLIENTE_CAMBIADO, CAMPOS_CLIENTE, MARCA_CLIENTE_CAMBIADO
    from app.models.erp_documents import ActivityLog
    filas = (db.query(ActivityLog.action, ActivityLog.extra_data)
             .filter(ActivityLog.entity_type == "SC", ActivityLog.entity_id == sc_id, ActivityLog.created_at > desde)
             .all())
    for accion, extra in filas:
        extra = extra if isinstance(extra, dict) else {}
        if accion == ACCION_CLIENTE_CAMBIADO or extra.get(MARCA_CLIENTE_CAMBIADO) is True:
            return True
        if any(isinstance(c, dict) and c.get("campo") in CAMPOS_CLIENTE for c in (extra.get("cambios") or [])):
            return True
    return False


def _ultimo_dia_del_enlace(expires_at) -> str:
    """El último día en que sirvió el enlace, en Colombia ('8 de octubre de 2026'), para «venció el …». expires_at es
    el instante en que dejó de servir (para la COT y el PVEN, las 00:00 del día siguiente en Colombia): el día es el
    de un instante antes."""
    return fecha_larga(expires_at - timedelta(microseconds=1))


def _asesor_del_documento(db: Session, doc, tipo: str) -> str:
    """El nombre del asesor (el de la SC; en la COT, el de su SC) o 'Tu asesor'."""
    if tipo == "COT":
        from app.models.erp_documents import CustomerRequest
        doc = _cargar(db, CustomerRequest, doc.sc_id)
    return _texto(getattr(doc, "advisor_name", None)) or "Tu asesor"


def _confirmada(db: Session, info: dict, doc, tipo: str, nombre: str) -> dict:
    """Regla d. confirmada_el = cuando se usó ESTE enlace si con él se confirmó; si no, el último renglón CONFIRMADA de
    la Actividad. La COT solo lleva su número (C10: sin líneas ni precios). La SC lleva '¿Qué sigue?' y, durante
    DIAS_RESUMEN_CONFIRMADO días, el resumen (documento_sc), salvo que ya no sea de quien recibió el enlace (r1, P4):
    - si la SC cambió de cliente después de crearse ESTE enlace (_cambio_el_cliente_despues), solo {numero};
    - si con este enlace se confirmó, además exige gate1_confirmed_at: N7 la limpia al cambiar el cliente o los
      productos (update_solicitud y PATCH /cliente), así que sin ella esa confirmación ya no es la vigente."""
    from app.core.confirmation_tokens import RESULTADO_CONFIRMADO
    confirmo_este = info["resultado"] == RESULTADO_CONFIRMADO
    confirmada_el = info["used_at"] if confirmo_este else _ultima_confirmacion_en_actividad(db, tipo, doc.id)
    documento, siguiente = {"numero": doc.numero}, None
    if tipo == "SC":
        reciente = (confirmada_el is not None
                    and ahora_utc() - confirmada_el <= timedelta(days=DIAS_RESUMEN_CONFIRMADO))
        confirmacion_vigente = doc.gate1_confirmed_at is not None if confirmo_este else True
        if reciente and confirmacion_vigente and not _cambio_el_cliente_despues(db, doc.id, info["created_at"]):
            documento = documento_sc(db, doc)
        siguiente = siguiente_paso_sc(doc, forma_de_pago(doc.modalidad_pago))
    return {"mensaje": MENSAJES_ENLACE["confirmada"].format(documento=nombre), "documento": documento,
            "confirmada_el": iso_z(confirmada_el), "siguiente_paso": siguiente}


def estado_enlace(db: Session, info, doc, tipo) -> tuple:
    """(estado_enlace, extra) del enlace de una SC o una COT (U17, C10: las mismas reglas para las dos), en este orden:
      a) sin fila (o de otro tipo) -> 'invalido';
      b) el documento no existe, o la SC está CANCELADA / la COT RECHAZADA -> 'no_disponible' (nunca dice por qué);
      c) enlace vigente y documento en PENDIENTE_CONFIRMACION -> 'pendiente' (la única que responde 200);
      d) documento CONFIRMADA (la SC también en un estado heredado de U15) -> 'confirmada' (ver _confirmada);
      e) vencido sin usar -> 'vencido', con documento = {numero};
      f) hay un enlace más reciente vigente -> 'reemplazado';
      g) resultado CAMBIOS (lo escribe T6) -> 'cambios_enviados', con el comentario mientras cambios_cliente_at siga;
      h) resultado CONFIRMADO y el documento volvió a un estado anterior -> 'actualizada';
      i) lo demás (revocado o usado sin resultado) -> 'no_disponible'.
    info es el dict INTERNO de consultar_token (nunca se devuelve tal cual) y doc el documento (o None). extra =
    {mensaje, documento, confirmada_el (iso_z), siguiente_paso, comentario}: lo que puede ver el cliente; el documento
    completo solo en 'confirmada' (SC) y el número en 'vencido'."""
    from app.core.confirmation_tokens import RESULTADO_CAMBIOS, RESULTADO_CONFIRMADO, hay_enlace_mas_reciente_vigente
    extra = {"mensaje": None, "documento": None, "confirmada_el": None, "siguiente_paso": None, "comentario": None}
    if info is None or tipo not in _ESTADOS_ANTES_DE_CONFIRMAR:
        return "invalido", dict(extra, mensaje=MENSAJES_ENLACE["invalido"])
    if doc is None or doc.estado in _ESTADOS_SIN_ENLACE[tipo]:
        return "no_disponible", dict(extra, mensaje=MENSAJES_ENLACE["no_disponible"])
    if info["vigente"] and doc.estado == "PENDIENTE_CONFIRMACION":
        return "pendiente", extra
    nombre = TITULOS[tipo].lower()
    if doc.estado == "CONFIRMADA" or (tipo == "SC" and doc.estado in ESTADOS_SC_HEREDADOS):
        return "confirmada", dict(extra, **_confirmada(db, info, doc, tipo, nombre))
    if info["vencido"]:
        mensaje = MENSAJES_ENLACE["vencido"].format(fecha=_ultimo_dia_del_enlace(info["expires_at"]))
        return "vencido", dict(extra, mensaje=mensaje, documento={"numero": doc.numero})
    if hay_enlace_mas_reciente_vigente(db, tipo, doc.id, info["created_at"]):
        return "reemplazado", dict(extra, mensaje=MENSAJES_ENLACE["reemplazado"].format(documento=nombre))
    if info["resultado"] == RESULTADO_CAMBIOS:
        mensaje = MENSAJES_ENLACE["cambios_enviados"].format(
            fecha=fecha_larga(info["used_at"]), asesor=_asesor_del_documento(db, doc, tipo), documento=nombre)
        comentario = doc.cambios_cliente_comentario if doc.cambios_cliente_at is not None else None
        return "cambios_enviados", dict(extra, mensaje=mensaje, comentario=comentario or None)
    if info["resultado"] == RESULTADO_CONFIRMADO and doc.estado in _ESTADOS_ANTES_DE_CONFIRMAR[tipo]:
        return "actualizada", dict(extra, mensaje=MENSAJES_ENLACE["actualizada"].format(documento=nombre))
    return "no_disponible", dict(extra, mensaje=MENSAJES_ENLACE["no_disponible"])
