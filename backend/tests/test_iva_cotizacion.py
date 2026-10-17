"""IVA (Bloque 3, T4): IVA por linea en la cotizacion, el pedido y la orden de pago, calculado en pesos enteros.

- core/iva.py (parte 2, pura): lineas_con_tarifa, calcular_totales_cotizacion, resumen_iva_por_tarifa,
  desglose_documento. ventas_dinero.repartir_proporcional (mayor residuo, enteros) y monto_linea con IVA (C4: solo
  para repartir el anticipo).
- PATCH/POST /ventas/cotizaciones: con tarifa en TODAS las lineas el servidor calcula subtotal, IVA y total (los
  totales del body se ignoran); sin tarifas, como hoy (H42); con tarifa en unas si y otras no, o una tarifa no valida,
  422 sin cambios. El anticipo sale del total con IVA (C18). Cambiar la tarifa congela y anula la confirmacion (H40).
- Conversion a pedido (tax_cop, tax_pct y descuento_pct por linea), PXP, cancelacion de lineas y update_pedido con
  iva_cop. La prueba 19 (vista publica) es de T5 (R10).

Numeros del recorrido (Bloque 1): Rodillo 6 x $206.769 (19%), Pintura 4 x $117.000 (19%), Cinta 10 x $13.200 (5%).
Sin descuento: IVA $331.237, total $2.171.851. Con 10%: descuento $184.061, IVA $298.113, total $1.954.666.

Los simbolos nuevos de T4 se importan DENTRO de cada prueba (el runner importa el modulo fuera de un try).
Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_iva_cotizacion
"""
import datetime
from decimal import Decimal

MOD_60_40 = "60/40 (60% anticipo - 40% pendiente)"
RAZON = "El cliente pidió la tarifa diferencial"


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _linea(nombre, qty, precio, tarifa, **extra):
    linea = {"product_name": nombre, "qty": qty, "unit_price_cop": precio, "total_cop": qty * precio, **extra}
    if tarifa is not None:
        linea["iva_tarifa"] = tarifa
    return linea


def _ejemplo(tarifas=("19", "19", "5")):
    """Las tres lineas del recorrido, cada vez una LISTA NUEVA de dicts nuevos."""
    return [_linea("Rodillo", 6, 206769, tarifas[0]), _linea("Pintura", 4, 117000, tarifas[1]),
            _linea("Cinta", 10, 13200, tarifas[2])]


def _sc(db, numero, modalidad):
    from app.models.erp_documents import CustomerRequest
    sc = CustomerRequest(numero=numero, customer_name="Cliente Prueba", modalidad_pago=modalidad, estado="CONFIRMADA")
    db.add(sc); db.commit(); db.refresh(sc)
    return sc


def _cot(db, numero, sc=None, **campos):
    from app.models.erp_documents import SalesQuotation
    campos.setdefault("estado", "BORRADOR")
    campos.setdefault("productos", _ejemplo(tarifas=(None, None, None)))
    campos.setdefault("subtotal_cop", 1840614)
    campos.setdefault("total_cop", 1840614)
    campos.setdefault("anticipo_cop", 0)
    if sc is not None:
        campos.setdefault("sc_id", sc.id)
        campos.setdefault("sc_numero", sc.numero)
    cot = SalesQuotation(numero=numero, customer_name="Cliente Prueba", **campos)
    db.add(cot); db.commit(); db.refresh(cot)
    return cot


def _patch(app_client, token, cot_id, body):
    return app_client.patch(f"/api/v1/ventas/cotizaciones/{cot_id}", json={"updated_by": "t", **body},
                            headers=auth(token))


def _recotizar(app_client, token, cot_id, productos, **extra):
    """Productos con su tarifa y recotizacion, sin totales: los calcula el servidor (la prueba 7 manda uno falso)."""
    resp = _patch(app_client, token, cot_id, {"productos": productos, "recotizacion": True, **extra})
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


def _detalle(app_client, token, cot_id):
    resp = app_client.get(f"/api/v1/ventas/cotizaciones/{cot_id}", headers=auth(token))
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


def _logs(db, entidad, entidad_id, accion=None):
    from app.models.erp_documents import ActivityLog
    db.expire_all()
    q = db.query(ActivityLog).filter(ActivityLog.entity_type == entidad, ActivityLog.entity_id == entidad_id)
    if accion:
        q = q.filter(ActivityLog.action == accion)
    return q.order_by(ActivityLog.id.asc()).all()


def _filas(r):
    return [(f["tarifa"], f["base_cop"], f["iva_cop"]) for f in r["iva_por_tarifa"]]


def _campo(r, nombre):
    return [l[nombre] for l in r["lineas"]]


# ─── 1 a 6: calculo puro ─────────────────────────────────────────────────────────────

def test_calcular_sin_descuento():
    from app.core.iva import calcular_totales_cotizacion
    r = calcular_totales_cotizacion(_ejemplo(), 0)
    assert _campo(r, "iva_cop") == [235717, 88920, 6600]
    assert r["iva_cop"] == 331237 and r["subtotal_cop"] == 1840614 and r["descuento_cop"] == 0
    assert r["total_cop"] == 2171851
    assert _campo(r, "total_con_iva_cop") == [1476331, 556920, 138600]
    assert _campo(r, "total_cop") == [1240614, 468000, 132000]  # sin IVA y antes del descuento (C4)
    assert _campo(r, "iva_pct") == [19, 19, 5]
    assert _filas(r) == [("19", 1708614, 324637), ("5", 132000, 6600)]


def test_calcular_con_descuento_10():
    from app.core.iva import calcular_totales_cotizacion
    r = calcular_totales_cotizacion(_ejemplo(), 10)
    assert r["descuento_cop"] == 184061
    assert _campo(r, "descuento_cop") == [124061, 46800, 13200]
    assert _campo(r, "base_iva_cop") == [1116553, 421200, 118800]
    assert _campo(r, "iva_cop") == [212145, 80028, 5940]
    assert r["iva_cop"] == 298113 and r["total_cop"] == 1954666 and r["subtotal_cop"] == 1840614
    assert _filas(r) == [("19", 1537753, 292173), ("5", 118800, 5940)]
    assert [f["etiqueta"] for f in r["iva_por_tarifa"]] == ["IVA 19%", "IVA 5%"]
    # El descuento como texto o Decimal da lo mismo (puntos basicos enteros).
    assert calcular_totales_cotizacion(_ejemplo(), "10")["total_cop"] == 1954666
    assert calcular_totales_cotizacion(_ejemplo(), Decimal("10.00"))["total_cop"] == 1954666


