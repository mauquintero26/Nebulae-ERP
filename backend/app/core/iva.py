"""Tarifas de IVA de Ventas (Bloque 3, IVA-PRODUCTO; T3 escribe esta primera parte, T4 agrega el calculo).

La tarifa es un dato del producto (products.tarifa_iva, fa6_027) y se guarda como CODIGO: '19', '5', 'EXENTO' o
'EXCLUIDO'; None = sin definir (la linea usa la tarifa por defecto de Configuracion). Exento y Excluido valen 0%, pero
no son lo mismo para el contador: por eso '0' no se acepta como tarifa.

Puro y sin base de datos (RP21: T13 compara TARIFAS_IVA, normalizar_tarifa_iva, pct_tarifa_iva y etiqueta_tarifa_iva con
frontend/src/lib/iva.js corriendo los dos lados), salvo las dos funciones que reciben la sesion:
- tarifa_iva_defecto(db): la clave iva_tarifa_defecto de admin_config, leida con admin_config.leer_config (RP17).
- tarifas_de_producto(db, sku_ids): la tarifa del producto de cada SKU, con una sola consulta (los modelos se importan
  dentro, para que importar este modulo no cargue la base).

Parte 2 (T4, tambien pura): lineas_con_tarifa, calcular_totales_cotizacion, resumen_iva_por_tarifa y
desglose_documento, con la REGLA DE CALCULO en pesos enteros que esta antes de ellas (T13 las compara con lib/iva.js).

Contrato (ronda r1 de T3): normalizar_tarifa_iva es la validacion AL ESCRIBIR y lanza ValueError con un valor no valido;
pct_tarifa_iva y etiqueta_tarifa_iva son de PRESENTACION y, como lib/iva.js, tratan un codigo no valido igual que None
(0 e 'IVA no discriminado') sin lanzar: un JSON viejo con un codigo raro no tumba el documento.
"""
import logging
import re
from decimal import Decimal
from typing import Optional

from app.core.admin_config import leer_config
from app.core.ventas_dinero import redondear_peso, repartir_proporcional  # puro: sin import circular

logger = logging.getLogger(__name__)

# Fuente unica de los codigos (en el orden en que se muestran). El CHECK ck_products_tarifa_iva de fa6_027 congela los
# mismos cuatro: test_tarifa_iva_producto compara los dos.
TARIFAS_IVA = {"19": Decimal("19"), "5": Decimal("5"), "EXENTO": Decimal("0"), "EXCLUIDO": Decimal("0")}
ORDEN_TARIFAS = tuple(TARIFAS_IVA)
ETIQUETAS_TARIFA_IVA = {"19": "IVA 19%", "5": "IVA 5%", "EXENTO": "Exento", "EXCLUIDO": "Excluido"}
ETIQUETA_SIN_TARIFA = "IVA no discriminado"
TARIFA_IVA_POR_DEFECTO = "19"  # R8: respuesta del usuario a iva_tarifa_defecto
CLAVE_TARIFA_DEFECTO = "iva_tarifa_defecto"
MENSAJE_TARIFA_INVALIDA = "Tarifa de IVA no válida: usa 19%, 5%, Exento o Excluido."


