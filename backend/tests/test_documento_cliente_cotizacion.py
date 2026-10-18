"""Bloque 3, Tarea 5 — U22+H38: la cotización que ve el cliente (documento_cot, con la forma de C2 y los nombres de R24).

- lineas [{n, descripcion, cantidad, precio_unitario, total_linea, iva_etiqueta, iva_pct, anticipo}] con lista blanca:
  nunca costos, margen, flete, sku ni la nota del anticipo manual. total_linea = total_cop SIN IVA (C4); el anticipo por
  línea solo en la COT (C3, U19).
- totales {subtotal, descuento_pct, descuento, impuestos, ajuste_redondeo, total}: el total es el guardado; impuestos y
  descuento salen de iva.desglose_documento (T4) y nunca se recalculan; ajuste_redondeo solo sin IVA discriminado.
- pago (R24): modalidad, anticipo_pct, anticipo (= requerido de anticipo_cotizacion), saldo, manual, saldo_a_favor y
  anticipo_por_pagar (R6), instrucciones (R8, solo con token).
- notas (R3): «Nota para el cliente» de su SC y «Notas» de la COT; las Notas de la SC son internas.
- C10: un enlace de COT ya confirmada da 400 'confirmada' con número y fecha, sin líneas ni precios. Confirmar responde
  siguiente_paso {anticipo_por_pagar, instrucciones_pago}.
- Prueba 8 de U22 (C11): un token PVEN da 400 en /confirmar/* y no se gasta.
- Prueba 19 de IVA: con IVA, impuestos desde desglose_documento e iva_etiqueta por línea.

Los símbolos nuevos de T5 se importan DENTRO de cada prueba (el runner importa el módulo fuera de un try).
Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_documento_cliente_cotizacion
"""
import datetime
import hashlib
import json
import uuid

from sqlalchemy import text

MOD_60_40 = "60/40 (60% anticipo - 40% pendiente)"
ASESORA = "Laura Gómez"
PINTURA = {"product_name": "Pintura", "qty": 4, "unit_price_cop": 117000, "total_cop": 468000, "cost_usd": 25,
           "margen_pct": 30, "flete_usd": 2, "sku_id": 1}
CINTA = {"product_name": "Cinta", "qty": 10, "unit_price_cop": 13200, "total_cop": 132000}
CLAVES_DETALLE = {"mensaje", "estado_enlace", "empresa", "documento", "confirmada_el", "siguiente_paso", "comentario"}


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _ahora():
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


def _sufijo():
    return uuid.uuid4().hex[:6].upper()


def _sc(db, **campos):
    from app.models.erp_documents import CustomerRequest
    campos.setdefault("estado", "CONFIRMADA")
    campos.setdefault("modalidad_pago", MOD_60_40)
    sc = CustomerRequest(numero=f"SC-T5C{_sufijo()}", customer_name="Ana Pérez", advisor_name=ASESORA,
                         productos=[{"product_name": "Pintura", "qty": 4}], **campos)
    db.add(sc); db.commit(); db.refresh(sc)
    return sc


def _cot(db, sc=None, **campos):
    from app.models.erp_documents import SalesQuotation
    campos.setdefault("estado", "PENDIENTE_CONFIRMACION")
    campos.setdefault("productos", [dict(PINTURA), dict(CINTA)])
    campos.setdefault("subtotal_cop", 600000)
    campos.setdefault("total_cop", 600000)
    campos.setdefault("anticipo_cop", 0)
    if sc is not None:
        campos.setdefault("sc_id", sc.id)
        campos.setdefault("sc_numero", sc.numero)
    cot = SalesQuotation(numero=f"COT-T5C{_sufijo()}", customer_name="Ana Pérez", customer_email="ana@cliente.com",
                         customer_phone="3001112233", cotizador="cotizador@nebulae.com", **campos)
    db.add(cot); db.commit(); db.refresh(cot)
    return cot