def test_iva_medio_peso_hacia_arriba():
    from app.core.iva import calcular_totales_cotizacion
    r = calcular_totales_cotizacion([_linea("Lija", 1, 50, "19")], 0)
    assert r["lineas"][0]["iva_cop"] == 10 and r["iva_cop"] == 10 and r["total_cop"] == 60


def test_exento_excluido_y_resumen():
    from app.core.iva import calcular_totales_cotizacion
    lineas = [_linea("A", 1, 100001, "19"), _linea("B", 1, 100001, "5"), _linea("C", 1, 100001, "EXENTO"),
              _linea("D", 1, 100001, "EXCLUIDO")]
    r = calcular_totales_cotizacion(lineas, 7.5)
    assert r["descuento_cop"] == 30000
    assert _campo(r, "base_iva_cop") == [92501] * 4
    assert _campo(r, "iva_cop") == [17575, 4625, 0, 0]
    assert r["total_cop"] == 392204
    assert _filas(r) == [("19", 92501, 17575), ("5", 92501, 4625), ("EXENTO", 92501, 0), ("EXCLUIDO", 92501, 0)]
    assert [f["etiqueta"] for f in r["iva_por_tarifa"]] == ["IVA 19%", "IVA 5%", "Exento", "Excluido"]


def test_invariantes_en_casos_fijos():
    from app.core.iva import calcular_totales_cotizacion
    casos = [
        (_ejemplo(), 0, 2171851),
        (_ejemplo(), 10, 1954666),
        ([_linea("Lija", 1, 50, "19")], 0, 60),
        ([_linea("A", 1, 100001, "19"), _linea("B", 1, 100001, "5"), _linea("C", 1, 100001, "EXENTO"),
          _linea("D", 1, 100001, "EXCLUIDO")], 7.5, 392204),
        ([_linea("Cuna", 2, 342462, "19")], 0, 815060),
        ([_linea("A", 3, 99999, "19"), _linea("B", 7, 1, "5"), _linea("C", 1, 55555, "19")], 33.33, 282090),
        # Ronda r1 (bordes): descuento del 100% (todo en 0), una linea de precio 0 junto a otra (solo en la funcion
        # pura: la API la rechaza), 40 lineas con residuos y una cantidad de 2,5.
        (_ejemplo(), 100, 0),
        ([_linea("Regalo", 1, 0, "19"), _linea("Cuna", 2, 342462, "19")], 10, 733554),
        ([_linea(f"P{i}", (i % 3) + 1, 997 + 131 * i, ("19", "5", "EXENTO", "EXCLUIDO")[i % 4]) for i in range(40)],
         33.33, 198069),
        ([_linea("Tela", 2.5, 12345, "19"), _linea("Botón", 3, 999, "5")], 7.5, 36883),
    ]
    for productos, descuento, total in casos:
        r = calcular_totales_cotizacion(productos, descuento)
        assert r["total_cop"] == total, (productos, descuento)
        if descuento == 100:
            assert r["iva_cop"] == 0 and _campo(r, "base_iva_cop") == [0, 0, 0] and r["descuento_cop"] == 1840614
        assert sum(_campo(r, "total_cop")) == r["subtotal_cop"], descuento
        assert sum(_campo(r, "descuento_cop")) == r["descuento_cop"], descuento
        assert sum(_campo(r, "iva_cop")) == r["iva_cop"] == sum(f["iva_cop"] for f in r["iva_por_tarifa"])
        assert sum(_campo(r, "base_iva_cop")) == sum(f["base_cop"] for f in r["iva_por_tarifa"])
        assert sum(_campo(r, "total_con_iva_cop")) == r["total_cop"] == (r["subtotal_cop"] - r["descuento_cop"]
                                                                          + r["iva_cop"])
        valores = [r[k] for k in ("subtotal_cop", "descuento_cop", "iva_cop", "total_cop")]
        for linea in r["lineas"]:
            valores += [linea[k] for k in ("unit_price_cop", "total_cop", "descuento_cop", "base_iva_cop", "iva_cop",
                                           "total_con_iva_cop")]
        assert all(isinstance(v, int) and not isinstance(v, bool) and v >= 0 for v in valores), valores


def test_repartir_proporcional():
    from app.core.ventas_dinero import repartir_anticipo_por_linea, repartir_proporcional
    assert repartir_proporcional([1240614, 468000, 132000], 184061) == [124061, 46800, 13200]
    assert repartir_proporcional([100001] * 3, 180002) == [60001, 60001, 60000]  # como en U19
    partes = repartir_proporcional([999999999, 1, 7], 999999999)
    assert sum(partes) == 999999999 and all(isinstance(p, int) for p in partes)
    assert repartir_proporcional([1240614, 468000, 132000], 0) == [0, 0, 0]
    assert repartir_proporcional([0, 0], 500) == [0, 0]
    assert repartir_proporcional([], 500) == []
    # repartir_anticipo_por_linea es la envoltura: el mismo reparto, en Decimal.
    assert repartir_anticipo_por_linea([Decimal(1240614), Decimal(468000), Decimal(132000)], Decimal(184061)) == [
        Decimal(124061), Decimal(46800), Decimal(13200)]


def test_monto_linea_prefiere_el_total_con_iva():
    from app.core.ventas_dinero import monto_linea
    assert monto_linea({"total_cop": 1240614, "total_con_iva_cop": 1476331}) == Decimal("1476331")
    assert monto_linea({"total_cop": 1240614, "total_con_iva_cop": None}) == Decimal("1240614")
    assert monto_linea({"unit_price_cop": 1000, "qty": 3}) == Decimal("3000")


