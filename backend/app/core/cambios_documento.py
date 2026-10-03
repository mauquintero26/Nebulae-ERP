"""Compara el antes/despues de un documento de Ventas (SC, COT o VEN) para dejar en su
Actividad un renglon legible de lo que cambio cuando alguien lo edita o lo re-cotiza.

Los PATCH de erp_ventas.py solo registraban el cambio de estado y el de fecha de entrega:
re-cotizar, o cambiar productos, precios, datos del cliente o notas, no dejaba ningun
rastro. Este modulo es puro (sin DB ni FastAPI) para poder probar la comparacion sola.
"""
import copy
import datetime
from decimal import Decimal, InvalidOperation

# Columnas que se comparan por documento: nombre -> etiqueta que ve el usuario. Quedan
# fuera a proposito el estado y la fecha de entrega (ya tienen su propio registro:
# ESTADO_CHANGED y FECHA_ENTREGA_MODIFICADA), los ids de relaciones y las marcas internas
# (gate*_confirmed_at, updated_at, cancelled_at ...) que no le dicen nada a quien lee.
_CLIENTE = {
    "customer_name": "Cliente", "customer_phone": "Teléfono", "customer_email": "Correo",
    "customer_address": "Dirección del cliente",
}
_PRECIOS = {
    "trm_rate": "TRM", "subtotal_cop": "Subtotal", "descuento_pct": "Descuento",
    "total_cop": "Total", "anticipo_cop": "Anticipo",
}
CAMPOS = {
    "SC": {
        **_CLIENTE,
        "advisor_name": "Asesor", "tipo_solicitud": "Tipo de solicitud",
        "modalidad_pago": "Modalidad de pago", "fecha_vencimiento": "Fecha de vencimiento",
        "notas": "Notas", "productos": "Productos", "tipo_problema": "Tipo de problema",
        "descripcion_problema": "Descripción del problema", "urgencia": "Urgencia",
        "evidencia_descripcion": "Evidencia", "estado_soporte": "Estado de soporte",
        "asignado_a_user_id": "Responsable de soporte",
    },
    "COT": {
        **_CLIENTE,
        "cotizador": "Cotizador", "direccion_entrega": "Dirección de entrega",
        **_PRECIOS,
        "canal_envio": "Canal de envío", "notas": "Notas", "productos": "Productos",
        "pec_numero": "Pedido de compra",
    },
    "VEN": {
        **_CLIENTE,
        "direccion_entrega": "Dirección de entrega",
        **_PRECIOS,
        "saldo_cop": "Saldo", "notas": "Notas", "productos": "Productos",
        "pec_numero": "Pedido de compra", "pxp_numero": "Pago por procesar",
        "cancellation_reason": "Motivo de cancelación",
    },
}

NOMBRE_ACCION = {"SC": "Solicitud actualizada", "COT": "Cotización actualizada", "VEN": "Pedido actualizado"}

_DINERO = {"subtotal_cop", "total_cop", "anticipo_cop", "saldo_cop"}
_TASA = {"trm_rate"}
_PORCENTAJE = {"descuento_pct"}
_FECHAS = {"fecha_vencimiento"}
_ENTEROS = {"asignado_a_user_id"}
# Si cambia alguno de estos, lo que paga el cliente cambio: eso es re-cotizar.
_AFECTA_PRECIO = {"subtotal_cop", "total_cop", "descuento_pct", "anticipo_cop", "trm_rate", "productos"}

_NOMBRES_LINEA = ("product_name", "nombre", "name", "producto", "descripcion")
_CANTIDADES = ("qty", "cantidad")
_PRECIOS_LINEA = ("unit_price_cop", "precio_unitario", "precio_cop")

TEXTO_MAX = 120
CAMBIOS_MAX = 30
ETIQUETAS_EN_TITULO = 4


# ─── Normalizacion: dos valores "iguales" para el usuario deben compararse iguales ───

def _num(v):
    """Decimal a 2 decimales. Los totales llegan del frontend como float con ruido
    (60000.00000000001) y de la DB como Decimal ya redondeado por Numeric(x, 2)."""
    if v is None or v == "":
        return None
    try:
        return Decimal(str(v)).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        return None