def _token(db, tipo, doc_id, **kwargs):
    from app.core.confirmation_tokens import create_confirmation_token
    return create_confirmation_token(db, tipo, doc_id, **kwargs)


def _ver(app_client, raw):
    return app_client.post("/api/v1/confirmar/ver", json={"token": raw})


def _confirmar(app_client, raw):
    return app_client.post("/api/v1/confirmar/confirmar", json={"token": raw},
                           headers={"Idempotency-Key": f"t5c-{uuid.uuid4().hex[:8]}"})


def _documento_por_el_enlace(app_client, db, cot):
    resp = _ver(app_client, _token(db, "COT", cot.id))
    assert resp.status_code == 200, resp.text
    return resp, resp.json()["data"]["documento"]


def _detalle(resp, estado):
    assert resp.status_code == 400, resp.text
    detalle = resp.json()["detail"]
    assert isinstance(detalle, dict) and detalle["estado_enlace"] == estado, detalle
    assert set(detalle) == CLAVES_DETALLE, detalle
    return detalle


def _fila(db, raw):
    return db.execute(text("SELECT used_at, resultado FROM document_confirmation_tokens WHERE token_hash = :h"),
                      {"h": hashlib.sha256(raw.encode()).hexdigest()}).mappings().first()


def _empresa(app_client, admin_token, **campos):
    resp = app_client.put("/api/v1/empresa", json={"nombre_comercial": "Pinturas del Valle", **campos},
                          headers=auth(admin_token))
    assert resp.status_code == 200, resp.text


def _cuadra(t):
    """subtotal − descuento + IVA + ajuste = total (el ajuste None cuenta como 0)."""
    return (t["subtotal"] - t["descuento"] + sum(i["valor"] for i in t["impuestos"]) + (t["ajuste_redondeo"] or 0)
            == t["total"])


# ─── 1 a 7 de U22+H38 ────────────────────────────────────────────────────────────────────────────────────────

def test_ver_cot_trae_total_por_linea_y_cuadra(app_client, db, admin_token):
    from app.core.documento_cliente import CLAVES_DOCUMENTO
    _empresa(app_client, admin_token, instrucciones_pago="Bancolombia ahorros 123", terminos_cotizacion="Precios en COP")
    sc = _sc(db)
    cot = _cot(db, sc, direccion_entrega="Obra calle 80",
               fecha_entrega_estimada=datetime.datetime(2026, 10, 21, 2, 0))
    resp, doc = _documento_por_el_enlace(app_client, db, cot)
    assert set(doc) == CLAVES_DOCUMENTO
    assert (doc["tipo"], doc["titulo"], doc["numero"], doc["estado"]) == ("COT", "Cotización", cot.numero,
                                                                         "PENDIENTE_CONFIRMACION")
    primera = doc["lineas"][0]
    assert {k: primera[k] for k in ("cantidad", "descripcion", "precio_unitario", "total_linea")} == {
        "cantidad": 4, "descripcion": "Pintura", "precio_unitario": 117000, "total_linea": 468000}
    t = doc["totales"]
    assert sum(l["total_linea"] for l in doc["lineas"]) == t["subtotal"] == t["total"] == 600000
    assert t["descuento"] == 0 and t["impuestos"] == [] and t["ajuste_redondeo"] == 0 and _cuadra(t)
    p = doc["pago"]
    assert (p["modalidad"], p["anticipo_pct"], p["anticipo"], p["saldo"], p["manual"]) == (
        MOD_60_40, 60, 360000, 240000, False)
    assert p["saldo_a_favor"] == 0 and p["anticipo_por_pagar"] == 360000
    assert p["instrucciones"] == "Bancolombia ahorros 123" and doc["terminos"] == "Precios en COP"  # R8: con token
    assert [l["anticipo"] for l in doc["lineas"]] == [280800, 79200]  # U19/C3: suma el anticipo
    assert doc["fecha_emision"].endswith("Z") and doc["fecha_entrega_estimada"] == "2026-10-21"
    assert doc["cliente"] == {"nombre": "Ana Pérez", "direccion_entrega": "Obra calle 80"}
    assert doc["atendido_por"] == ASESORA
    for interno in ("cost_usd", "margen", "flete", "sku_id", "ana@cliente.com", "3001112233", "cotizador"):
        assert interno not in resp.text, interno


