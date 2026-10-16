"""Bloque 3, Tarea 2 — PLANTILLA: el contrato único del documento que ve el cliente (core/documento_cliente.py, C2).

armar_documento(db, tipo, *, ...) devuelve SIEMPRE la misma forma para SC, COT y PVEN (C2 con los nombres de R24):
  tipo, titulo, numero, estado, fecha_emision (ISO con 'Z'), fecha_entrega_estimada ('AAAA-MM-DD'),
  cliente {nombre, direccion_entrega}, atendido_por, con_precios,
  lineas [{n, descripcion, cantidad, precio_unitario, total_linea, iva_etiqueta, iva_pct, anticipo}],
  totales {subtotal, descuento_pct, descuento, impuestos [{etiqueta, base, valor}], ajuste_redondeo, total} | None,
  pago {modalidad, anticipo_pct, anticipo, saldo, saldo_a_favor, anticipo_por_pagar, pagado, pagos, instrucciones,
        manual} | None,
  notas [{titulo, texto}], valida_hasta, terminos, mensaje_pie.
linea_publica nunca copia costos, margen, proveedor ni sku, y total_linea = redondear_peso(total_cop), sin IVA (C4).
Términos y datos para pagar salen de empresa.textos_documento (solo COT y PVEN; R8). Los constructores documento_sc,
documento_cot y documento_pven son de T5.

Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_documento_cliente
"""
from datetime import date, datetime

from sqlalchemy import text

LINEA_COT = {"product_name": "  Cuna Colecho  ", "qty": 2, "unit_price_cop": 342461.6, "total_cop": 684923.2,
             "total_con_iva_cop": 815058, "cost_usd": 50, "margen_pct": 30, "proveedor": "Proveedor X",
             "sku": "SKU-1", "sku_id": 9, "flete_usd": 3, "es_libre": False}
TOTALES = {"subtotal": 684923.2, "descuento_pct": 10, "descuento": 68492.3,
           "impuestos": [{"etiqueta": "IVA 19%", "base": 616430.88, "valor": 117121.87, "tarifa": "19"}],
           "ajuste_redondeo": 0, "total": 733552.4}
PAGO_COT = {"modalidad": "Contado", "anticipo_pct": 60, "anticipo": 440131.4, "saldo": 293421, "saldo_a_favor": 0,
            "anticipo_por_pagar": 440131.4, "manual": False, "nota_interna": "no debe salir"}


def _limpiar_empresa(db):
    db.execute(text("DELETE FROM admin_config WHERE key LIKE :a OR key LIKE :b"),
               {"a": "empresa\\_%", "b": "documentos\\_%"})
    db.commit()


def _documento(db, tipo, **extra):
    from app.core.documento_cliente import armar_documento, linea_publica
    con_precios = tipo != "SC"
    datos = dict(
        numero=f"{tipo}-1", fecha_emision=datetime(2026, 10, 3, 3, 0), cliente_nombre="Ana Pérez",
        lineas=[linea_publica(LINEA_COT, con_precios, iva={"etiqueta": "IVA 19%", "pct": 19}, anticipo=440131.4)],
        con_precios=con_precios, direccion_entrega="Calle 1 # 2-3", fecha_entrega_estimada=datetime(2026, 10, 21),
        totales=TOTALES, pago=PAGO_COT, notas=[{"titulo": "Notas", "texto": "Entregar en la mañana"}],
        atendido_por="Asesora Uno", estado="PENDIENTE_CONFIRMACION", valida_hasta=date(2026, 10, 8),
    )
    datos.update(extra)
    return armar_documento(db, tipo, **datos)


