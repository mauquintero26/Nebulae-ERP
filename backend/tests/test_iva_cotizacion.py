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
    """Lo que manda la Calculadora: productos con su tarifa, totales (que el servidor ignora) y recotizacion."""
    resp = _patch(app_client, token, cot_id, {"productos": productos, "subtotal_cop": 1, "total_cop": 1,
                                              "recotizacion": True, **extra})
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
    ]
    for productos, descuento, total in casos:
        r = calcular_totales_cotizacion(productos, descuento)
        assert r["total_cop"] == total, (productos, descuento)
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
    ]
    for productos, descuento, mensaje in casos:
        with pytest.raises(ValueError) as error:
            calcular_totales_cotizacion(productos, descuento)
        assert str(error.value).startswith(mensaje), (mensaje, str(error.value))


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


# ─── 7 a 12: PATCH /cotizaciones ─────────────────────────────────────────────────────

def test_patch_con_tarifas_lo_calcula_el_servidor(app_client, db, admin_token):
    cot = _cot(db, "COT-T4IVA07")
    d = _recotizar(app_client, admin_token, cot.id, _ejemplo())
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


def test_lineas_sin_tarifa_quitan_el_iva_viejo(app_client, db, admin_token):
    """Un llamador antiguo que manda productos sin tarifa a una COT que ya tenia IVA: modo anterior (los totales del
    body), y el IVA vuelve a 0 (ya no esta discriminado y el total del body no lo incluye)."""
    cot = _cot(db, "COT-T4IVA08B")
    _recotizar(app_client, admin_token, cot.id, _ejemplo())
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
            "customer_name": "Cliente Prueba", "productos": _ejemplo(), "subtotal_cop": 1, "total_cop": 1,
            "anticipo_cop": anticipo, "created_by": "t"}, headers=auth(admin_token))
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
        "sc_id": sc.id, "productos": _ejemplo(), "subtotal_cop": 1, "total_cop": 1, "anticipo_cop": 1,
        "created_by": "t"}, headers=auth(admin_token))
    assert resp.status_code == 201, resp.text
    cot = db.query(SalesQuotation).filter(SalesQuotation.id == resp.json()["data"]["id"]).one()
    assert (cot.total_cop, cot.tax_cop, cot.anticipo_cop) == (2171851, 331237, 1303111)


# ─── 15 a 18: pedido, orden de pago y cancelacion de lineas ─────────────────────────

def _pedido_del_ejemplo(app_client, db, token, numero):
    """COT del ejemplo con 10% de descuento, CONFIRMADA con Gate 2 y SC a credito (sin anticipo que verificar),
    convertida con POST /confirmar. Devuelve (cot, pedido)."""
    from app.models.erp_documents import SaleOrder
    sc = _sc(db, f"SC-{numero}", "Credito 30 dias")
    cot = _cot(db, f"COT-{numero}", sc=sc)
    _recotizar(app_client, token, cot.id, _ejemplo(), descuento_pct=10)
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


def test_cancelar_linea_mantiene_pesos_y_descuento(app_client, db, admin_token):
    _, so = _pedido_del_ejemplo(app_client, db, admin_token, "T4IVA17")
    cinta = _lineas_del_pedido(db, so)[2]
    assert cinta.description == "Cinta"
    resp = app_client.post(f"/api/v1/ventas/pedidos/{so.id}/lineas/{cinta.id}/cancelar",
                           json={"motivo": "El cliente ya no la necesita"}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["sale_order_total_cop"] == 1829926
    db.expire_all()
    db.refresh(so)
    assert (so.total_cop, so.tax_cop, so.subtotal_cop) == (1829926, 292173, 1708614)
    for monto in (so.total_cop, so.tax_cop, so.subtotal_cop, so.saldo_cop):
        assert monto == monto.to_integral_value(), monto
    assert so.saldo_cop == so.total_cop


def test_update_pedido_acepta_iva_cop(app_client, db, admin_token):
    from app.models.erp_documents import SaleOrder
    so = SaleOrder(numero="PVEN-T4IVA18", customer_name="Cliente Prueba", estado="PENDIENTE_COMPRA",
                   total_cop=1000, subtotal_cop=1000, saldo_cop=1000, tax_cop=0)
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
    db.expire_all()
    db.refresh(so)
    assert so.tax_cop == Decimal("1235")


# ─── 20: documentos viejos ───────────────────────────────────────────────────────────

def test_cotizacion_vieja_iva_no_discriminado(db):
    from app.api.v1.erp_ventas import _cot_dict
    cot = _cot(db, "COT-T4IVA20", subtotal_cop=1840614, total_cop=1656553, descuento_pct=10)
    d = _cot_dict(cot)
    assert d["iva_discriminado"] is False and d["iva_cop"] == 0 and d["iva_por_tarifa"] == []
    assert d["descuento_cop"] == d["subtotal_cop"] - d["total_cop"] == 184061