def test_lineas_con_tarifa_y_errores_legibles():
    import pytest
    from app.core.iva import calcular_totales_cotizacion, lineas_con_tarifa
    assert lineas_con_tarifa(_ejemplo()) == "todas"
    assert lineas_con_tarifa(_ejemplo(tarifas=(None, None, None))) == "ninguna"
    assert lineas_con_tarifa(_ejemplo(tarifas=("19", None, "5"))) == "mezcla"
    assert lineas_con_tarifa(_ejemplo(tarifas=("19", "", "5"))) == "mezcla"  # '' es sin tarifa
    assert lineas_con_tarifa([]) == "ninguna" and lineas_con_tarifa(None) == "ninguna"
    assert lineas_con_tarifa(_ejemplo(tarifas=("16", "19", "5"))) == "todas"  # tiene tarifa (no valida: la rechaza el calculo)
    casos = [
        (_ejemplo(tarifas=("19", "16", "5")), 0, "Tarifa de IVA no válida en 'Pintura'"),
        ([_linea("Rodillo", 0, 206769, "19")], 0, "La cantidad de 'Rodillo' debe ser mayor que 0."),
        ([_linea("Rodillo", -2, 206769, "19")], 0, "La cantidad de 'Rodillo' debe ser mayor que 0."),
        ([{"product_name": "Rodillo", "unit_price_cop": 5, "iva_tarifa": "19"}], 0,
         "La cantidad de 'Rodillo' debe ser mayor que 0."),
        ([_linea("Rodillo", 1, -5, "19")], 0, "El precio unitario de 'Rodillo' no es válido."),
        (_ejemplo(), 101, "El descuento debe estar entre 0 y 100%."),
        (_ejemplo(), -1, "El descuento debe estar entre 0 y 100%."),
        (_ejemplo(), "diez", "El descuento debe estar entre 0 y 100%."),
        ([_linea("Rodillo", 1, 5, None)], 0, "Indica la tarifa de IVA de 'Rodillo'."),
        ([_linea("Rodillo", 1, 5, "19"), "Texto viejo"], 0, "La línea 2 no es un producto válido."),
    ]
    for productos, descuento, mensaje in casos:
        with pytest.raises(ValueError) as error:
            calcular_totales_cotizacion(productos, descuento)
        assert str(error.value).startswith(mensaje), (mensaje, str(error.value))


def test_nombre_de_linea_es_el_mismo_en_el_422_y_en_la_actividad():
    """Ronda r1 (calidad 7): una sola regla para nombrar una linea (iva.nombre_de_linea), con el mismo respaldo
    'Línea N' en los mensajes de IVA y en la Actividad (cambios_documento)."""
    from app.core import cambios_documento
    from app.core.iva import nombre_de_linea
    lineas = [{"qty": 1}, "Texto viejo", {"name": 7}, {"nombre": " Silla ", "product_name": None}, {"product_name": " "}]
    esperados = ["Línea 1", "Texto viejo", "7", "Silla", "Línea 5"]
    assert [nombre_de_linea(p, i) for i, p in enumerate(lineas)] == esperados
    assert [l["nombre"] for l in cambios_documento._lineas(lineas)] == esperados


def test_calcular_no_toca_las_lineas_que_recibe():
    from app.core.iva import calcular_totales_cotizacion
    productos = _ejemplo(tarifas=(" iva 19% ", 19, "5"))
    originales = [dict(p) for p in productos]
    r = calcular_totales_cotizacion(productos, 0)
    assert productos == originales
    assert all(nueva is not vieja for nueva, vieja in zip(r["lineas"], productos))
    assert _campo(r, "iva_tarifa") == ["19", "19", "5"]  # normalizada
    assert r["lineas"][0]["product_name"] == "Rodillo"  # el resto de la linea se conserva


def test_desglose_documento():
    from app.core.iva import calcular_totales_cotizacion, desglose_documento
    r = calcular_totales_cotizacion(_ejemplo(), 10)
    doc = {"productos": r["lineas"], "subtotal_cop": 1840614, "tax_cop": 298113, "total_cop": 1954666}
    assert desglose_documento(doc) == {"iva_discriminado": True, "iva_cop": 298113, "descuento_cop": 184061,
                                       "iva_por_tarifa": r["iva_por_tarifa"]}
    viejo = {"productos": _ejemplo(tarifas=(None, None, None)), "subtotal_cop": Decimal("1840614.40"),
             "tax_cop": None, "total_cop": 1656553}
    assert desglose_documento(viejo) == {"iva_discriminado": False, "iva_cop": 0, "descuento_cop": 184061,
                                         "iva_por_tarifa": []}
    # Sin lineas no esta discriminado; el descuento nunca es negativo.
    assert desglose_documento({"productos": [], "subtotal_cop": 100, "total_cop": 150})["descuento_cop"] == 0
    assert desglose_documento({"productos": []})["iva_discriminado"] is False
    # Ronda r1: un resumen por tarifa que no cuadra con la cabecera no se muestra (IVA no discriminado): ni el IVA
    # (las lineas con la Cinta frente a una cabecera sin ella), ni las bases (un peso de mas en el total).
    sin_cinta = {**doc, "subtotal_cop": 1708614, "tax_cop": 292173, "total_cop": 1829926}
    assert desglose_documento(sin_cinta) == {"iva_discriminado": False, "iva_cop": 292173, "descuento_cop": 170861,
                                             "iva_por_tarifa": []}
    un_peso = {**doc, "total_cop": 1954667}
    assert desglose_documento(un_peso)["iva_discriminado"] is False
    assert desglose_documento(un_peso)["iva_por_tarifa"] == []


def test_cancelar_cantidad():
    """Ronda r1 (dinero 6 y 7): la cancelacion de un pedido con tarifas. Las lineas que no se tocan conservan sus
    valores; la cancelada en parte se reescala desde los suyos (con la regla del IVA sobre su base nueva); la
    cancelada del todo sale. Lista nueva de dicts nuevos y totales que cuadran con el resumen."""
    import pytest
    from app.core.iva import calcular_totales_cotizacion, cancelar_cantidad
    r = calcular_totales_cotizacion(_ejemplo(), 10)
    originales = [dict(p) for p in r["lineas"]]
    lineas, totales = cancelar_cantidad(r["lineas"], 0, 2)
    assert r["lineas"] == originales  # la entrada no se toca
    assert all(nueva is not vieja for nueva, vieja in zip(lineas, r["lineas"]))
    assert lineas[0] == {**originales[0], "qty": 4, "total_cop": 827076, "descuento_cop": 82707,
                         "base_iva_cop": 744369, "iva_cop": 141430, "total_con_iva_cop": 885799}
    assert lineas[1:] == originales[1:]
    assert totales == {"subtotal_cop": 1427076, "descuento_cop": 142707, "iva_cop": 227398, "total_cop": 1511767,
                       "iva_por_tarifa": [{"tarifa": "19", "etiqueta": "IVA 19%", "base_cop": 1165569,
                                           "iva_cop": 221458},
                                          {"tarifa": "5", "etiqueta": "IVA 5%", "base_cop": 118800, "iva_cop": 5940}]}
    # Encadenada: se reescala desde lo guardado (4 -> 3).
    lineas, totales = cancelar_cantidad(lineas, 0, 1)
    assert lineas[0] == {**originales[0], "qty": 3, "total_cop": 620307, "descuento_cop": 62030,
                         "base_iva_cop": 558277, "iva_cop": 106073, "total_con_iva_cop": 664350}
    assert (totales["subtotal_cop"], totales["iva_cop"], totales["total_cop"]) == (1220307, 192041, 1290318)
    # Del todo: la linea sale y el resumen pierde su tarifa.
    lineas, totales = cancelar_cantidad(r["lineas"], 2, Decimal("10"))
    assert lineas == originales[:2]
    assert (totales["subtotal_cop"], totales["descuento_cop"], totales["iva_cop"], totales["total_cop"]) == (
        1708614, 170861, 292173, 1829926)
    assert [f["tarifa"] for f in totales["iva_por_tarifa"]] == ["19"]
    for indice, cantidad in ((3, 1), (-1, 1), (0, 0), (0, 7), (0, "x")):
        with pytest.raises(ValueError):
            cancelar_cantidad(r["lineas"], indice, cantidad)
    with pytest.raises(ValueError):
        cancelar_cantidad(_ejemplo(tarifas=(None, None, None)), 0, 1)