def normalizar_tarifa_iva(valor) -> Optional[str]:
    """El codigo de tarifa de `valor`, o None si viene vacio (sin definir).

    - None, '' o solo espacios -> None.
    - Un numero entero (19, 19.0, Decimal('5')) se lee como su texto ('19', '5').
    - Un texto se recorta, se pasa a mayusculas y se le quitan 'IVA' y '%': '19', '19%', ' iva 19 ' -> '19';
      'IVA 5%' -> '5'; 'exento' -> 'EXENTO'; 'Excluido' -> 'EXCLUIDO'.
    - Cualquier otra cosa lanza ValueError(MENSAJE_TARIFA_INVALIDA): '0' (no dice si es exento o excluido), '16', 'abc',
      '19.0' (texto), 19.5, NaN, un bool, una lista..."""
    if valor is None:
        return None
    if isinstance(valor, bool):
        raise ValueError(MENSAJE_TARIFA_INVALIDA)
    if isinstance(valor, (int, float, Decimal)):
        try:
            numero = Decimal(str(valor))
        except ArithmeticError:
            raise ValueError(MENSAJE_TARIFA_INVALIDA)
        if not numero.is_finite() or numero != numero.to_integral_value():
            raise ValueError(MENSAJE_TARIFA_INVALIDA)
        texto = str(int(numero))
    elif isinstance(valor, str):
        if not valor.strip():
            return None
        texto = valor.upper().replace("IVA", "").replace("%", "").strip()
    else:
        raise ValueError(MENSAJE_TARIFA_INVALIDA)
    if texto not in TARIFAS_IVA:
        raise ValueError(MENSAJE_TARIFA_INVALIDA)
    return texto


def _tarifa_o_none(codigo) -> Optional[str]:
    """El codigo normalizado, o None si viene vacio O NO ES VALIDO (para presentar, sin lanzar)."""
    try:
        return normalizar_tarifa_iva(codigo)
    except ValueError:
        return None


def pct_tarifa_iva(codigo) -> Decimal:
    """El porcentaje de la tarifa (Decimal): '19' -> 19, '5' -> 5, 'EXENTO' y 'EXCLUIDO' -> 0. Acepta lo mismo que
    normalizar_tarifa_iva ('exento', 19...). Sin tarifa (None o '') o con un codigo que normalizar_tarifa_iva rechaza
    ('16', 'abc', True...) -> 0, sin lanzar (ruling r1: como pctTarifaIva de lib/iva.js)."""
    tarifa = _tarifa_o_none(codigo)
    return Decimal("0") if tarifa is None else TARIFAS_IVA[tarifa]


def etiqueta_tarifa_iva(codigo) -> str:
    """La etiqueta que se muestra: 'IVA 19%', 'IVA 5%', 'Exento', 'Excluido'. Sin tarifa (None o '') o con un codigo
    que normalizar_tarifa_iva rechaza -> 'IVA no discriminado', sin lanzar (ruling r1: como etiquetaTarifaIva de
    lib/iva.js)."""
    tarifa = _tarifa_o_none(codigo)
    return ETIQUETA_SIN_TARIFA if tarifa is None else ETIQUETAS_TARIFA_IVA[tarifa]


def tarifa_iva_defecto(db) -> str:
    """La tarifa por defecto de Configuracion (admin_config.iva_tarifa_defecto, normalizada). Si la clave falta, no es
    valida o la lectura falla (queda en el log), TARIFA_IVA_POR_DEFECTO.

    La lectura va en un SAVEPOINT (r1): un error de la base se revierte solo hasta ahi y la sesion sigue sirviendo para
    las consultas siguientes del mismo request (sin el, PostgreSQL deja la transaccion abortada). Lo pendiente en la
    sesion se manda (flush) ANTES del try: si es invalido, su propio error sale tal cual y no se confunde con la lectura
    de la Configuracion (begin_nested haria ese mismo flush dentro del try)."""
    db.flush()
    try:
        with db.begin_nested():
            guardada = leer_config(db, [CLAVE_TARIFA_DEFECTO]).get(CLAVE_TARIFA_DEFECTO)
    except Exception:
        logger.exception("No se pudo leer %s de admin_config", CLAVE_TARIFA_DEFECTO)
        return TARIFA_IVA_POR_DEFECTO
    try:
        return normalizar_tarifa_iva(guardada) or TARIFA_IVA_POR_DEFECTO
    except ValueError:
        return TARIFA_IVA_POR_DEFECTO


_ID_NUMERICO = re.compile(r"[0-9]+")