def _texto(v):
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def _fecha(v):
    if v is None or v == "":
        return None
    if isinstance(v, datetime.datetime):
        return v.date().isoformat()
    if isinstance(v, datetime.date):
        return v.isoformat()
    return str(v)[:10]


def _entero(v):
    try:
        return int(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


def _primero(d, claves):
    for k in claves:
        if d.get(k) not in (None, ""):
            return d[k]
    return None


def _lineas(v):
    if not isinstance(v, list):
        return []
    lineas = []
    for i, p in enumerate(v):
        if not isinstance(p, dict):
            lineas.append({"nombre": _texto(p) or f"Línea {i + 1}", "qty": None, "precio": None, "total": None, "sku": None})
            continue
        lineas.append({
            "nombre": _texto(_primero(p, _NOMBRES_LINEA)) or f"Línea {i + 1}",
            "qty": _num(_primero(p, _CANTIDADES)),
            "precio": _num(_primero(p, _PRECIOS_LINEA)),
            "total": _num(p.get("total_cop")),
            "sku": _texto(p.get("sku_id")),
        })
    return lineas


def _normalizar(campo, v):
    if campo in _DINERO or campo in _TASA or campo in _PORCENTAJE:
        return _num(v)
    if campo in _FECHAS:
        return _fecha(v)
    if campo in _ENTEROS:
        return _entero(v)
    if campo == "productos":
        return _lineas(v)
    return _texto(v)


# ─── Presentacion ────────────────────────────────────────────────────────────────────

def _miles(n, decimales=0):
    """$1.234.567,89 (separadores es-CO)."""
    signo = "-" if n < 0 else ""
    s = f"{abs(n):,.{decimales}f}".replace(",", "§").replace(".", ",").replace("§", ".")
    return f"{signo}${s}"


def _qty(n):
    if n is None:
        return None
    return str(int(n)) if n == n.to_integral_value() else format(n.normalize(), "f")


def _mostrar(campo, v, usuarios):
    if v is None:
        return None
    if campo in _DINERO:
        return _miles(v)
    if campo in _TASA:
        return _miles(v, 2)
    if campo in _PORCENTAJE:
        return f"{format(v.normalize(), 'f')}%"
    if campo in _FECHAS:
        anio, mes, dia = v.split("-")
        return f"{dia}/{mes}/{anio}"
    if campo in _ENTEROS:
        return (usuarios or {}).get(v) or f"usuario #{v}"
    return v if len(v) <= TEXTO_MAX else v[: TEXTO_MAX - 1] + "…"


def _cambio(campo, etiqueta, antes, despues):
    return {"campo": campo, "etiqueta": etiqueta, "antes": antes, "despues": despues}


def _resumen_linea(linea):
    cantidad = f" ×{_qty(linea['qty'])}" if linea["qty"] is not None else ""
    precio = f" a {_miles(linea['precio'])}" if linea["precio"] is not None else ""
    return f"{linea['nombre']}{cantidad}{precio}"


# ─── Comparacion de productos: linea por linea, emparejadas por nombre ───────────────

def _indexar(lineas):
    """Clave (nombre, n-esima aparicion): si el mismo producto va dos veces se emparejan en orden."""
    vistos, indice = {}, {}
    for linea in lineas:
        nombre = linea["nombre"].casefold()
        vistos[nombre] = vistos.get(nombre, 0) + 1
        indice[(nombre, vistos[nombre])] = linea
    return indice


def _cambios_productos(antes, despues):
    ia, idx = _indexar(antes), _indexar(despues)
    cambios = []
    for clave, n in idx.items():
        a = ia.get(clave)
        if a is None:
            cambios.append(_cambio("productos", "Producto agregado", None, _resumen_linea(n)))
            continue
        nombre = n["nombre"]
        if a["qty"] != n["qty"]:
            cambios.append(_cambio("productos", f"{nombre} — cantidad", _qty(a["qty"]), _qty(n["qty"])))
        if a["precio"] != n["precio"]:
            cambios.append(_cambio("productos", f"{nombre} — precio unitario",
                                   _miles(a["precio"]) if a["precio"] is not None else None,
                                   _miles(n["precio"]) if n["precio"] is not None else None))
        elif a["qty"] == n["qty"] and a["total"] != n["total"]:
            cambios.append(_cambio("productos", f"{nombre} — total",
                                   _miles(a["total"]) if a["total"] is not None else None,
                                   _miles(n["total"]) if n["total"] is not None else None))
        if a["sku"] != n["sku"]:
            # Vincular una linea libre al catalogo no cambia lo que paga el cliente: campo aparte.
            cambios.append(_cambio(
                "productos_sku", nombre,
                f"SKU {a['sku']}" if a["sku"] else "Texto libre",
                f"SKU {n['sku']}" if n["sku"] else "Sin catálogo",
            ))
    for clave, a in ia.items():
        if clave not in idx:
            cambios.append(_cambio("productos", "Producto eliminado", _resumen_linea(a), None))
    return cambios


# ─── API del modulo ──────────────────────────────────────────────────────────────────

def tomar_foto(doc, entidad):
    """Copia de las columnas comparables. Tomarla ANTES de aplicar el PATCH (los JSON se
    copian en profundo para que mutar productos despues no altere el 'antes')."""
    return {campo: copy.deepcopy(getattr(doc, campo, None)) for campo in CAMPOS[entidad]}


def comparar(entidad, antes, despues, usuarios=None):
    """Lista de cambios [{campo, etiqueta, antes, despues}] entre dos fotos (vacia si no hay)."""
    cambios = []
    for campo, etiqueta in CAMPOS[entidad].items():
        a = _normalizar(campo, antes.get(campo))
        d = _normalizar(campo, despues.get(campo))
        if a == d:
            continue
        if campo == "productos":
            cambios.extend(_cambios_productos(a, d))
        else:
            cambios.append(_cambio(campo, etiqueta, _mostrar(campo, a, usuarios), _mostrar(campo, d, usuarios)))
    if len(cambios) > CAMBIOS_MAX:
        resto = len(cambios) - CAMBIOS_MAX
        cambios = cambios[:CAMBIOS_MAX] + [_cambio("mas", f"y {resto} cambios más", None, None)]
    return cambios


def afecta_precio(cambios):
    return any(c["campo"] in _AFECTA_PRECIO for c in cambios)


def cambian_productos(antes, despues):
    """True si cambio algo de los productos que ve el cliente (linea agregada o quitada, nombre,
    cantidad o precio). Vincular una linea al catalogo (sku) no cuenta, ni reordenarlas."""
    return any(c["campo"] == "productos" for c in _cambios_productos(_lineas(antes), _lineas(despues)))


def _titulo_edicion(entidad, cambios):
    etiquetas = []
    for c in cambios:
        etiqueta = "Productos" if c["campo"] in ("productos", "productos_sku") else c["etiqueta"]
        if c["campo"] != "mas" and etiqueta not in etiquetas:
            etiquetas.append(etiqueta)
    visibles = etiquetas[:ETIQUETAS_EN_TITULO]
    resto = len(etiquetas) - len(visibles)
    lista = ", ".join(visibles) + (f" y {resto} más" if resto > 0 else "")
    return f"{NOMBRE_ACCION[entidad]}: {lista}"


def describir(entidad, cambios, antes, despues, recotizacion=False):
    """(accion, descripcion) del renglon de Actividad, o None si no hay nada que registrar.

    Una Cotizacion cuyo precio cambio (o que se guardo desde 'Re-Cotizar') queda como
    RECOTIZADA; cualquier otra edicion, como UPDATED."""
    if entidad == "COT" and (recotizacion or afecta_precio(cambios)):
        antes_total = _num(antes.get("total_cop"))
        despues_total = _num(despues.get("total_cop"))
        if despues_total is not None and despues_total > 0 and not antes_total:
            return "RECOTIZADA", f"Cotización calculada: total {_miles(despues_total)}"
        if antes_total is not None and despues_total is not None and antes_total != despues_total:
            diferencia = despues_total - antes_total
            signo = "+" if diferencia > 0 else "-"
            return "RECOTIZADA", (f"Re-cotización: total {_miles(antes_total)} -> {_miles(despues_total)} "
                                  f"({signo}{_miles(abs(diferencia))})")
        if cambios:
            return "RECOTIZADA", "Re-cotización: se actualizaron los precios (el total no cambió)"
        return "RECOTIZADA", "Re-cotización guardada sin cambios en los precios"
    if not cambios:
        return None
    return "UPDATED", _titulo_edicion(entidad, cambios)