def test_descuento_se_resta_y_suma_exacto(db):
    from app.core.documento_cliente import documento_cot
    cot = _cot(db, productos=[{"product_name": "Sofá", "qty": 2, "unit_price_cop": 500000, "total_cop": 1000000}],
               subtotal_cop=1000000, descuento_pct=10, total_cop=900000, anticipo_cop=540000)
    t = documento_cot(db, cot)["totales"]
    assert (t["subtotal"], t["descuento_pct"], t["descuento"], t["ajuste_redondeo"], t["total"]) == (
        1000000, 10, 100000, 0, 900000)
    assert _cuadra(t)


def test_total_viejo_con_centavos_muestra_ajuste(db):
    from app.core.documento_cliente import documento_cot
    rodillo = {"product_name": "Rodillo", "qty": 6, "unit_price_cop": 206769.231, "total_cop": 1240615.385}
    cot = _cot(db, productos=[rodillo, dict(PINTURA), dict(CINTA)], subtotal_cop=1840615.38, total_cop=1840615.38)
    doc = documento_cot(db, cot)
    t = doc["totales"]
    assert t["total"] == 1840615 and _cuadra(t)
    assert all(l["total_linea"] == int(l["total_linea"]) for l in doc["lineas"])

    # Líneas viejas con centavos que, redondeadas, ya no suman la cabecera: la diferencia es la fila 'Ajuste por
    # redondeo' (el subtotal es la suma de lo que el cliente ve).
    medio = {"qty": 1, "unit_price_cop": 100.5, "total_cop": 100.5}
    cot = _cot(db, productos=[dict(medio, product_name="A"), dict(medio, product_name="B")], subtotal_cop=201,
               total_cop=201)
    t = documento_cot(db, cot)["totales"]
    assert (t["subtotal"], t["descuento"], t["ajuste_redondeo"], t["total"]) == (202, 0, -1, 201)
    assert _cuadra(t)


def test_anticipo_manual_no_expone_la_nota(app_client, db):
    sc = _sc(db)
    cot = _cot(db, sc, anticipo_pct_manual=50, anticipo_manual_nota="cliente VIP negociado")
    resp, doc = _documento_por_el_enlace(app_client, db, cot)
    p = doc["pago"]
    assert (p["anticipo_pct"], p["anticipo"], p["saldo"], p["manual"]) == (50, 300000, 300000, True)
    assert "VIP" not in resp.text and "anticipo_manual_nota" not in resp.text


def test_notas_de_la_sc_y_la_cot(app_client, db):
    """R3: la «Nota para el cliente» de la SC y las «Notas» de la COT; las Notas de la SC son internas."""
    sc = _sc(db, notas="Entrega en obra", nota_cliente="Llamar antes de llegar")
    cot = _cot(db, sc, notas="Precios válidos 5 días")
    resp, doc = _documento_por_el_enlace(app_client, db, cot)
    assert doc["notas"] == [{"titulo": "Nota para el cliente", "texto": "Llamar antes de llegar"},
                            {"titulo": "Notas", "texto": "Precios válidos 5 días"}]
    assert "Entrega en obra" not in resp.text


def test_cot_sin_sc_usa_el_porcentaje_conservado(db):
    from app.core.documento_cliente import documento_cot
    cot = _cot(db, productos=[{"product_name": "X", "qty": 1, "unit_price_cop": 1000}], subtotal_cop=1000,
               total_cop=1000, anticipo_cop=600)
    doc = documento_cot(db, cot)
    p = doc["pago"]
    assert (p["modalidad"], p["anticipo_pct"], p["anticipo"], p["saldo"]) == (None, 60, 600, 400)
    assert doc["atendido_por"] is None and doc["notas"] == []


