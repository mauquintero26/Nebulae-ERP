"""Tarifas de IVA de Ventas (Bloque 3, IVA-PRODUCTO; T3 escribe esta primera parte, T4 agrega el calculo).

La tarifa es un dato del producto (products.tarifa_iva, fa6_027) y se guarda como CODIGO: '19', '5', 'EXENTO' o
'EXCLUIDO'; None = sin definir (la linea usa la tarifa por defecto de Configuracion). Exento y Excluido valen 0%, pero
no son lo mismo para el contador: por eso '0' no se acepta como tarifa.

Puro y sin base de datos (RP21: T13 compara TARIFAS_IVA, normalizar_tarifa_iva, pct_tarifa_iva y etiqueta_tarifa_iva con
frontend/src/lib/iva.js corriendo los dos lados), salvo las dos funciones que reciben la sesion:
- tarifa_iva_defecto(db): la clave iva_tarifa_defecto de admin_config, leida con admin_config.leer_config (RP17).
- tarifas_de_producto(db, sku_ids): la tarifa del producto de cada SKU, con una sola consulta (los modelos se importan
  dentro, para que importar este modulo no cargue la base).

Contrato (ronda r1 de T3): normalizar_tarifa_iva es la validacion AL ESCRIBIR y lanza ValueError con un valor no valido;
pct_tarifa_iva y etiqueta_tarifa_iva son de PRESENTACION y, como lib/iva.js, tratan un codigo no valido igual que None
(0 e 'IVA no discriminado') sin lanzar: un JSON viejo con un codigo raro no tumba el documento.
"""
import logging
import re
from decimal import Decimal
from typing import Optional

from app.core.admin_config import leer_config

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
    las consultas siguientes del mismo request (sin el, PostgreSQL deja la transaccion abortada). Como todo
    begin_nested, hace flush de lo pendiente en la sesion antes de abrir el SAVEPOINT."""
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