def test_contrato_claves_exactas(db):
    """Una sola prueba de claves exactas para SC, COT y PVEN (C2): el documento y cada subdict."""
    from app.core import documento_cliente as dc
    assert dc.CLAVES_DOCUMENTO == frozenset({
        "tipo", "titulo", "numero", "estado", "fecha_emision", "fecha_entrega_estimada", "cliente", "atendido_por",
        "con_precios", "lineas", "totales", "pago", "notas", "valida_hasta", "terminos", "mensaje_pie"})
    assert dc.CLAVES_LINEA == frozenset({"n", "descripcion", "cantidad", "precio_unitario", "total_linea",
                                         "iva_etiqueta", "iva_pct", "anticipo"})
    assert dc.CLAVES_TOTALES == frozenset({"subtotal", "descuento_pct", "descuento", "impuestos", "ajuste_redondeo",
                                           "total"})
    assert dc.CLAVES_PAGO == frozenset({"modalidad", "anticipo_pct", "anticipo", "saldo", "saldo_a_favor",
                                        "anticipo_por_pagar", "pagado", "pagos", "instrucciones", "manual"})  # R24
    assert dc.TITULOS == {"SC": "Solicitud", "COT": "Cotización", "PVEN": "Pedido de venta"}
    _limpiar_empresa(db)
    pagos = [{"concepto": "Anticipo", "monto": 600000, "metodo": "Transferencia bancaria", "fecha": "2026-10-04",
              "referencia": "REF-SECRETA", "verificado_por": "finanzas@x"}]
    for tipo in ("SC", "COT", "PVEN"):
        pago = dict(PAGO_COT, pagado=600000, pagos=pagos) if tipo == "PVEN" else PAGO_COT
        doc = _documento(db, tipo, pago=pago)
        assert set(doc) == dc.CLAVES_DOCUMENTO, tipo
        assert doc["tipo"] == tipo and doc["titulo"] == dc.TITULOS[tipo] and doc["numero"] == f"{tipo}-1"
        assert set(doc["cliente"]) == {"nombre", "direccion_entrega"}
        assert doc["cliente"] == {"nombre": "Ana Pérez", "direccion_entrega": "Calle 1 # 2-3"}
        assert doc["atendido_por"] == "Asesora Uno" and doc["estado"] == "PENDIENTE_CONFIRMACION"
        assert [set(l) for l in doc["lineas"]] == [dc.CLAVES_LINEA]
        assert set(doc["pago"]) == dc.CLAVES_PAGO
        assert "nota_interna" not in str(doc)
        assert [set(n) for n in doc["notas"]] == [{"titulo", "texto"}]
        if tipo == "SC":
            assert doc["totales"] is None
        else:
            assert set(doc["totales"]) == dc.CLAVES_TOTALES
            assert [set(i) for i in doc["totales"]["impuestos"]] == [{"etiqueta", "base", "valor"}]
    doc = _documento(db, "PVEN", pago=dict(PAGO_COT, pagado=600000, pagos=pagos))
    assert doc["pago"]["pagos"] == [{"concepto": "Anticipo", "monto": 600000.0, "metodo": "Transferencia bancaria",
                                     "fecha": "2026-10-04"}]  # sin referencia ni quién verificó
    assert doc["pago"]["pagado"] == 600000.0

    for malo in ("PXP", "sc", None):
        try:
            _documento(db, malo)
        except ValueError:
            pass
        else:
            raise AssertionError(f"armar_documento aceptó el tipo {malo!r}")


def test_linea_publica_no_expone_costos(db):
    from app.core.documento_cliente import CLAVES_LINEA, linea_publica
    from app.core.ventas_dinero import redondear_peso
    linea = linea_publica(LINEA_COT, True, iva={"etiqueta": "IVA 19%", "pct": 19}, anticipo=440131.4)
    assert set(linea) == CLAVES_LINEA
    for interno in ("cost_usd", "margen_pct", "proveedor", "sku", "sku_id", "flete_usd", "es_libre",
                    "total_con_iva_cop", "Proveedor X", "SKU-1"):
        assert interno not in str(linea), interno
    assert linea["descripcion"] == "Cuna Colecho"
    assert linea["cantidad"] == 2
    assert linea["precio_unitario"] == float(redondear_peso(342461.6)) == 342462.0
    # C4: el total de la línea es su total_cop en pesos, SIN IVA (no total_con_iva_cop ni monto_linea con IVA).
    assert linea["total_linea"] == float(redondear_peso(LINEA_COT["total_cop"])) == 684923.0
    assert linea["iva_etiqueta"] == "IVA 19%" and linea["iva_pct"] == 19
    assert linea["anticipo"] == 440131.0
    assert linea["n"] is None  # lo numera armar_documento

    # Sin total_cop: precio x cantidad, en pesos. Sin IVA ni anticipo: None.
    sin_total = linea_publica({"product_name": "Silla", "qty": 3, "unit_price_cop": 1000.4}, True)
    assert sin_total["total_linea"] == 3001.0 and sin_total["precio_unitario"] == 1000.0
    assert sin_total["iva_etiqueta"] is None and sin_total["iva_pct"] is None and sin_total["anticipo"] is None
    # Dato viejo que no es un monto: None (la página no se cae).
    viejo = linea_publica({"nombre": "Mesa", "qty": "1", "unit_price_cop": "abc", "total_cop": "n/a"}, True)
    assert viejo["descripcion"] == "Mesa" and viejo["cantidad"] == 1
    assert viejo["precio_unitario"] is None and viejo["total_linea"] is None

    doc = _documento(db, "COT", lineas=[linea, sin_total])
    assert [l["n"] for l in doc["lineas"]] == [1, 2]


