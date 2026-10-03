"""Busqueda por producto dentro de documentos con lineas (SC, COT, PVEN, PEC...).

Todos guardan `productos` como una columna JSON (lista de lineas). El nombre de la
linea vive en `product_name` en casi todos los flujos, y en `name`/`nombre` en otras
pantallas, asi que se compara contra las tres claves.
"""
from sqlalchemy import case, cast, exists, func, literal, or_, select
from sqlalchemy.dialects.postgresql import JSONB

_CLAVES_NOMBRE = ("product_name", "name", "nombre")


def productos_ilike(col, like: str):
    """Condicion SQL: alguna linea de la columna JSON `col` tiene un nombre que coincide
    (ILIKE) con `like` (ya con los comodines, p.ej. f"%{termino}%").

    La columna es JSON, no JSONB: se castea a JSONB, que ademas decodifica los escapes
    \\uXXXX de las tildes ("colch\\u00f3n" -> "colchón"). jsonb_array_elements falla si el
    valor no es un arreglo (p.ej. un JSON null), por eso se normaliza a '[]'.
    """
    as_jsonb = cast(col, JSONB)
    arreglo = case(
        (func.jsonb_typeof(as_jsonb) == "array", as_jsonb),
        else_=cast(literal("[]"), JSONB),
    )
    lineas = func.jsonb_array_elements(arreglo).table_valued("value").alias("linea_producto")
    return exists(
        select(literal(1))
        .select_from(lineas)
        .where(or_(*[lineas.c.value.op("->>")(k).ilike(like) for k in _CLAVES_NOMBRE]))
    )