def test_saldo_a_favor_de_pedido_cancelado(db):
    """R6: el dinero de un pedido cancelado de esta COT se descuenta de lo que falta pagar del anticipo."""
    from app.core.documento_cliente import documento_cot
    from app.models.erp_documents import SaleOrder
    from app.models.fase4 import SaleOrderPayment
    sc = _sc(db)
    cot = _cot(db, sc, productos=[{"product_name": "Sofá", "qty": 1, "unit_price_cop": 1000000,
                                   "total_cop": 1000000}], subtotal_cop=1000000, total_cop=1000000)
    so = SaleOrder(numero=f"PVEN-T5C{_sufijo()}", cot_id=cot.id, sc_id=sc.id, customer_name="Ana Pérez",
                   estado="CANCELADO", total_cop=1000000, saldo_cop=700000)
    db.add(so); db.commit(); db.refresh(so)
    db.add(SaleOrderPayment(sale_order_id=so.id, tipo="ANTICIPO", monto=300000, metodo_pago="Nequi",
                            fecha=datetime.date(2026, 10, 1), estado="CONFIRMADO"))
    db.commit()
    p = documento_cot(db, cot)["pago"]
    assert (p["anticipo"], p["saldo_a_favor"], p["anticipo_por_pagar"]) == (600000, 300000, 300000)


# ─── Prueba 8 de U22 (C11) y C10 ─────────────────────────────────────────────────────────────────────────────

def test_ver_con_token_de_otro_tipo_es_400_y_no_lo_consume(app_client, db):
    from app.models.erp_documents import SaleOrder
    so = SaleOrder(numero=f"PVEN-T5C{_sufijo()}", customer_name="Ana Pérez", estado="PENDIENTE_COMPRA")
    db.add(so); db.commit(); db.refresh(so)
    raw = _token(db, "PVEN", so.id)
    for resp in (_ver(app_client, raw), _confirmar(app_client, raw)):
        d = _detalle(resp, "invalido")
        assert d["documento"] is None
    assert _fila(db, raw)["used_at"] is None


def test_cot_confirmada_dice_confirmada_sin_lineas_ni_precios(app_client, db, admin_token):
    _empresa(app_client, admin_token, instrucciones_pago="Bancolombia ahorros 123")
    sc = _sc(db)
    cot = _cot(db, sc)
    raw = _token(db, "COT", cot.id)

    resp = _confirmar(app_client, raw)
    assert resp.status_code == 200, resp.text
    j = resp.json()
    assert j["message"] == "Cotización confirmada. Gracias." and j["estado_enlace"] == "confirmada"
    assert j["siguiente_paso"] == {"anticipo_por_pagar": 360000, "instrucciones_pago": "Bancolombia ahorros 123"}
    assert j["confirmada_el"].endswith("Z") and j["mensaje"]
    assert j["empresa"]["nombre_comercial"] == "Pinturas del Valle"
    assert j["data"]["total_cop"] == 600000 and j["data"]["documento"]["tipo"] == "COT"
    assert _fila(db, raw)["resultado"] == "CONFIRMADO"

    resp = _ver(app_client, raw)
    d = _detalle(resp, "confirmada")
    assert d["documento"] == {"numero": cot.numero}
    assert d["confirmada_el"].endswith("Z")
    assert d["siguiente_paso"] is None  # R8: sin datos para pagar fuera de un enlace vigente
    for dato in ("Bancolombia", "117000", "468000", "Cinta", "precio", "lineas"):
        assert dato not in resp.text, dato

    # Regla h: si el asesor la reabre (p. ej. al cancelar su pedido) el enlace viejo dice 'actualizada'.
    db.refresh(cot)
    cot.estado = "BORRADOR"
    cot.gate2_confirmed_at = None
    db.commit()
    assert _detalle(_ver(app_client, raw), "actualizada")["documento"] is None


