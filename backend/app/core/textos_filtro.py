"""Textos de error compartidos de los filtros de las listas (B4 T20 r2, m3): una sola definicion.

Sin FastAPI ni DB: lo importan crm.py, ecommerce.py y finance.py sin crear un ciclo.
"""


def mensaje_control(nombre: str) -> str:
    """El 422 de un caracter de control en el filtro `nombre`: «El filtro «tipo» no puede llevar caracteres de control.»
    (la busqueda q/search usa el texto de listados.MENSAJE_CONTROL)."""
    return f"El filtro «{nombre}» no puede llevar caracteres de control."