def sku_id_entero(valor) -> Optional[int]:
    """El id de SKU como entero: un int (no bool) o un texto de solo digitos (con espacios en los bordes). Todo lo demas
    (None, bool, '', 'abc', 12.5, '-3') -> None. Las lineas del JSON productos guardan el sku_id como numero o texto."""
    if isinstance(valor, bool):
        return None
    if isinstance(valor, int):
        return valor
    if isinstance(valor, str) and _ID_NUMERICO.fullmatch(valor.strip()):
        return int(valor.strip())
    return None


def tarifas_de_producto(db, sku_ids) -> dict:
    """{sku_id: tarifa_iva del producto de ese SKU (None = sin definir)} con UNA consulta (SKU join producto). Un SKU
    que no existe no aparece. Los ids pasan por sku_id_entero: enteros y textos numericos valen; bool, None y textos no
    numericos se ignoran (un True no consulta el SKU 1) y no lanzan. Sin ningun id valido, {} sin consultar."""
    ids = {i for i in (sku_id_entero(v) for v in sku_ids) if i is not None}
    if not ids:
        return {}
    from app.models.catalog import Product, ProductSKU
    filas = (db.query(ProductSKU.id, Product.tarifa_iva)
             .join(Product, Product.id == ProductSKU.product_id)
             .filter(ProductSKU.id.in_(ids)).all())
    return {sku_id: tarifa for sku_id, tarifa in filas}


# ─── Parte 2 (T4): el IVA de la cotizacion, en pesos enteros ─────────────────────────────────────────────────────
#
# Pura (sin base de datos): RP21, T13 compara calcular_totales_cotizacion, repartir_proporcional (ventas_dinero) y
# desglose_documento con lib/iva.js corriendo los dos lados. REGLA DE CALCULO (la misma en lib/iva.js), por linea i con
# unit_i = redondear_peso(unit_price_cop), qty_i > 0 y una tarifa valida:
#  1. bruto_i = redondear_peso(unit_i x qty_i): se guarda como total_cop (sin IVA y antes del descuento, como hoy).
#  2. subtotal = suma de bruto_i (subtotal_cop: antes del descuento y del IVA).
#  3. pb = round(descuento_pct x 100) (puntos basicos enteros); D = redondear_peso(subtotal x pb / 10000).
#  4. D se reparte con repartir_proporcional(bruto, D): d_i (la suma da D exacto).
#  5. base_i = bruto_i - d_i (base gravable).  6. iva_i = redondear_peso(base_i x pct_i / 100), en la linea.
#  7. total_con_iva_i = base_i + iva_i.  8. IVA = suma de iva_i; total = subtotal - D + IVA = suma de total_con_iva_i.
#  9. Resumen por tarifa en ORDEN_TARIFAS: base = suma de base_i e iva = suma de iva_i de cada tarifa presente.

_NOMBRES_LINEA = ("product_name", "nombre", "name", "producto", "descripcion")
_CIEN = Decimal("100")
MENSAJE_DESCUENTO_INVALIDO = "El descuento debe estar entre 0 y 100%."


def nombre_de_linea(p, indice: int) -> str:
    """El nombre que ve el asesor en un mensaje: product_name (o nombre, name...) o 'línea N' (N desde 1)."""
    if isinstance(p, dict):
        for clave in _NOMBRES_LINEA:
            valor = p.get(clave)
            if isinstance(valor, str) and valor.strip():
                return valor.strip()
    return f"línea {indice + 1}"


def _tiene_tarifa(p) -> bool:
    """La linea trae iva_tarifa (sea o no valida): un dict con un valor que no es None ni un texto en blanco."""
    if not isinstance(p, dict):
        return False
    valor = p.get("iva_tarifa")
    return valor is not None and not (isinstance(valor, str) and not valor.strip())


