"""Las direcciones de los movimientos de inventario (inventory_movements.direction): UNA sola definición (B33).

ENTRADAS_KARDEX y SALIDAS_KARDEX son las del tablero del Kardex y las de /inventory/operations; ENTRADAS_ANALISIS y
SALIDAS_ANALISIS son las del Análisis sin una bodega (sin los traslados, que solo cuentan al mirar una bodega).
DIRECCIONES_KARDEX son todos los valores que escribe el sistema: las de entrada y salida, la cuarentena de una recepción
(erp_compras), y la pérdida o destrucción (SCRAP) y la devolución del cliente (RETURN_IN) de erp_ventas_fase4. Un
movimiento también puede no tener dirección."""

ENTRADAS_KARDEX = ("IN", "ADJUST_IN", "TRANSFER_IN", "RETURN_IN")
SALIDAS_KARDEX = ("OUT", "ADJUST_OUT", "TRANSFER_OUT", "SCRAP")
DIRECCIONES_KARDEX = ENTRADAS_KARDEX + SALIDAS_KARDEX + ("QUARANTINE",)

ENTRADAS_ANALISIS = tuple(d for d in ENTRADAS_KARDEX if d != "TRANSFER_IN")
SALIDAS_ANALISIS = tuple(d for d in SALIDAS_KARDEX if d != "TRANSFER_OUT")