def test_sc_sin_precios(db):
    from app.core.documento_cliente import linea_publica
    _limpiar_empresa(db)
    lineas = [linea_publica({"product_name": "Cuna", "qty": 2, "unit_price_cop": 1000, "total_cop": 2000}, False),
              linea_publica({"product_name": "Silla", "qty": 3}, False)]
    pago_sc = {"modalidad": "Contado", "anticipo_pct": 60, "manual": False}
    doc = _documento(db, "SC", lineas=lineas, totales=TOTALES, pago=pago_sc)
    assert doc["con_precios"] is False
    for linea in doc["lineas"]:
        for campo in ("precio_unitario", "total_linea", "iva_etiqueta", "iva_pct", "anticipo"):
            assert linea[campo] is None, campo
    assert sum(l["cantidad"] for l in doc["lineas"]) == 5  # total_unidades no es clave del contrato (R24)
    assert doc["totales"] is None  # aunque el llamador mande totales
    assert doc["pago"] == {"modalidad": "Contado", "anticipo_pct": 60.0, "anticipo": None, "saldo": None,
                           "saldo_a_favor": None, "anticipo_por_pagar": None, "pagado": None, "pagos": None,
                           "instrucciones": None, "manual": False}

    # Aunque una línea llegue con precios, con con_precios=False el documento no los muestra.
    con_precio = linea_publica(LINEA_COT, True, anticipo=10)
    doc = _documento(db, "SC", lineas=[con_precio], pago=pago_sc)
    assert doc["lineas"][0]["precio_unitario"] is None and doc["lineas"][0]["total_linea"] is None
    assert doc["lineas"][0]["anticipo"] is None and doc["pago"]["anticipo"] is None


def test_fechas(db):
    _limpiar_empresa(db)
    doc = _documento(db, "COT")
    assert doc["fecha_emision"] == "2026-10-03T03:00:00Z"  # UTC con 'Z': el navegador lo pasa a Colombia (2 de oct.)
    assert doc["fecha_emision"].endswith("Z")
    assert doc["fecha_entrega_estimada"] == "2026-10-21"  # sin corrimiento de día
    assert doc["valida_hasta"] == "2026-10-08"
    for entrega in (date(2026, 10, 21), "2026-10-21", datetime(2026, 10, 21, 23, 59)):
        assert _documento(db, "COT", fecha_entrega_estimada=entrega)["fecha_entrega_estimada"] == "2026-10-21"
    doc = _documento(db, "SC", fecha_entrega_estimada=None, valida_hasta=None, direccion_entrega=None,
                     atendido_por="   ", notas=[{"titulo": "Nota", "texto": "  "}])
    assert doc["fecha_entrega_estimada"] is None and doc["valida_hasta"] is None
    assert doc["cliente"]["direccion_entrega"] is None and doc["atendido_por"] is None
    assert doc["notas"] == []  # una nota en blanco no se muestra


def test_textos_por_tipo(db):
    """La SC no trae términos ni datos para pagar; la COT y el PVEN traen los suyos (R8: datos_pago = Sí)."""
    from app.core import empresa
    _limpiar_empresa(db)
    empresa.guardar_cambios(db, empresa.validar_cambios({
        "terminos_cotizacion": "Términos de la cotización", "terminos_pedido": "Términos del pedido",
        "instrucciones_pago": "Bancolombia ahorros 123", "mensaje_pie": "Gracias por tu compra"}), "Prueba")

    sc = _documento(db, "SC", pago={"modalidad": "Contado", "anticipo_pct": 60})
    assert sc["terminos"] is None and sc["pago"]["instrucciones"] is None
    assert sc["mensaje_pie"] == "Gracias por tu compra"
    cot = _documento(db, "COT")
    assert cot["terminos"] == "Términos de la cotización"
    assert cot["pago"]["instrucciones"] == "Bancolombia ahorros 123"
    pven = _documento(db, "PVEN")
    assert pven["terminos"] == "Términos del pedido"
    assert pven["pago"]["instrucciones"] == "Bancolombia ahorros 123"
    assert pven["mensaje_pie"] == "Gracias por tu compra"
    # Sin pago no hay dónde ponerlos: el documento no inventa una forma de pago.
    assert _documento(db, "COT", pago=None)["pago"] is None

    _limpiar_empresa(db)
    cot = _documento(db, "COT")
    assert cot["terminos"] is None and cot["mensaje_pie"] is None and cot["pago"]["instrucciones"] is None


def test_montos_en_pesos_enteros(db):
    _limpiar_empresa(db)
    doc = _documento(db, "COT")
    t = doc["totales"]
    assert t == {"subtotal": 684923.0, "descuento_pct": 10.0, "descuento": 68492.0,
                 "impuestos": [{"etiqueta": "IVA 19%", "base": 616431.0, "valor": 117122.0}],
                 "ajuste_redondeo": 0.0, "total": 733552.0}
    assert doc["pago"]["anticipo"] == 440131.0 and doc["pago"]["anticipo_por_pagar"] == 440131.0
    assert doc["pago"]["saldo"] == 293421.0 and doc["pago"]["saldo_a_favor"] == 0.0
    assert doc["pago"]["pagado"] is None and doc["pago"]["pagos"] is None
    # Sin impuestos ni ajuste: lista vacía y None.
    doc = _documento(db, "COT", totales={"subtotal": 1000, "descuento_pct": 0, "descuento": 0, "total": 1000})
    assert doc["totales"]["impuestos"] == [] and doc["totales"]["ajuste_redondeo"] is None
