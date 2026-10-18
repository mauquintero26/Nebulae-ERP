"""Compara el antes/despues de un documento de Ventas (SC, COT o VEN) para dejar en su
Actividad un renglon legible de lo que cambio cuando alguien lo edita o lo re-cotiza.

Los PATCH de erp_ventas.py solo registraban el cambio de estado y el de fecha de entrega:
re-cotizar, o cambiar productos, precios, datos del cliente o notas, no dejaba ningun
rastro. Este modulo es puro (sin DB ni FastAPI) para poder probar la comparacion sola.
"""
import copy
import datetime
import re
from decimal import Decimal, InvalidOperation

from app.core.fechas import ZONA_COLOMBIA
from app.core.iva import etiqueta_tarifa_iva, nombre_de_linea

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
    # IVA (B3 T4): el IVA total de la COT (fa6_028) y del pedido (sale_orders.tax_cop).
    "tax_cop": "IVA",
    "total_cop": "Total", "anticipo_cop": "Anticipo",
}
CAMPOS = {
    "SC": {
        **_CLIENTE,
        "advisor_name": "Asesor", "tipo_solicitud": "Tipo de solicitud",
        "modalidad_pago": "Modalidad de pago", "fecha_vencimiento": "Fecha de vencimiento",
        "notas": "Notas",
        # R3 (B3 T5): la nota que ve el cliente (customer_requests.nota_cliente).
        "nota_cliente": "Nota para el cliente",
        "productos": "Productos", "tipo_problema": "Tipo de problema",
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
        # U11: el motivo de una COT creada sin la confirmacion del cliente. Cambia cuando la COT cambia de solicitud (se
        # limpia): el renglon UPDATED conserva el motivo que tenia. B2.1 (D6): tambien al retomarla con un motivo nuevo,
        # pero ese cambio lo cuenta el renglon ESTADO_CHANGED de update_cotizacion, no un UPDATED.
        "sin_confirmacion_sc_motivo": "Sin confirmación del cliente",
    },
    "VEN": {
        **_CLIENTE,
        "direccion_entrega": "Dirección de entrega",
        **_PRECIOS,
        "saldo_cop": "Saldo", "notas": "Notas", "productos": "Productos",
        "pec_numero": "Pedido de compra", "pxp_numero": "Orden de pago",
        "cancellation_reason": "Motivo de cancelación",
    },
    # H21: la ficha del cliente (customers). Su historial lo escriben PATCH /ventas/solicitudes/{id}/cliente y
    # PUT /crm/customers/{id} (app/core/clientes.log_cliente) y lo muestra el perfil 360.
    "CLIENTE": {
        "first_name": "Nombre", "last_name": "Apellido", "document": "Documento", "phone": "Teléfono",
        "email": "Correo", "address": "Dirección", "city": "Ciudad",
    },
}

NOMBRE_ACCION = {"SC": "Solicitud actualizada", "COT": "Cotización actualizada", "VEN": "Pedido actualizado",
                 "CLIENTE": "Ficha del cliente actualizada"}

# H26: en una Solicitud el cliente pide productos; los precios aparecen en la Cotizacion. Las lineas de la SC llegan con
# unit_price_cop 0 desde solicitud-client y productos-solicitud, asi que en su Actividad no se muestra ni se compara el
# precio ('Nivel laser ×1', no '... a $0'). Si algun dia la SC tiene precios propios, se quita de aqui.
_SIN_PRECIO = {"SC"}

