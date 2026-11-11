"""B4 T24 (B17): la regla del motivo de una cancelación, en un solo lugar. La usan el PATCH del pedido de venta
(erp_ventas.update_pedido), su cancelación de fase4 (erp_ventas_fase4.cancel_sale_order) y el PATCH del pedido de compra
(erp_compras._validar_transicion_pec). Antes había tres copias de la cifra y del texto.
"""

MIN_MOTIVO_CANCELACION = 5
TEXTO_MOTIVO_CANCELACION = f"Indica el motivo de la cancelación (mínimo {MIN_MOTIVO_CANCELACION} caracteres)."
