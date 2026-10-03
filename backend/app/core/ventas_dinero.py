"""Dinero de Ventas en pesos enteros (H42): redondeo y formato compartidos.

Modulo puro, sin FastAPI ni DB, para que lo importen erp_ventas.py y erp_ventas_fase4.py sin
import circular (fase4 no importa erp_ventas). Todo monto de COT / PVEN / PXP se guarda y se
muestra al peso: exacto, nunca a la centena ni al mil. El frontend tiene el espejo en
frontend/src/lib/pesos.js (redondearPeso / formatoPesos).
"""
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

_UN_PESO = Decimal("1")


def redondear_peso(valor) -> Decimal:
    """Redondea un monto al peso entero (ROUND_HALF_UP, 0 decimales) y devuelve un Decimal.

    - None y '' (monto ausente) valen 0: redondear_peso(None) == Decimal('0').
    - Acepta int, float, Decimal y str numerico. El float pasa por str() para no arrastrar el ruido
      binario (2786923.08 -> 2786923, no 2786922.9999...).
    - Un valor que no es un monto (texto no numerico, NaN, infinito, bool, lista...) lanza ValueError;
      los endpoints lo convierten en 422 en vez de dejar que llegue a la base.
    - En empate (x.5) redondea alejandose de cero; con positivos coincide con Math.round del frontend.
    """
    if valor is None or (isinstance(valor, str) and not valor.strip()):
        return Decimal(0)
    if isinstance(valor, bool):
        raise ValueError(f"Monto no válido: {valor!r}")
    try:
        n = Decimal(str(valor))
        if not n.is_finite():
            raise ValueError(f"Monto no válido: {valor!r}")
        redondeado = n.quantize(_UN_PESO, rounding=ROUND_HALF_UP)
        return redondeado if redondeado else Decimal(0)  # sin "-0" cuando un negativo chico redondea a cero
    except InvalidOperation:  # texto no numerico, o tan grande que no cabe en la precision
        raise ValueError(f"Monto no válido: {valor!r}") from None


def pesos(valor) -> str:
    """Formato es-CO a peso entero: '$1.724.400', '-$5.000', '$0'. Las mismas reglas de entrada que
    redondear_peso (None vale 0). Reemplaza al f"${x:,.0f}", que separa los miles con coma (EE. UU.)."""
    n = redondear_peso(valor)
    signo = "-" if n < 0 else ""
    return f"{signo}${abs(n):,.0f}".replace(",", ".")