# ─── 7 a 12: PATCH /cotizaciones ─────────────────────────────────────────────────────

def test_patch_con_tarifas_lo_calcula_el_servidor(app_client, db, admin_token, monkeypatch):
    from app.api.v1 import erp_ventas
    avisos = []
    monkeypatch.setattr(erp_ventas.logger, "warning", lambda *args, **kwargs: avisos.append(args))
    cot = _cot(db, "COT-T4IVA07")
    # Totales falsos en el body: el servidor los ignora y lo deja en su log (aviso con el total del body y el calculado).
    d = _recotizar(app_client, admin_token, cot.id, _ejemplo(), subtotal_cop=1, total_cop=1)
    assert len(avisos) == 1, avisos
    assert avisos[0][1:] == ("COT-T4IVA07", Decimal("1"), 2171851), avisos
    db.expire_all()
    db.refresh(cot)
    assert cot.total_cop == 2171851 and cot.tax_cop == 331237 and cot.subtotal_cop == 1840614
    assert cot.productos[0]["total_con_iva_cop"] == 1476331
    assert [p["iva_cop"] for p in cot.productos] == [235717, 88920, 6600]
    assert d["iva_cop"] == 331237 and d["descuento_cop"] == 0 and d["iva_discriminado"] is True
    assert d["total_cop"] == 2171851
    assert [(f["tarifa"], f["base_cop"], f["iva_cop"]) for f in d["iva_por_tarifa"]] == [
        ("19", 1708614, 324637), ("5", 132000, 6600)]
    [renglon] = _logs(db, "COT", cot.id, "RECOTIZADA")
    assert renglon.description == ("Re-cotización: total $1.840.614 → $2.171.851 (+$331.237) "
                                   "(IVA incluido: $331.237)")
    assert {"campo": "tax_cop", "etiqueta": "IVA", "antes": "$0", "despues": "$331.237"} in renglon.extra_data[
        "cambios"]


def test_patch_sin_tarifas_sigue_como_hoy(app_client, db, admin_token):
    cot = _cot(db, "COT-T4IVA08", total_cop=1000, subtotal_cop=1000,
               productos=[_linea("Cuna", 1, 1000, None)])
    resp = _patch(app_client, admin_token, cot.id, {"total_cop": 2786923.08, "subtotal_cop": 2786923.08,
                                                    "productos": [_linea("Cuna", 1, 2786923, None)]})
    assert resp.status_code == 200, resp.text
    d = resp.json()["data"]
    db.expire_all()
    db.refresh(cot)
    assert cot.total_cop == Decimal("2786923") and cot.tax_cop == 0
    assert d["iva_discriminado"] is False and d["iva_por_tarifa"] == [] and d["iva_cop"] == 0
    assert "total_con_iva_cop" not in cot.productos[0]
    [renglon] = _logs(db, "COT", cot.id, "RECOTIZADA")
    assert "IVA incluido" not in renglon.description


def test_cotizacion_en_cero_queda_calculada_con_iva(app_client, db, admin_token):
    """Ronda r1 (cumplimiento 2): la primera re-cotizacion de una COT en $0 dice 'Cotización calculada' con el IVA."""
    cot = _cot(db, "COT-T4IVA07B", subtotal_cop=0, total_cop=0)
    _recotizar(app_client, admin_token, cot.id, _ejemplo())
    [renglon] = _logs(db, "COT", cot.id, "RECOTIZADA")
    assert renglon.description == "Cotización calculada: total $2.171.851 (IVA incluido: $331.237)"


def test_descuento_invalido_sin_productos_es_422_sin_cambios(app_client, db, admin_token):
    """Ronda r1 (duda 3): un PATCH sin productos sobre una COT con tarifas se valida contra sus lineas guardadas,
    antes de tocar nada (sin `cot` en _validar_iva_del_body seria un 500 dentro de _aplicar_iva)."""
    cot = _cot(db, "COT-T4IVA09B")
    _recotizar(app_client, admin_token, cot.id, _ejemplo())
    db.expire_all()
    db.refresh(cot)
    productos, renglones = [dict(p) for p in cot.productos], len(_logs(db, "COT", cot.id))
    resp = _patch(app_client, admin_token, cot.id, {"descuento_pct": 150, "recotizacion": True})
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"] == "El descuento debe estar entre 0 y 100%."
    db.expire_all()
    db.refresh(cot)
    assert (cot.tax_cop, cot.total_cop, cot.descuento_pct) == (331237, 2171851, 0)
    assert cot.productos == productos and len(_logs(db, "COT", cot.id)) == renglones


def test_lineas_sin_tarifa_quitan_el_iva_viejo(app_client, db, admin_token):
    """Un llamador antiguo que manda productos sin tarifa a una COT que ya tenia IVA: modo anterior.
    - Sin totales en el body (ronda r1, calidad 3): el total guardado sigue incluyendo el IVA, asi que el IVA se
      conserva y el desglose cuadra (no discriminado, descuento 0).
    - Con total_cop en el body: ese total no lo incluye, y el IVA vuelve a 0."""
    cot = _cot(db, "COT-T4IVA08B")
    _recotizar(app_client, admin_token, cot.id, _ejemplo())
    resp = _patch(app_client, admin_token, cot.id, {"productos": _ejemplo(tarifas=(None, None, None))})
    assert resp.status_code == 200, resp.text
    d = resp.json()["data"]
    db.expire_all()
    db.refresh(cot)
    assert (cot.tax_cop, cot.total_cop) == (331237, 2171851)
    assert d["iva_discriminado"] is False and d["iva_cop"] == 331237 and d["descuento_cop"] == 0
    resp = _patch(app_client, admin_token, cot.id, {"productos": _ejemplo(tarifas=(None, None, None)),
                                                    "subtotal_cop": 1840614, "total_cop": 1840614})
    assert resp.status_code == 200, resp.text
    d = resp.json()["data"]
    db.expire_all()
    db.refresh(cot)
    assert (cot.tax_cop, cot.total_cop) == (0, 1840614)
    assert d["iva_discriminado"] is False and d["iva_cop"] == 0 and d["descuento_cop"] == 0