def test_cot_vencida_rechazada_y_reemplazada(app_client, db):
    sc = _sc(db)
    cot = _cot(db, sc)
    vencido = _token(db, "COT", cot.id, expires_at=_ahora() - datetime.timedelta(minutes=5))
    assert _detalle(_ver(app_client, vencido), "vencido")["documento"] == {"numero": cot.numero}

    viejo = _token(db, "COT", cot.id)
    from app.core.confirmation_tokens import revoke_pending_tokens
    revoke_pending_tokens(db, "COT", cot.id)
    nuevo = _token(db, "COT", cot.id)
    assert _detalle(_ver(app_client, viejo), "reemplazado")["documento"] is None
    assert _ver(app_client, nuevo).status_code == 200

    cot.estado = "RECHAZADA"
    db.commit()
    assert _detalle(_ver(app_client, nuevo), "no_disponible")["documento"] is None
    # Regla b antes que la e: el enlace vencido de una COT rechazada tampoco da su número (como la SC cancelada).
    vencido_rechazada = _token(db, "COT", cot.id, expires_at=_ahora() - datetime.timedelta(minutes=5))
    assert _detalle(_ver(app_client, vencido_rechazada), "no_disponible")["documento"] is None


# ─── Prueba 19 de IVA ────────────────────────────────────────────────────────────────────────────────────────

def _lineas_con_iva():
    """Las tres líneas del recorrido de IVA (T4) calculadas por el servidor, con 10% de descuento, más campos internos
    que nunca deben salir."""
    from app.core.iva import calcular_totales_cotizacion
    ejemplo = [{"product_name": "Rodillo", "qty": 6, "unit_price_cop": 206769, "total_cop": 1240614, "iva_tarifa": "19"},
               {"product_name": "Pintura", "qty": 4, "unit_price_cop": 117000, "total_cop": 468000, "iva_tarifa": "19"},
               {"product_name": "Cinta", "qty": 10, "unit_price_cop": 13200, "total_cop": 132000, "iva_tarifa": "5"}]
    r = calcular_totales_cotizacion(ejemplo, 10)
    lineas = [dict(l, cost_usd=40, margen_pct=30, flete_usd=3) for l in r["lineas"]]
    return lineas, r


def test_documento_cot_con_iva_trae_el_desglose(app_client, db):
    from app.core.documento_cliente import documento_cot
    lineas, r = _lineas_con_iva()
    assert (r["subtotal_cop"], r["iva_cop"], r["total_cop"]) == (1840614, 298113, 1954666)
    sc = _sc(db, modalidad_pago="Contado")
    cot = _cot(db, sc, productos=lineas, subtotal_cop=r["subtotal_cop"], descuento_pct=10, tax_cop=r["iva_cop"],
               total_cop=r["total_cop"])
    for doc in (documento_cot(db, cot), _documento_por_el_enlace(app_client, db, cot)[1]):
        assert doc["totales"] == {
            "subtotal": 1840614, "descuento_pct": 10, "descuento": 184061,
            "impuestos": [{"etiqueta": "IVA 19%", "base": 1537753, "valor": 292173},
                          {"etiqueta": "IVA 5%", "base": 118800, "valor": 5940}],
            "ajuste_redondeo": None, "total": 1954666}
        assert _cuadra(doc["totales"])
        assert [l["iva_etiqueta"] for l in doc["lineas"]] == ["IVA 19%", "IVA 19%", "IVA 5%"]
        assert [l["iva_pct"] for l in doc["lineas"]] == [19, 19, 5]
        assert [l["total_linea"] for l in doc["lineas"]] == [1240614, 468000, 132000]  # C4: sin IVA
        assert doc["pago"]["anticipo"] == 1954666  # Contado: el total con IVA
        assert sum(l["anticipo"] for l in doc["lineas"]) == doc["pago"]["anticipo"]
        texto = json.dumps(doc, ensure_ascii=False)
        for interno in ("cost_usd", "margen_pct", "flete_usd", "total_con_iva_cop", "base_iva_cop", "descuento_cop",
                        "iva_tarifa"):
            assert interno not in texto, interno