def lineas_con_tarifa(productos) -> str:
    """'todas' (hay lineas y todas traen iva_tarifa), 'ninguna' (ninguna la trae, o no hay lineas) o 'mezcla'. Una
    linea que no es un dict no trae tarifa. Con 'todas' el servidor calcula el IVA; con 'ninguna' el documento sigue
    como antes (IVA no discriminado); 'mezcla' es un 422 al guardar."""
    lineas = productos if isinstance(productos, list) else []
    con_tarifa = sum(1 for p in lineas if _tiene_tarifa(p))
    if not lineas or con_tarifa == 0:
        return "ninguna"
    return "todas" if con_tarifa == len(lineas) else "mezcla"


def _peso_entero(valor) -> int:
    """redondear_peso como int, tolerante (presentacion de datos guardados): lo que no es un monto vale 0."""
    try:
        return int(redondear_peso(valor))
    except ValueError:
        return 0


def resumen_iva_por_tarifa(productos) -> list:
    """[{tarifa, etiqueta, base_cop, iva_cop}] en el orden de ORDEN_TARIFAS, una fila por tarifa presente, sumando los
    campos YA GUARDADOS de cada linea (base_iva_cop e iva_cop, en pesos enteros). Una linea sin tarifa, con un codigo
    que no es valido o que no es un dict no cuenta; un monto que no es numerico vale 0 (no recalcula nada)."""
    sumas = {}
    for p in productos if isinstance(productos, list) else []:
        if not isinstance(p, dict):
            continue
        tarifa = _tarifa_o_none(p.get("iva_tarifa"))
        if tarifa is None:
            continue
        base, iva = sumas.get(tarifa, (0, 0))
        sumas[tarifa] = (base + _peso_entero(p.get("base_iva_cop")), iva + _peso_entero(p.get("iva_cop")))
    return [{"tarifa": t, "etiqueta": ETIQUETAS_TARIFA_IVA[t], "base_cop": sumas[t][0], "iva_cop": sumas[t][1]}
            for t in ORDEN_TARIFAS if t in sumas]


def _puntos_basicos(descuento_pct) -> int:
    """El descuento global en puntos basicos enteros (2 decimales): round(descuento_pct x 100), ROUND_HALF_UP. None o
    '' = 0. ValueError(MENSAJE_DESCUENTO_INVALIDO) si no es un numero o esta fuera de 0..100."""
    if descuento_pct is None or (isinstance(descuento_pct, str) and not descuento_pct.strip()):
        return 0
    if isinstance(descuento_pct, bool):
        raise ValueError(MENSAJE_DESCUENTO_INVALIDO)
    try:
        pct = Decimal(str(descuento_pct).strip())
    except ArithmeticError:
        raise ValueError(MENSAJE_DESCUENTO_INVALIDO) from None
    if not pct.is_finite() or pct < 0 or pct > _CIEN:
        raise ValueError(MENSAJE_DESCUENTO_INVALIDO)
    return int(redondear_peso(pct * _CIEN))


def _cantidad(p, nombre) -> Decimal:
    """La cantidad de la linea (qty), > 0. ValueError legible si falta, no es un numero o no es positiva."""
    valor = p.get("qty")
    mensaje = f"La cantidad de '{nombre}' debe ser mayor que 0."
    if valor is None or isinstance(valor, bool):
        raise ValueError(mensaje)
    try:
        qty = Decimal(str(valor).strip())
    except ArithmeticError:
        raise ValueError(mensaje) from None
    if not qty.is_finite() or qty <= 0:
        raise ValueError(mensaje)
    return qty