def test_tarifa_invalida_o_mezclada_es_422_sin_cambios(app_client, db, admin_token):
    cot = _cot(db, "COT-T4IVA09")
    antes = [dict(p) for p in cot.productos]
    casos = [
        (_ejemplo(tarifas=("19", "16", "5")), {}, "Tarifa de IVA no válida en 'Pintura'"),
        (_ejemplo(tarifas=("19", "19", None)), {},
         "Indica la tarifa de IVA de todas las líneas (falta en 'Cinta')."),
        ([_linea("Rodillo", 0, 206769, "19")], {}, "La cantidad de 'Rodillo' debe ser mayor que 0."),
        (_ejemplo(), {"descuento_pct": 150}, "El descuento debe estar entre 0 y 100%."),
        # Ronda r1 (dinero 2): con tarifa, el servidor cobra unit_price_cop x qty; sin precio unitario (aunque traiga
        # total_cop, que _validar_precios_productos acepta) la linea se cobraria a $0.
        ([{"product_name": "Rodillo", "qty": 2, "total_cop": 413538, "iva_tarifa": "19"}, _linea("Cinta", 10, 13200, "5")],
         {}, "El precio unitario de 'Rodillo' no es válido."),
        ([_linea("Rodillo", 2, 0, "19", total_cop=413538)], {}, "El precio unitario de 'Rodillo' no es válido."),
    ]
    for productos, extra, mensaje in casos:
        resp = _patch(app_client, admin_token, cot.id, {"productos": productos, "total_cop": 5, "subtotal_cop": 5,
                                                        "recotizacion": True, **extra})
        assert resp.status_code == 422, (mensaje, resp.text)
        assert resp.json()["detail"].startswith(mensaje), resp.json()["detail"]
    db.expire_all()
    db.refresh(cot)
    assert cot.productos == antes and cot.total_cop == 1840614 and cot.tax_cop == 0 and cot.estado == "BORRADOR"
    assert _logs(db, "COT", cot.id) == []


def test_patch_solo_notas_no_recalcula(app_client, db, admin_token):
    from app.core.iva import calcular_totales_cotizacion
    r = calcular_totales_cotizacion(_ejemplo(), 0)
    # Totales guardados a proposito distintos de los calculados: un PATCH de notas no los toca.
    cot = _cot(db, "COT-T4IVA10", productos=r["lineas"], subtotal_cop=1840614, total_cop=2000000, tax_cop=159386)
    resp = _patch(app_client, admin_token, cot.id, {"notas": "Llamar antes de entregar"})
    assert resp.status_code == 200, resp.text
    db.expire_all()
    db.refresh(cot)
    assert cot.total_cop == 2000000 and cot.tax_cop == 159386 and cot.productos == r["lineas"]


def _cot_con_iva(app_client, db, token, numero, estado, sc=None):
    """COT calculada por el servidor (PATCH de la Calculadora) y despues puesta en `estado` por ORM."""
    cot = _cot(db, numero, sc=sc)
    _recotizar(app_client, token, cot.id, _ejemplo())
    db.expire_all()
    db.refresh(cot)
    cot.estado = estado
    if estado == "CONFIRMADA":
        cot.gate2_confirmed_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(cot)
    return cot


def test_vincular_al_catalogo_no_rompe_la_confirmacion(app_client, db, admin_token, sku):
    cot = _cot_con_iva(app_client, db, admin_token, "COT-T4IVA11", "PENDIENTE_CONFIRMACION")
    productos = [dict(p) for p in cot.productos]
    productos[0] = {**productos[0], "sku_id": sku.id, "es_libre": False}
    resp = _patch(app_client, admin_token, cot.id, {"productos": productos})
    assert resp.status_code == 200, resp.text
    assert resp.json()["confirmacion_anulada"] is False
    db.expire_all()
    db.refresh(cot)
    assert cot.estado == "PENDIENTE_CONFIRMACION" and cot.productos[0]["sku_id"] == sku.id
    assert (cot.subtotal_cop, cot.tax_cop, cot.total_cop) == (1840614, 331237, 2171851)


def test_cambiar_la_tarifa_anula_la_confirmacion(app_client, db, admin_token):
    cot = _cot_con_iva(app_client, db, admin_token, "COT-T4IVA12", "CONFIRMADA")
    productos = [dict(p) for p in cot.productos]
    productos[1] = {**productos[1], "iva_tarifa": "5"}
    # Sin aceptar: 409 de H40 que nombra el IVA, y nada se guarda.
    resp = _patch(app_client, admin_token, cot.id, {"productos": productos, "recotizacion": True})
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"]["cambios"] == ["Productos, cantidades o precios", "Total", "IVA"]
    db.expire_all()
    db.refresh(cot)
    assert cot.estado == "CONFIRMADA" and cot.total_cop == 2171851
    # Aceptando con la razon: vuelve a Borrador con el total nuevo (Pintura al 5%: 23.400 de IVA).
    resp = _patch(app_client, admin_token, cot.id, {"productos": productos, "recotizacion": True,
                                                    "anular_confirmacion": True, "motivo_recotizacion": RAZON})
    assert resp.status_code == 200, resp.text
    assert resp.json()["confirmacion_anulada"] is True
    db.expire_all()
    db.refresh(cot)
    assert cot.estado == "BORRADOR" and cot.gate2_confirmed_at is None
    assert (cot.tax_cop, cot.total_cop) == (265717, 2106331)
    renglon = _logs(db, "COT", cot.id, "RECOTIZADA")[-1]
    assert {"campo": "productos", "etiqueta": "Pintura — IVA", "antes": "IVA 19%", "despues": "IVA 5%"} in (
        renglon.extra_data["cambios"])
    assert renglon.description.endswith("(IVA incluido: $265.717)")


# ─── 13 a 14: anticipo sobre el total con IVA ─────────────────────────────────────────

def test_anticipo_sobre_total_con_iva(app_client, db, admin_token):
    sc = _sc(db, "SC-T4IVA13", MOD_60_40)
    cot = _cot(db, "COT-T4IVA13", sc=sc)
    _recotizar(app_client, admin_token, cot.id, _ejemplo())
    db.expire_all()
    db.refresh(cot)
    assert cot.anticipo_cop == 1303111
    d = _detalle(app_client, admin_token, cot.id)
    assert d["anticipo_requerido"] == 1303111
    assert d["anticipo_por_linea"] == [885799, 334152, 83160]
    assert sum(d["anticipo_por_linea"]) == d["anticipo_requerido"]


