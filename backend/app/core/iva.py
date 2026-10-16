"""Tarifas de IVA de Ventas (Bloque 3, IVA-PRODUCTO; T3 escribe esta primera parte, T4 agrega el calculo).

La tarifa es un dato del producto (products.tarifa_iva, fa6_027) y se guarda como CODIGO: '19', '5', 'EXENTO' o
'EXCLUIDO'; None = sin definir (la linea usa la tarifa por defecto de Configuracion). Exento y Excluido valen 0%, pero
no son lo mismo para el contador: por eso '0' no se acepta como tarifa.

Puro y sin base de datos (RP21: T13 compara TARIFAS_IVA, normalizar_tarifa_iva, pct_tarifa_iva y etiqueta_tarifa_iva con
frontend/src/lib/iva.js corriendo los dos lados), salvo las dos funciones que reciben la sesion:
- tarifa_iva_defecto(db): la clave iva_tarifa_defecto de admin_config, leida con admin_config.leer_config (RP17).
- tarifas_de_producto(db, sku_ids): la tarifa del producto de cada SKU, con una sola consulta (los modelos se importan
  dentro, para que importar este modulo no cargue la base).
"""
import logging
from decimal import Decimal
from typing import Optional

from app.core.admin_config import leer_config

logger = logging.getLogger(__name__)

TARIFAS_IVA = {"19": Decimal("19"), "5": Decimal("5"), "EXENTO": Decimal("0"), "EXCLUIDO": Decimal("0")}
ORDEN_TARIFAS = ("19", "5", "EXENTO", "EXCLUIDO")
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


def pct_tarifa_iva(codigo) -> Decimal:
    """El porcentaje de la tarifa (Decimal): '19' -> 19, '5' -> 5, 'EXENTO' y 'EXCLUIDO' -> 0. Sin tarifa (None o '') ->
    0: el IVA no se discrimina. Acepta lo mismo que normalizar_tarifa_iva y lanza su ValueError."""
    tarifa = normalizar_tarifa_iva(codigo)
    return Decimal("0") if tarifa is None else TARIFAS_IVA[tarifa]


def etiqueta_tarifa_iva(codigo) -> str:
    """La etiqueta que se muestra: 'IVA 19%', 'IVA 5%', 'Exento', 'Excluido'; sin tarifa, 'IVA no discriminado'.
    Acepta lo mismo que normalizar_tarifa_iva y lanza su ValueError."""
    tarifa = normalizar_tarifa_iva(codigo)
    return ETIQUETA_SIN_TARIFA if tarifa is None else ETIQUETAS_TARIFA_IVA[tarifa]


def tarifa_iva_defecto(db) -> str:
    """La tarifa por defecto de Configuracion (admin_config.iva_tarifa_defecto, normalizada). Si la clave falta, no es
    valida o la lectura falla (queda en el log), TARIFA_IVA_POR_DEFECTO."""
    try:
        guardada = leer_config(db, [CLAVE_TARIFA_DEFECTO]).get(CLAVE_TARIFA_DEFECTO)
    except Exception:
        logger.exception("No se pudo leer %s de admin_config", CLAVE_TARIFA_DEFECTO)
        return TARIFA_IVA_POR_DEFECTO
    try:
        return normalizar_tarifa_iva(guardada) or TARIFA_IVA_POR_DEFECTO
    except ValueError:
        return TARIFA_IVA_POR_DEFECTO


def tarifas_de_producto(db, sku_ids) -> dict:
    """{sku_id: tarifa_iva del producto de ese SKU (None = sin definir)} con UNA consulta (SKU join producto). Un SKU
    que no existe no aparece. Sin ids, {} sin consultar."""
    ids = {int(i) for i in sku_ids}
    if not ids:
        return {}
    from app.models.catalog import Product, ProductSKU
    filas = (db.query(ProductSKU.id, Product.tarifa_iva)
             .join(Product, Product.id == ProductSKU.product_id)
             .filter(ProductSKU.id.in_(ids)).all())
    return {sku_id: tarifa for sku_id, tarifa in filas}