_DINERO = {"subtotal_cop", "tax_cop", "total_cop", "anticipo_cop", "saldo_cop"}
_TASA = {"trm_rate"}
_PORCENTAJE = {"descuento_pct"}
_FECHAS = {"fecha_vencimiento"}
_ENTEROS = {"asignado_a_user_id"}
# Si cambia alguno de estos, lo que paga el cliente cambio: eso es re-cotizar.
_AFECTA_PRECIO = {"subtotal_cop", "tax_cop", "total_cop", "descuento_pct", "anticipo_cop", "trm_rate", "productos"}

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
    """El dia de calendario de una fecha de negocio, en hora de Colombia (T11 calidad, B4; America/Bogota, como el resto
    del bloque). Las fechas con hora se guardan en UTC sin zona (utcnow + dias; el frontend manda el mediodia de Colombia,
    17:00 UTC): las 02:00 UTC del 21 son el 20 en Bogota. Un texto ISO con hora se lee igual (sin zona = UTC); una fecha
    sin hora (date o 'aaaa-mm-dd') es ese mismo dia."""
    if v is None or v == "":
        return None
    if isinstance(v, str):
        texto = v.strip()
        try:
            if len(texto) > 10:
                v = datetime.datetime.fromisoformat(texto)
            else:
                return datetime.date.fromisoformat(texto).isoformat()
        except ValueError:
            return texto[:10]
    if isinstance(v, datetime.datetime):
        if v.tzinfo is None:
            v = v.replace(tzinfo=datetime.timezone.utc)
        return v.astimezone(ZONA_COLOMBIA).date().isoformat()
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
        # El nombre sale de iva.nombre_de_linea (ronda r1 de T4): la misma regla y el mismo 'Línea N' que el 422 de IVA.
        if not isinstance(p, dict):
            lineas.append({"nombre": nombre_de_linea(p, i), "qty": None, "precio": None, "total": None, "sku": None,
                           "iva": None})
            continue
        lineas.append({
            "nombre": nombre_de_linea(p, i),
            "qty": _num(_primero(p, _CANTIDADES)),
            "precio": _num(_primero(p, _PRECIOS_LINEA)),
            "total": _num(p.get("total_cop")),
            "sku": _texto(p.get("sku_id")),
            # IVA (B3 T4): la tarifa de la linea (el cliente ve el IVA de cada producto).
            "iva": _texto(p.get("iva_tarifa")),
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


def _resumen_linea(linea, con_precio=True):
    cantidad = f" ×{_qty(linea['qty'])}" if linea["qty"] is not None else ""
    precio = f" a {_miles(linea['precio'])}" if con_precio and linea["precio"] is not None else ""
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


def _cambios_productos(antes, despues, con_precio=True):
    """Cambios linea por linea. con_precio=False (SC, H26): sin ' a $X' en agregados y eliminados y sin comparar el
    precio unitario ni el total de la linea; la cantidad y el vinculo al catalogo si."""
    ia, idx = _indexar(antes), _indexar(despues)
    cambios = []
    for clave, n in idx.items():
        a = ia.get(clave)
        if a is None:
            cambios.append(_cambio("productos", "Producto agregado", None, _resumen_linea(n, con_precio)))
            continue
        nombre = n["nombre"]
        if a["qty"] != n["qty"]:
            cambios.append(_cambio("productos", f"{nombre} — cantidad", _qty(a["qty"]), _qty(n["qty"])))
        if con_precio and a["precio"] != n["precio"]:
            cambios.append(_cambio("productos", f"{nombre} — precio unitario",
                                   _miles(a["precio"]) if a["precio"] is not None else None,
                                   _miles(n["precio"]) if n["precio"] is not None else None))
        elif con_precio and a["qty"] == n["qty"] and a["total"] != n["total"]:
            cambios.append(_cambio("productos", f"{nombre} — total",
                                   _miles(a["total"]) if a["total"] is not None else None,
                                   _miles(n["total"]) if n["total"] is not None else None))
        if con_precio and a["iva"] != n["iva"]:
            # IVA (B3 T4): cambiar la tarifa cambia lo que paga el cliente ('IVA 19%' -> 'IVA 5%').
            cambios.append(_cambio("productos", f"{nombre} — IVA", etiqueta_tarifa_iva(a["iva"]),
                                   etiqueta_tarifa_iva(n["iva"])))
        if a["sku"] != n["sku"]:
            # Vincular una linea libre al catalogo no cambia lo que paga el cliente: campo aparte.
            cambios.append(_cambio(
                "productos_sku", nombre,
                f"SKU {a['sku']}" if a["sku"] else "Texto libre",
                f"SKU {n['sku']}" if n["sku"] else "Sin catálogo",
            ))
    for clave, a in ia.items():
        if clave not in idx:
            cambios.append(_cambio("productos", "Producto eliminado", _resumen_linea(a, con_precio), None))
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
            cambios.extend(_cambios_productos(a, d, con_precio=entidad not in _SIN_PRECIO))
        else:
            cambios.append(_cambio(campo, etiqueta, _mostrar(campo, a, usuarios), _mostrar(campo, d, usuarios)))
    if len(cambios) > CAMBIOS_MAX:
        resto = len(cambios) - CAMBIOS_MAX
        cambios = cambios[:CAMBIOS_MAX] + [_cambio("mas", f"y {resto} cambios más", None, None)]
    return cambios


def cambio_simple(campo, etiqueta, antes, despues):
    """Un cambio de texto suelto, para un dato que no es columna del documento (H21: la ciudad del cliente en la
    Actividad de la SC): el dict {campo, etiqueta, antes, despues} si los textos normalizados difieren, o None."""
    a, d = _texto(antes), _texto(despues)
    if a == d:
        return None
    return _cambio(campo, etiqueta, _mostrar(campo, a, None), _mostrar(campo, d, None))


def afecta_precio(cambios):
    return any(c["campo"] in _AFECTA_PRECIO for c in cambios)


def cambian_productos(antes, despues):
    """True si cambio algo de los productos que ve el cliente (linea agregada o quitada, nombre,
    cantidad o precio). Vincular una linea al catalogo (sku) no cuenta, ni reordenarlas."""
    return any(c["campo"] == "productos" for c in _cambios_productos(_lineas(antes), _lineas(despues)))


# H26: renglones VIEJOS de la Actividad de una SC, de antes de _SIN_PRECIO. ' a $X' es el sufijo que dejaba
# _resumen_linea (_miles: '$1.234.567', '-$5.000'; con decimales, ',5').
_PRECIO_AL_FINAL = re.compile(r" a -?\$[\d.]+(?:,\d+)?$")
_ETIQUETAS_CON_RESUMEN = ("Producto agregado", "Producto eliminado")
_SUFIJOS_DE_PRECIO = (" — precio unitario", " — total")


def _es_cambio_de_precio_de_linea(cambio) -> bool:
    """Entrada '{producto} — precio unitario' o '{producto} — total' (las que la SC ya no registra)."""
    return (isinstance(cambio, dict) and cambio.get("campo") == "productos"
            and isinstance(cambio.get("etiqueta"), str) and cambio["etiqueta"].endswith(_SUFIJOS_DE_PRECIO))


def limpiar_precios_sc(cambios):
    """Los `cambios` de un renglon viejo de SC sin precios (sobre una copia), o None si no hay nada que quitar.

    En 'Producto agregado' / 'Producto eliminado' quita el ' a $X' final de antes y despues, y quita las entradas
    '— precio unitario' y '— total' de los productos. Lo demas (cantidad, vinculo al catalogo, notas...) no se toca."""
    if not isinstance(cambios, list):
        return None
    nuevos, cambio_algo = [], False
    for c in copy.deepcopy(cambios):
        if _es_cambio_de_precio_de_linea(c):
            cambio_algo = True
            continue
        if isinstance(c, dict) and c.get("campo") == "productos" and c.get("etiqueta") in _ETIQUETAS_CON_RESUMEN:
            for lado in ("antes", "despues"):
                if isinstance(c.get(lado), str):
                    limpio = _PRECIO_AL_FINAL.sub("", c[lado])
                    if limpio != c[lado]:
                        c[lado], cambio_algo = limpio, True
        nuevos.append(c)
    return nuevos if cambio_algo else None


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
        # IVA (B3 T4): con IVA discriminado el total ya lo incluye y el renglon lo dice; con IVA 0, como antes.
        iva = _num(despues.get("tax_cop"))
        con_iva = f" (IVA incluido: {_miles(iva)})" if iva is not None and iva > 0 else ""
        if despues_total is not None and despues_total > 0 and not antes_total:
            return "RECOTIZADA", f"Cotización calculada: total {_miles(despues_total)}{con_iva}"
        if antes_total is not None and despues_total is not None and antes_total != despues_total:
            diferencia = despues_total - antes_total
            signo = "+" if diferencia > 0 else "-"
            return "RECOTIZADA", (f"Re-cotización: total {_miles(antes_total)} → {_miles(despues_total)} "
                                  f"({signo}{_miles(abs(diferencia))}){con_iva}")
        if cambios:
            return "RECOTIZADA", "Re-cotización: se actualizaron los precios (el total no cambió)"
        return "RECOTIZADA", "Re-cotización guardada sin cambios en los precios"
    if not cambios:
        return None
    return "UPDATED", _titulo_edicion(entidad, cambios)