def test_contado_cobra_el_iva(app_client, db, admin_token):
    sc = _sc(db, "SC-T4IVA14", "Contado")
    cot = _cot(db, "COT-T4IVA14", sc=sc)
    _recotizar(app_client, admin_token, cot.id, _ejemplo())
    db.expire_all()
    db.refresh(cot)
    assert cot.anticipo_cop == 2171851 == cot.total_cop


def test_crear_cotizacion_con_tarifas_lo_calcula_el_servidor(app_client, db, admin_token):
    from app.models.erp_documents import SalesQuotation
    # Sin SC: el anticipo del body se respeta, pero nunca pasa del total con IVA.
    casos = [(5000000, 2171851), (1000, 1000)]
    for anticipo, esperado in casos:
        resp = app_client.post("/api/v1/ventas/cotizaciones", json={
            "customer_name": "Cliente Prueba", "productos": _ejemplo(), "anticipo_cop": anticipo, "created_by": "t"},
            headers=auth(admin_token))
        assert resp.status_code == 201, resp.text
        d = resp.json()["data"]
        assert d["total_cop"] == 2171851 and d["iva_cop"] == 331237 and d["iva_discriminado"] is True
        cot = db.query(SalesQuotation).filter(SalesQuotation.id == d["id"]).one()
        assert (cot.subtotal_cop, cot.tax_cop, cot.total_cop, cot.anticipo_cop) == (1840614, 331237, 2171851,
                                                                                    esperado)
        assert cot.productos[2]["total_con_iva_cop"] == 138600
    # Una tarifa no valida: 422 antes de gastar el numero de la secuencia o crear nada.
    antes = db.query(SalesQuotation).count()
    resp = app_client.post("/api/v1/ventas/cotizaciones", json={
        "customer_name": "Cliente Prueba", "productos": _ejemplo(tarifas=("19", None, "5")), "created_by": "t"},
        headers=auth(admin_token))
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"] == "Indica la tarifa de IVA de todas las líneas (falta en 'Pintura')."
    assert db.query(SalesQuotation).count() == antes


def test_crear_cotizacion_con_sc_cobra_el_anticipo_sobre_el_total_con_iva(app_client, db, admin_token):
    from app.models.erp_documents import CustomerRequest, SalesQuotation
    sc = CustomerRequest(numero="SC-T4IVAC1", customer_name="Cliente Prueba", modalidad_pago=MOD_60_40,
                         estado="CONFIRMADA", gate1_confirmed_at=datetime.datetime.utcnow())
    db.add(sc); db.commit(); db.refresh(sc)
    resp = app_client.post("/api/v1/ventas/cotizaciones", json={
        "sc_id": sc.id, "productos": _ejemplo(), "anticipo_cop": 1, "created_by": "t"}, headers=auth(admin_token))
    assert resp.status_code == 201, resp.text
    cot = db.query(SalesQuotation).filter(SalesQuotation.id == resp.json()["data"]["id"]).one()
    assert (cot.total_cop, cot.tax_cop, cot.anticipo_cop) == (2171851, 331237, 1303111)


# ─── 15 a 18: pedido, orden de pago y cancelacion de lineas ─────────────────────────

def _pedido_del_ejemplo(app_client, db, token, numero, productos=None, descuento=10):
    """COT (el ejemplo con 10% de descuento, u otras lineas), CONFIRMADA con Gate 2 y SC a credito (sin anticipo que
    verificar), convertida con POST /confirmar. Devuelve (cot, pedido)."""
    from app.models.erp_documents import SaleOrder
    sc = _sc(db, f"SC-{numero}", "Credito 30 dias")
    cot = _cot(db, f"COT-{numero}", sc=sc)
    _recotizar(app_client, token, cot.id, productos if productos is not None else _ejemplo(), descuento_pct=descuento)
    db.expire_all()
    db.refresh(cot)
    cot.estado = "CONFIRMADA"
    cot.gate2_confirmed_at = datetime.datetime.utcnow()
    db.commit()
    resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/confirmar", json={"user_name": "t"},
                           headers=auth(token))
    assert resp.status_code == 200, resp.text
    so = db.query(SaleOrder).filter(SaleOrder.cot_id == cot.id).one()
    return cot, so


def _lineas_del_pedido(db, so):
    from app.models.fase1b import SaleOrderLineErp
    db.expire_all()
    return db.query(SaleOrderLineErp).filter(SaleOrderLineErp.so_id == so.id).order_by(SaleOrderLineErp.id).all()