def calcular_totales_cotizacion(productos, descuento_pct) -> dict:
    """El IVA de la cotizacion con la REGLA DE CALCULO de arriba, en pesos enteros (int). Devuelve:
    - lineas: COPIAS NUEVAS de cada dict (la entrada no se toca), con iva_tarifa normalizada, iva_pct, unit_price_cop
      (redondeado), total_cop (= bruto, sin IVA y antes del descuento), descuento_cop, base_iva_cop, iva_cop y
      total_con_iva_cop; el resto de cada linea se conserva.
    - subtotal_cop, descuento_cop, iva_cop, total_cop e iva_por_tarifa (resumen_iva_por_tarifa de esas lineas).

    Lanza ValueError con un mensaje legible que nombra la linea si una linea no es un producto, no trae tarifa
    ("Indica la tarifa de IVA de '<nombre>'."), la tarifa no es valida ("Tarifa de IVA no válida en '<nombre>': ..."),
    la cantidad no es mayor que 0 o el precio unitario no es un monto >= 0; y MENSAJE_DESCUENTO_INVALIDO si el
    descuento no es un numero entre 0 y 100. Los llamadores lo convierten en 422 (R12)."""
    pb = _puntos_basicos(descuento_pct)
    lineas, brutos = [], []
    for i, p in enumerate(productos if isinstance(productos, list) else []):
        nombre = nombre_de_linea(p, i)
        if not isinstance(p, dict):
            raise ValueError(f"La {nombre} no es un producto válido.")
        if not _tiene_tarifa(p):
            raise ValueError(f"Indica la tarifa de IVA de '{nombre}'.")
        try:
            tarifa = normalizar_tarifa_iva(p.get("iva_tarifa"))
        except ValueError:
            raise ValueError(f"Tarifa de IVA no válida en '{nombre}': usa 19%, 5%, Exento o Excluido.") from None
        qty = _cantidad(p, nombre)
        try:
            unit = redondear_peso(p.get("unit_price_cop"))
        except ValueError:
            unit = Decimal("-1")
        if unit < 0:
            raise ValueError(f"El precio unitario de '{nombre}' no es válido.")
        bruto = int(redondear_peso(unit * qty))
        brutos.append(bruto)
        lineas.append({**p, "iva_tarifa": tarifa, "iva_pct": int(TARIFAS_IVA[tarifa]), "unit_price_cop": int(unit),
                       "total_cop": bruto})
    subtotal = sum(brutos)
    descuento = int(redondear_peso(Decimal(subtotal) * pb / Decimal(10000)))
    for linea, bruto, d in zip(lineas, brutos, repartir_proporcional(brutos, descuento)):
        base = bruto - d
        iva = int(redondear_peso(Decimal(base) * TARIFAS_IVA[linea["iva_tarifa"]] / _CIEN))
        linea.update(descuento_cop=d, base_iva_cop=base, iva_cop=iva, total_con_iva_cop=base + iva)
    return {"lineas": lineas, "subtotal_cop": subtotal, "descuento_cop": descuento,
            "iva_cop": sum(l["iva_cop"] for l in lineas), "total_cop": sum(l["total_con_iva_cop"] for l in lineas),
            "iva_por_tarifa": resumen_iva_por_tarifa(lineas)}


def _campo(doc, nombre):
    return doc.get(nombre) if isinstance(doc, dict) else getattr(doc, nombre, None)


def desglose_documento(doc) -> dict:
    """{iva_discriminado, iva_cop, descuento_cop, iva_por_tarifa} de una cotizacion o un pedido (el objeto del ORM o un
    dict con productos, subtotal_cop, tax_cop y total_cop), en pesos enteros y sin recalcular nada (C2: el documento
    del cliente lo mapea tal cual):
    - iva_discriminado: hay lineas y todas traen iva_tarifa.
    - iva_cop: redondear_peso(tax_cop) (0 si falta).
    - descuento_cop: max(0, subtotal + IVA - total), cada uno al peso.
    - iva_por_tarifa: resumen_iva_por_tarifa de las lineas, o [] si no esta discriminado."""
    productos = _campo(doc, "productos")
    discriminado = lineas_con_tarifa(productos) == "todas"
    subtotal = _peso_entero(_campo(doc, "subtotal_cop"))
    iva = _peso_entero(_campo(doc, "tax_cop"))
    total = _peso_entero(_campo(doc, "total_cop"))
    return {"iva_discriminado": discriminado, "iva_cop": iva, "descuento_cop": max(0, subtotal + iva - total),
            "iva_por_tarifa": resumen_iva_por_tarifa(productos) if discriminado else []}