def test_convertir_pasa_el_iva_al_pedido(app_client, db, admin_token):
    cot, so = _pedido_del_ejemplo(app_client, db, admin_token, "T4IVA15")
    assert (cot.total_cop, cot.tax_cop) == (1954666, 298113)
    assert (so.total_cop, so.tax_cop, so.subtotal_cop, so.saldo_cop) == (1954666, 298113, 1840614, 1954666)
    lineas = _lineas_del_pedido(db, so)
    assert [l.tax_pct for l in lineas] == [19, 19, 5]
    assert [l.descuento_pct for l in lineas] == [10, 10, 10]
    assert [l.unit_price_cop for l in lineas] == [206769, 117000, 13200]
    resp = app_client.get(f"/api/v1/ventas/pedidos/{so.id}", headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    d = resp.json()["data"]
    assert d["iva_cop"] == 298113 and d["iva_discriminado"] is True and d["descuento_cop"] == 184061
    assert [(f["tarifa"], f["base_cop"], f["iva_cop"]) for f in d["iva_por_tarifa"]] == [
        ("19", 1537753, 292173), ("5", 118800, 5940)]


def test_pxp_cobra_total_con_iva(app_client, db, admin_token):
    _, so = _pedido_del_ejemplo(app_client, db, admin_token, "T4IVA16")
    resp = app_client.post(f"/api/v1/ventas/pedidos/{so.id}/crear-pxp", json={}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    from app.models.erp_documents import PaymentPending
    pxp = db.query(PaymentPending).filter(PaymentPending.ven_id == so.id).one()
    assert (pxp.monto_total, pxp.monto_pendiente, pxp.monto_anticipo) == (1954666, 1954666, 0)


def _cancelar(app_client, token, so_id, linea_id, cantidad=None):
    body = {"motivo": "El cliente ya no la necesita"}
    if cantidad is not None:
        body["quantity"] = cantidad
    resp = app_client.post(f"/api/v1/ventas/pedidos/{so_id}/lineas/{linea_id}/cancelar", json=body,
                           headers=auth(token))
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


def _detalle_pedido(app_client, token, so_id):
    resp = app_client.get(f"/api/v1/ventas/pedidos/{so_id}", headers=auth(token))
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


def _filas_pedido(d):
    return [(f["tarifa"], f["base_cop"], f["iva_cop"]) for f in d["iva_por_tarifa"]]


def test_cancelar_linea_mantiene_pesos_y_descuento(app_client, db, admin_token):
    _, so = _pedido_del_ejemplo(app_client, db, admin_token, "T4IVA17")
    antes = [dict(p) for p in so.productos]
    cinta = _lineas_del_pedido(db, so)[2]
    assert cinta.description == "Cinta"
    assert _cancelar(app_client, admin_token, so.id, cinta.id)["sale_order_total_cop"] == 1829926
    db.expire_all()
    db.refresh(so)
    assert (so.total_cop, so.tax_cop, so.subtotal_cop) == (1829926, 292173, 1708614)
    for monto in (so.total_cop, so.tax_cop, so.subtotal_cop, so.saldo_cop):
        assert monto == monto.to_integral_value(), monto
    assert so.saldo_cop == so.total_cop
    # Ronda r1 (dinero 6): el desglose del pedido cuadra. La Cinta ya no aparece (ni su tarifa del 5%) y las lineas
    # que no se tocaron tienen exactamente los mismos valores.
    d = _detalle_pedido(app_client, admin_token, so.id)
    assert d["productos"] == antes[:2]
    assert _filas_pedido(d) == [("19", 1537753, 292173)]
    assert sum(f["iva_cop"] for f in d["iva_por_tarifa"]) == d["iva_cop"] == 292173
    assert d["iva_discriminado"] is True and d["descuento_cop"] == 170861


def test_cancelar_con_muchas_lineas_no_toca_las_demas(app_client, db, admin_token):
    """Ronda r1 (dinero 7): 10 lineas de $20 EXENTO y una de $1.000 al 19%, con 2,5% de descuento. El reparto de la
    COT les dio [1,1,1,1,1,0,0,0,0,0] de descuento (total 195). Al cancelar la de $1.000 conservan esos valores
    (recalcularlas linea por linea les quitaba $5)."""
    productos = [_linea(f"P{i}", 1, 20, "EXENTO") for i in range(10)] + [_linea("Grande", 1, 1000, "19")]
    _, so = _pedido_del_ejemplo(app_client, db, admin_token, "T4IVAML", productos=productos, descuento=2.5)
    assert (so.subtotal_cop, so.tax_cop, so.total_cop) == (1200, 185, 1355)
    antes = [dict(p) for p in so.productos]
    assert [p["descuento_cop"] for p in antes[:10]] == [1, 1, 1, 1, 1, 0, 0, 0, 0, 0]
    grande = _lineas_del_pedido(db, so)[10]
    assert grande.description == "Grande"
    _cancelar(app_client, admin_token, so.id, grande.id)
    db.expire_all()
    db.refresh(so)
    assert (so.subtotal_cop, so.tax_cop, so.total_cop, so.saldo_cop) == (200, 0, 195, 195)
    d = _detalle_pedido(app_client, admin_token, so.id)
    assert d["productos"] == antes[:10]
    assert _filas_pedido(d) == [("EXENTO", 195, 0)] and d["descuento_cop"] == 5 and d["iva_cop"] == 0


def test_cancelacion_parcial_reescala_solo_esa_linea(app_client, db, admin_token):
    """Ronda r1: cancelar 2 de 6 Rodillos y despues 1 mas. Solo cambia el Rodillo, reescalado desde lo guardado; la
    cabecera es la suma de las lineas y el resumen por tarifa cuadra."""
    _, so = _pedido_del_ejemplo(app_client, db, admin_token, "T4IVAPC")
    antes = [dict(p) for p in so.productos]
    rodillo = _lineas_del_pedido(db, so)[0]
    assert _cancelar(app_client, admin_token, so.id, rodillo.id, 2)["sale_order_total_cop"] == 1511767
    d = _detalle_pedido(app_client, admin_token, so.id)
    assert d["productos"][0] == {**antes[0], "qty": 4, "total_cop": 827076, "descuento_cop": 82707,
                                 "base_iva_cop": 744369, "iva_cop": 141430, "total_con_iva_cop": 885799}
    assert d["productos"][1:] == antes[1:]
    assert (d["subtotal_cop"], d["iva_cop"], d["total_cop"], d["descuento_cop"]) == (1427076, 227398, 1511767, 142707)
    assert _filas_pedido(d) == [("19", 1165569, 221458), ("5", 118800, 5940)]
    _cancelar(app_client, admin_token, so.id, rodillo.id, 1)
    d = _detalle_pedido(app_client, admin_token, so.id)
    assert d["productos"][0] == {**antes[0], "qty": 3, "total_cop": 620307, "descuento_cop": 62030,
                                 "base_iva_cop": 558277, "iva_cop": 106073, "total_con_iva_cop": 664350}
    assert d["productos"][1:] == antes[1:]
    assert (d["subtotal_cop"], d["iva_cop"], d["total_cop"]) == (1220307, 192041, 1290318)
    assert sum(f["iva_cop"] for f in d["iva_por_tarifa"]) == d["iva_cop"]


def test_cancelar_sin_emparejar_el_json_no_muestra_un_resumen_que_no_cuadra(app_client, db, admin_token):
    """Ronda r1: si las lineas del pedido ya no coinciden con su JSON (aqui la propagacion de una re-cotizacion dejo
    el Rodillo en 5 unidades y la linea del pedido sigue en 6), no se puede saber que linea del JSON cancelar: la
    cabecera sale de las lineas del pedido, el JSON no se toca y el desglose cae a 'IVA no discriminado'."""
    from app.core.iva import calcular_totales_cotizacion
    _, so = _pedido_del_ejemplo(app_client, db, admin_token, "T4IVASE")
    r = calcular_totales_cotizacion([_linea("Rodillo", 5, 206769, "19")] + _ejemplo()[1:], 10)
    resp = app_client.patch(f"/api/v1/ventas/pedidos/{so.id}", json={
        "productos": r["lineas"], "subtotal_cop": r["subtotal_cop"], "total_cop": r["total_cop"],
        "iva_cop": r["iva_cop"], "updated_by": "t"}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["iva_discriminado"] is True  # antes de cancelar, cuadra
    cinta = _lineas_del_pedido(db, so)[2]
    _cancelar(app_client, admin_token, so.id, cinta.id)
    d = _detalle_pedido(app_client, admin_token, so.id)
    assert d["productos"] == r["lineas"]
    assert (d["iva_cop"], d["total_cop"]) == (292173, 1829926)
    assert d["iva_discriminado"] is False and d["iva_por_tarifa"] == []


def test_cancelar_linea_de_pedido_canonico_con_descuento_por_linea(app_client, db, admin_token, sku):
    """Ronda r1 (duda 1, ruling: semantica de la COT). El pedido canonico (B2.1-D3) tiene cot_id y productos=[]: sin
    tarifas en el JSON sigue la cuenta por linea. Con cot_id el subtotal queda ANTES del descuento tras cancelar:
    A 1 x 100.000 con 10% y 19%, B 1 x 50.000 con 19%. Al crearlo: 140.000 / 26.600 / 166.600. Al cancelar B:
    subtotal 100.000, IVA 17.100, total 107.100 y el desglose muestra el descuento de 10.000."""
    import uuid
    from _cot_confirmada import cot_confirmada_para_canonico
    from app.models.customers import Customer
    from app.models.erp_documents import SaleOrder
    cliente = Customer(first_name="Cliente", last_name=f"IVA-{uuid.uuid4().hex[:4]}",
                       email=f"iva_{uuid.uuid4().hex[:8]}@test.com")
    db.add(cliente); db.commit()
    linea = {"sku_id": sku.id, "quantity": 1, "tax_pct": 19, "modalidad": "POR_PEDIDO", "owner": "NEBULAE"}
    resp = app_client.post("/api/v1/ventas/pedidos/canonico", json={
        "customer_id": cliente.id, "cot_id": cot_confirmada_para_canonico(db, cliente.id),
        "lines": [{**linea, "unit_price_cop": 100000, "descuento_pct": 10}, {**linea, "unit_price_cop": 50000}]},
        headers=auth(admin_token))
    assert resp.status_code == 201, resp.text
    datos = resp.json()["data"]
    assert (datos["subtotal_cop"], datos["tax_cop"], datos["total_cop"]) == (140000, 26600, 166600)
    _cancelar(app_client, admin_token, datos["id"], datos["lines"][1]["id"])
    so = db.query(SaleOrder).filter(SaleOrder.id == datos["id"]).one()
    db.refresh(so)
    assert (so.subtotal_cop, so.tax_cop, so.total_cop, so.productos) == (100000, 17100, 107100, [])
    d = _detalle_pedido(app_client, admin_token, so.id)
    assert d["descuento_cop"] == 10000 and d["iva_cop"] == 17100 and d["iva_discriminado"] is False


def test_convertir_con_lineas_normalizadas_empareja_sin_confundir_none(app_client, db, admin_token, sku):
    """Ronda r1 (dinero 3): en la rama SalesQuotationLine de la conversion, una linea sin SKU ya no se empareja con
    la primera linea JSON por None == None (la Cinta tomaba el 19% del Rodillo), y el descuento global llega a
    las lineas como en la rama JSON."""
    from app.core.iva import calcular_totales_cotizacion
    from app.models.erp_documents import SaleOrder
    from app.models.fase1b import SalesQuotationLine
    r = calcular_totales_cotizacion([_linea("Rodillo", 6, 206769, "19", sku_id=sku.id),
                                     _linea("Cinta", 10, 13200, "5")], 10)
    cot = _cot(db, "COT-T4IVAQL", productos=r["lineas"], subtotal_cop=r["subtotal_cop"], total_cop=r["total_cop"],
               tax_cop=r["iva_cop"], descuento_pct=10, estado="CONFIRMADA",
               gate2_confirmed_at=datetime.datetime.utcnow())
    db.add(SalesQuotationLine(sq_id=cot.id, sku_id=None, description="Cinta", quantity=10, unit_price_cop=13200))
    db.add(SalesQuotationLine(sq_id=cot.id, sku_id=sku.id, description="Rodillo", quantity=6,
                              unit_price_cop=206769))
    db.commit()
    resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/convertir-a-venta", json={"user_name": "t"},
                           headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    so = db.query(SaleOrder).filter(SaleOrder.cot_id == cot.id).one()
    lineas = {l.description: (l.tax_pct, l.descuento_pct) for l in _lineas_del_pedido(db, so)}
    assert lineas == {"Cinta": (5, 10), "Rodillo": (19, 10)}


def test_update_pedido_acepta_iva_cop(app_client, db, admin_token):
    from app.models.erp_documents import SaleOrder
    so = SaleOrder(numero="PVEN-T4IVA18", customer_name="Cliente Prueba", estado="PENDIENTE_COMPRA",
                   total_cop=10000, subtotal_cop=10000, saldo_cop=10000, tax_cop=0)
    db.add(so); db.commit(); db.refresh(so)
    resp = app_client.patch(f"/api/v1/ventas/pedidos/{so.id}", json={"iva_cop": 1234.6, "updated_by": "t"},
                            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["iva_cop"] == 1235
    db.expire_all()
    db.refresh(so)
    assert so.tax_cop == Decimal("1235")
    [renglon] = _logs(db, "VEN", so.id, "UPDATED")
    assert {"campo": "tax_cop", "etiqueta": "IVA", "antes": "$0", "despues": "$1.235"} in renglon.extra_data["cambios"]
    # Un IVA que no es un monto: 422 con el nombre del campo y nada cambia.
    resp = app_client.patch(f"/api/v1/ventas/pedidos/{so.id}", json={"iva_cop": "mucho", "updated_by": "t"},
                            headers=auth(admin_token))
    assert resp.status_code == 422 and "iva_cop" in resp.json()["detail"], resp.text
    # Ronda r1 (dinero 5): un IVA negativo o mayor que el total del pedido (el del body si lo trae) no se guarda.
    for body in ({"iva_cop": -5}, {"iva_cop": 10001}, {"iva_cop": 3000, "total_cop": 2000}):
        resp = app_client.patch(f"/api/v1/ventas/pedidos/{so.id}", json={**body, "updated_by": "t"},
                                headers=auth(admin_token))
        assert resp.status_code == 422, (body, resp.text)
        assert resp.json()["detail"] == "El IVA debe estar entre $0 y el total del pedido.", body
    db.expire_all()
    db.refresh(so)
    assert so.tax_cop == Decimal("1235") and so.total_cop == 10000


# ─── 20: documentos viejos ───────────────────────────────────────────────────────────

def test_cotizacion_vieja_iva_no_discriminado(db):
    from app.api.v1.erp_ventas import _cot_dict
    cot = _cot(db, "COT-T4IVA20", subtotal_cop=1840614, total_cop=1656553, descuento_pct=10)
    d = _cot_dict(cot)
    assert d["iva_discriminado"] is False and d["iva_cop"] == 0 and d["iva_por_tarifa"] == []
    assert d["descuento_cop"] == d["subtotal_cop"] - d["total_cop"] == 184061
