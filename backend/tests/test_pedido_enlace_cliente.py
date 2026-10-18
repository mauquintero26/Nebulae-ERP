"""Bloque 3, Tarea 5 — U23 (vista pública): el pedido que ve el cliente por su enlace de consulta.

- POST /api/v1/pedido-cliente/ver {token}: consultar_token(tipos=TIPOS_CONSULTA) (C11), NO gasta el enlace y responde
  {status, empresa, data: documento_pven, cot_numero} (R24, RP27). Token inexistente, vencido, revocado, de otro tipo o
  pedido CANCELADO -> el mismo 400 genérico, con 'empresa' para el contacto (C10, C26).
- documento_pven con los nombres de R24: totales.total (de la cabecera), pago.pagado (total − saldo), pago.saldo,
  pago.anticipo (requerido), pago.anticipo_por_pagar (R4) y pago.pagos [{concepto, monto, metodo, fecha}]. El concepto
  sale de textos_actividad.TIPOS_PAGO (RP3), salvo TRASLADO («Saldo a favor de tu pedido anterior») y
  CONVERSION_COTIZACION («Anticipo registrado»), sin método. Nunca la referencia bancaria, quién verificó, correo,
  teléfono, costos ni márgenes.
- Hueco 2: cancelar el pedido (PATCH /pedidos/{id} y POST /pedidos/{id}/cancelar) revoca su enlace en el mismo commit.
- Hueco 3: con líneas canceladas, las líneas salen del JSON, los totales de la cabecera (nunca un ajuste por la
  cancelación) y va la nota «Se cancelaron productos; los totales ya lo reflejan».
El POST enviar-al-cliente es de T7: aquí el enlace se crea con create_confirmation_token(db, 'PVEN', id, expires_at=…).

Los símbolos nuevos de T5 se importan DENTRO de cada prueba (el runner importa el módulo fuera de un try).
Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_pedido_enlace_cliente
"""
import datetime
import hashlib
import json
import uuid

from sqlalchemy import text

MOD_60_40 = "60/40 (60% anticipo - 40% pendiente)"
ASESORA = "Laura Gómez"
CORREO = "ana@cliente.com"
TELEFONO = "3001112233"
PRODUCTOS = [{"product_name": "Sofá", "qty": 2, "unit_price_cop": 400000, "total_cop": 800000, "cost_usd": 90,
              "margen_pct": 30, "sku_id": 7},
             {"product_name": "Mesa", "qty": 1, "unit_price_cop": 200000, "total_cop": 200000}]
CLAVES_DETALLE = {"mensaje", "estado_enlace", "empresa", "documento", "confirmada_el", "siguiente_paso", "comentario"}
TITULO_CANCELADOS = "Productos cancelados"


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _sufijo():
    return uuid.uuid4().hex[:6].upper()


def _pago(db, so, tipo="ANTICIPO", monto=600000, metodo="Transferencia bancaria", fecha=datetime.date(2026, 10, 3),
          estado="CONFIRMADO", **campos):
    from app.models.fase4 import SaleOrderPayment
    pago = SaleOrderPayment(sale_order_id=so.id, tipo=tipo, monto=monto, metodo_pago=metodo, fecha=fecha,
                            estado=estado, **campos)
    db.add(pago); db.commit()
    return pago


def _enlace(db, so_id):
    """El enlace de consulta del pedido como lo creará T7: 30 días, hasta el final del día en Colombia (R6)."""
    from app.core.confirmation_tokens import create_confirmation_token
    from app.core.fechas import hoy_colombia, vence_al_final_del_dia
    return create_confirmation_token(db, "PVEN", so_id, expires_at=vence_al_final_del_dia(
        hoy_colombia() + datetime.timedelta(days=30)))


def _nota_cancelados(doc):
    """La nota de los productos cancelados del documento (hueco 3), o None."""
    return next((n for n in doc["notas"] if n["titulo"] == TITULO_CANCELADOS), None)


def _espiar_revocaciones_pven(monkeypatch):
    """r1 (C3): el commit con que se revocan los enlaces PVEN (update_pedido y fase4 importan revoke_pending_tokens al
    llamarlo, así que ven este espía)."""
    import app.core.confirmation_tokens as ct
    llamadas = []
    real = ct.revoke_pending_tokens

    def espia(db, tipo, doc_id, *args, **kwargs):
        if tipo == "PVEN":
            llamadas.append(kwargs.get("commit", True))
        return real(db, tipo, doc_id, *args, **kwargs)

    monkeypatch.setattr(ct, "revoke_pending_tokens", espia)
    return llamadas


def _pedido(db, pagado=600000, cot_notas=None, **campos):
    """SC 60/40 -> COT CONFIRMADA -> PVEN PENDIENTE_COMPRA de $1.000.000 con un anticipo verificado de `pagado`
    (Transferencia bancaria, ref 'BANCOL-123', verificado por 'verificador@x'). Devuelve (so, cot, token crudo)."""
    from app.models.erp_documents import CustomerRequest, SaleOrder, SalesQuotation
    s = _sufijo()
    datos = {"customer_name": "Ana Pérez", "customer_email": CORREO, "customer_phone": TELEFONO}
    sc = CustomerRequest(numero=f"SC-T5V{s}", estado="CONFIRMADA", modalidad_pago=MOD_60_40, advisor_name=ASESORA,
                         productos=[{"product_name": "Sofá", "qty": 2}], notas="cliente difícil", **datos)
    db.add(sc); db.commit(); db.refresh(sc)
    cot = SalesQuotation(numero=f"COT-T5V{s}", sc_id=sc.id, sc_numero=sc.numero, estado="CONFIRMADA",
                         productos=[dict(p) for p in PRODUCTOS], subtotal_cop=1000000, total_cop=1000000,
                         anticipo_cop=600000, cotizador="cotizador@nebulae.com", notas=cot_notas, **datos)
    db.add(cot); db.commit(); db.refresh(cot)
    campos.setdefault("estado", "PENDIENTE_COMPRA")
    campos.setdefault("direccion_entrega", "Calle 10 # 5-20")
    so = SaleOrder(numero=f"PVEN-T5V{s}", sc_id=sc.id, sc_numero=sc.numero, cot_id=cot.id, cot_numero=cot.numero,
                   productos=[dict(p) for p in PRODUCTOS], subtotal_cop=1000000,
                   total_cop=1000000, saldo_cop=1000000 - pagado, anticipo_cop=pagado, anticipo_pct_snapshot=60,
                   total_cost_cop=700000, created_by="creador@nebulae.com", **{**datos, **campos})
    db.add(so); db.commit(); db.refresh(so)
    if pagado:
        _pago(db, so, monto=pagado, referencia_bancaria="BANCOL-123", usuario="verificador@x",
              notes="verificado por finanzas")
    return so, cot, _enlace(db, so.id)


def _ver(app_client, raw):
    return app_client.post("/api/v1/pedido-cliente/ver", json={"token": raw})


def _renglones_de_enlace_anulado(db, so_id):
    """r2: los renglones VEN que avisan que se anuló el enlace del pedido (cambios con la etiqueta «Enlace del
    pedido»)."""
    from app.models.erp_documents import ActivityLog
    db.expire_all()
    filas = (db.query(ActivityLog).filter(ActivityLog.entity_type == "VEN", ActivityLog.entity_id == so_id)
             .order_by(ActivityLog.id.asc()).all())
    return [f for f in filas if any(c.get("etiqueta") == "Enlace del pedido"
                                    for c in (f.extra_data or {}).get("cambios", []) if isinstance(c, dict))]


def _fila(db, raw):
    return db.execute(text("SELECT used_at, resultado FROM document_confirmation_tokens WHERE token_hash = :h"),
                      {"h": hashlib.sha256(raw.encode()).hexdigest()}).mappings().first()


def _generico(resp):
    """El 400 genérico del enlace de consulta (C10): no distingue el motivo, sin documento, con la empresa (C26)."""
    assert resp.status_code == 400, resp.text
    detalle = resp.json()["detail"]
    assert isinstance(detalle, dict) and set(detalle) == CLAVES_DETALLE, detalle
    assert detalle["estado_enlace"] == "invalido" and detalle["documento"] is None
    assert isinstance(detalle["empresa"], dict)
    return detalle


def _todas_las_claves(valor):
    if isinstance(valor, dict):
        for clave, v in valor.items():
            yield clave
            yield from _todas_las_claves(v)
    elif isinstance(valor, list):
        for v in valor:
            yield from _todas_las_claves(v)


# ─── 2, 3, 6, 7, 10 y 11 de U23 ──────────────────────────────────────────────────────────────────────────────

def test_ver_pedido_muestra_lo_pagado_y_el_saldo_sin_datos_internos(app_client, db, admin_token):
    from app.core.documento_cliente import CLAVES_DOCUMENTO
    from app.core.textos_actividad import TIPOS_PAGO
    resp = app_client.put("/api/v1/empresa", json={"nombre_comercial": "Muebles Nebulae",
                                                   "instrucciones_pago": "Davivienda corriente 456"},
                          headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    so, cot, raw = _pedido(db, notas="Entregar en la portería", cot_notas="Precios válidos 5 días")

    resp = _ver(app_client, raw)
    assert resp.status_code == 200, resp.text
    j = resp.json()
    assert set(j) == {"status", "empresa", "data", "cot_numero"}  # R24/RP27
    assert j["status"] == "success" and j["cot_numero"] == cot.numero
    assert j["empresa"]["nombre_comercial"] == "Muebles Nebulae"
    doc = j["data"]
    assert set(doc) == CLAVES_DOCUMENTO
    assert (doc["tipo"], doc["titulo"], doc["numero"], doc["estado"]) == ("PVEN", "Pedido de venta", so.numero,
                                                                         "PENDIENTE_COMPRA")
    assert doc["totales"]["total"] == 1000000
    p = doc["pago"]
    assert (p["pagado"], p["saldo"], p["anticipo"], p["anticipo_por_pagar"]) == (600000, 400000, 600000, 0)
    assert (p["modalidad"], p["anticipo_pct"], p["manual"]) == (MOD_60_40, 60, False)
    assert p["pagos"] == [{"concepto": "Anticipo", "monto": 600000, "metodo": "Transferencia bancaria",
                           "fecha": "2026-10-03"}]
    assert p["pagos"][0]["concepto"] == TIPOS_PAGO["ANTICIPO"]  # RP3: la fuente única
    assert p["instrucciones"] == "Davivienda corriente 456"
    assert [l["descripcion"] for l in doc["lineas"]] == ["Sofá", "Mesa"]
    assert [l["anticipo"] for l in doc["lineas"]] == [None, None]  # C3: el anticipo por línea solo en la COT
    assert doc["cliente"] == {"nombre": "Ana Pérez", "direccion_entrega": "Calle 10 # 5-20"}
    assert doc["atendido_por"] == ASESORA
    # r1 (P5): la nota de la COT sí; las notas del pedido (so.notas) son internas y no salen.
    assert doc["notas"] == [{"titulo": "Notas", "texto": "Precios válidos 5 días"}]
    assert _nota_cancelados(doc) is None
    texto = json.dumps(j, ensure_ascii=False)
    for interno in ("BANCOL-123", "verificador@x", "verificado por finanzas", CORREO, TELEFONO, "cost_usd", "margen",
                    "Entregar en la portería",
                    "total_cost_cop", "700000", "cliente difícil", "creador@nebulae.com", "cotizador@nebulae.com"):
        assert interno not in texto, interno
    claves = set(_todas_las_claves(j))
    for interna in ("id", "sc_id", "cot_id", "customer_id", "document_id", "referencia_bancaria", "usuario", "notes"):
        assert interna not in claves, interna


def test_ver_no_gasta_el_enlace(app_client, db):
    _, _, raw = _pedido(db)
    assert _ver(app_client, raw).status_code == 200
    assert _ver(app_client, raw).status_code == 200
    assert _fila(db, raw)["used_at"] is None


def test_token_de_pedido_no_confirma_ni_se_gasta(app_client, db):
    """La prueba 6 de U23 en lo que ya existe (/confirmar/ver y /confirmar/confirmar); /confirmar/pedir-cambios es de T6."""
    so, _, raw = _pedido(db)
    resp = app_client.post("/api/v1/confirmar/ver", json={"token": raw})
    assert resp.status_code == 400 and resp.json()["detail"]["estado_enlace"] == "invalido"
    resp = app_client.post("/api/v1/confirmar/confirmar", json={"token": raw},
                           headers={"Idempotency-Key": f"t5v-{uuid.uuid4().hex[:8]}"})
    assert resp.status_code == 400 and resp.json()["detail"]["estado_enlace"] == "invalido"
    assert _fila(db, raw)["used_at"] is None
    assert _ver(app_client, raw).status_code == 200
    db.refresh(so)
    assert so.estado == "PENDIENTE_COMPRA"


def test_token_de_cot_no_abre_el_pedido(app_client, db):
    from app.core.confirmation_tokens import create_confirmation_token
    so, cot, _ = _pedido(db)
    cot.estado = "PENDIENTE_CONFIRMACION"
    db.commit()
    raw_cot = create_confirmation_token(db, "COT", cot.id)
    _generico(_ver(app_client, raw_cot))
    assert app_client.post("/api/v1/confirmar/ver", json={"token": raw_cot}).status_code == 200
    _generico(_ver(app_client, "x" * 43))


def test_anticipo_parcial_se_ve_pendiente(app_client, db):
    """R4: pagó $500.000 de un anticipo de $600.000: le faltan $100.000 del anticipo."""
    _, _, raw = _pedido(db, pagado=500000)
    resp = _ver(app_client, raw)
    assert resp.status_code == 200, resp.text
    p = resp.json()["data"]["pago"]
    assert (p["pagado"], p["saldo"], p["anticipo"], p["anticipo_por_pagar"]) == (500000, 500000, 600000, 100000)


def test_pago_trasladado_se_ve_como_saldo_a_favor(app_client, db):
    """R6 y RP3: el traslado y el pago de la conversión salen con su concepto y sin método; una devolución resta; lo
    revertido y los tipos que no son ingreso ni devolución no salen. Ordenados por fecha."""
    from app.core.textos_actividad import TIPOS_PAGO
    so, _, raw = _pedido(db, pagado=0)
    _pago(db, so, tipo="ABONO", monto=200000, metodo="Nequi", fecha=datetime.date(2026, 10, 4))
    _pago(db, so, tipo="ANTICIPO", monto=300000, metodo="TRASLADO", fecha=datetime.date(2026, 10, 1))
    _pago(db, so, tipo="ANTICIPO", monto=100000, metodo="CONVERSION_COTIZACION", fecha=datetime.date(2026, 10, 2))
    _pago(db, so, tipo="DEVOLUCION", monto=50000, fecha=datetime.date(2026, 10, 5))
    _pago(db, so, tipo="ANTICIPO", monto=999, fecha=datetime.date(2026, 10, 6), estado="REVERTIDO")
    _pago(db, so, tipo="AJUSTE_AUTORIZADO", monto=10, fecha=datetime.date(2026, 10, 7))
    resp = _ver(app_client, raw)
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["pago"]["pagos"] == [
        {"concepto": "Saldo a favor de tu pedido anterior", "monto": 300000, "metodo": None, "fecha": "2026-10-01"},
        {"concepto": "Anticipo registrado", "monto": 100000, "metodo": None, "fecha": "2026-10-02"},
        {"concepto": TIPOS_PAGO["ABONO"], "monto": 200000, "metodo": "Nequi", "fecha": "2026-10-04"},
        {"concepto": TIPOS_PAGO["DEVOLUCION"], "monto": -50000, "metodo": "Transferencia bancaria",
         "fecha": "2026-10-05"},
    ]


# ─── Hueco 2 y la prueba 5 de U23 (pedido cancelado) ─────────────────────────────────────────────────────────

def test_cancelar_el_pedido_por_la_pantalla_revoca_su_enlace(app_client, db, admin_token, monkeypatch):
    so, _, raw = _pedido(db)
    revocaciones = _espiar_revocaciones_pven(monkeypatch)
    resp = app_client.patch(f"/api/v1/ventas/pedidos/{so.id}",
                            json={"estado": "CANCELADO", "cancellation_reason": "El cliente desistió",
                                  "updated_by": "t"}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    fila = _fila(db, raw)
    assert fila["used_at"] is not None and fila["resultado"] == "REVOCADO"
    assert revocaciones == [False]  # en el commit que cancela
    _generico(_ver(app_client, raw))


def test_cancelar_el_pedido_por_fase4_revoca_su_enlace(app_client, db, admin_token, monkeypatch):
    so, _, raw = _pedido(db)
    revocaciones = _espiar_revocaciones_pven(monkeypatch)
    resp = app_client.post(f"/api/v1/ventas/pedidos/{so.id}/cancelar", json={"motivo": "El cliente desistió"},
                           headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    fila = _fila(db, raw)
    assert fila["used_at"] is not None and fila["resultado"] == "REVOCADO"
    assert revocaciones == [False]
    _generico(_ver(app_client, raw))


def test_cambio_de_cliente_del_pedido_revoca_su_enlace(app_client, db, admin_token, monkeypatch):
    """r1 (P1): si el pedido cambia de cliente (ficha, nombre, correo o teléfono), su enlace de consulta deja de abrir
    en el mismo commit: quien tenga el anterior nunca ve los datos del cliente nuevo. Un PATCH que no toca al cliente
    no lo revoca."""
    so, _, raw = _pedido(db)
    revocaciones = _espiar_revocaciones_pven(monkeypatch)
    # r3 (R18 del Bloque 2): ni la nota ni solo la dirección de la misma persona cambian a quién le llega el enlace.
    for cambio in ({"notas": "Llamar antes"}, {"direccion_entrega": "Oficina 302", "customer_address": "Calle 9 # 1-2"}):
        resp = app_client.patch(f"/api/v1/ventas/pedidos/{so.id}", json={**cambio, "updated_by": "t"},
                                headers=auth(admin_token))
        assert resp.status_code == 200, resp.text
        assert _fila(db, raw)["used_at"] is None and revocaciones == [], cambio

    resp = app_client.patch(f"/api/v1/ventas/pedidos/{so.id}",
                            json={"customer_name": "Cliente Delta Privado", "direccion_entrega": "Calle Delta 4",
                                  "updated_by": "t"}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    fila = _fila(db, raw)
    assert fila["used_at"] is not None and fila["resultado"] == "REVOCADO"
    assert revocaciones == [False]
    # r2 (P3): el asesor se entera: renglón en la Actividad del pedido, en el mismo commit, con qué hacer.
    [aviso] = _renglones_de_enlace_anulado(db, so.id)
    assert "envíaselo de nuevo" in aviso.extra_data["cambios"][0]["despues"]
    resp = _ver(app_client, raw)
    _generico(resp)
    assert "Delta" not in resp.text
    # r4 (C2): solo avisa si revocó un enlace vivo. Otro cambio de nombre, ya sin enlace vivo, no deja otro renglón.
    resp = app_client.patch(f"/api/v1/ventas/pedidos/{so.id}", json={"customer_name": "Cliente Epsilon",
                                                                     "updated_by": "t"}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert len(_renglones_de_enlace_anulado(db, so.id)) == 1

    # Solo el correo también es otro cliente para el enlace.
    so, _, raw = _pedido(db)
    resp = app_client.patch(f"/api/v1/ventas/pedidos/{so.id}", json={"customer_email": "otra@cliente.com",
                                                                     "updated_by": "t"}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert _fila(db, raw)["resultado"] == "REVOCADO"


def test_pedido_cancelado_con_el_enlace_vivo_da_el_generico(app_client, db):
    """Aunque el enlace no se hubiera revocado (dato viejo), el estado del pedido se revisa en cada vista."""
    so, _, raw = _pedido(db)
    so.estado = "CANCELADO"
    db.commit()
    _generico(_ver(app_client, raw))
    assert _fila(db, raw)["used_at"] is None


def test_enlace_vencido_o_revocado_da_el_generico(app_client, db):
    from app.core.confirmation_tokens import create_confirmation_token, revocar_token
    so, _, raw = _pedido(db)
    vencido = create_confirmation_token(db, "PVEN", so.id, expires_at=datetime.datetime(2026, 1, 1))
    _generico(_ver(app_client, vencido))
    assert revocar_token(db, raw) is True
    db.commit()
    _generico(_ver(app_client, raw))


# ─── Hueco 3: líneas canceladas ──────────────────────────────────────────────────────────────────────────────

def _convertido(app_client, db, token, productos, descuento=0, subtotal=0, total=0):
    """SC a crédito (sin anticipo que verificar) -> COT con `productos` -> CONFIRMADA con Gate 2 -> POST /confirmar.
    Con tarifas en las líneas, el servidor calcula el IVA (re-cotización); sin tarifas, los totales van tal cual."""
    from app.models.erp_documents import CustomerRequest, SaleOrder, SalesQuotation
    s = _sufijo()
    sc = CustomerRequest(numero=f"SC-T5L{s}", customer_name="Ana Pérez", modalidad_pago="Credito 30 dias",
                         estado="CONFIRMADA")
    db.add(sc); db.commit(); db.refresh(sc)
    sin_tarifa = [{k: v for k, v in p.items() if k != "iva_tarifa"} for p in productos]
    cot = SalesQuotation(numero=f"COT-T5L{s}", sc_id=sc.id, sc_numero=sc.numero, customer_name="Ana Pérez",
                         estado="BORRADOR", productos=sin_tarifa, subtotal_cop=subtotal, total_cop=total,
                         descuento_pct=descuento, anticipo_cop=0)
    db.add(cot); db.commit(); db.refresh(cot)
    if any("iva_tarifa" in p for p in productos):
        resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot.id}",
                                json={"updated_by": "t", "productos": productos, "recotizacion": True,
                                      "descuento_pct": descuento}, headers=auth(token))
        assert resp.status_code == 200, resp.text
    db.expire_all()
    db.refresh(cot)
    cot.estado = "CONFIRMADA"
    cot.gate2_confirmed_at = datetime.datetime.utcnow()
    db.commit()
    resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/confirmar", json={"user_name": "t"},
                           headers=auth(token))
    assert resp.status_code == 200, resp.text
    return db.query(SaleOrder).filter(SaleOrder.cot_id == cot.id).one()


def _cancelar_linea(app_client, db, token, so, descripcion):
    from app.models.fase1b import SaleOrderLineErp
    db.expire_all()
    linea = (db.query(SaleOrderLineErp).filter(SaleOrderLineErp.so_id == so.id,
                                               SaleOrderLineErp.description == descripcion).one())
    resp = app_client.post(f"/api/v1/ventas/pedidos/{so.id}/lineas/{linea.id}/cancelar",
                           json={"motivo": "El cliente ya no la necesita"}, headers=auth(token))
    assert resp.status_code == 200, resp.text
    db.expire_all()
    db.refresh(so)


def test_lineas_canceladas_con_iva_salen_del_json_y_los_totales_de_la_cabecera(app_client, db, admin_token):
    """Con IVA discriminado, la línea cancelada del todo sale del JSON (T4); los totales y el IVA por tarifa salen de la
    cabecera y de desglose_documento (C2, prueba 19 de IVA en el pedido), y va la nota de la cancelación."""
    from app.core.documento_cliente import documento_pven
    productos = [{"product_name": "Rodillo", "qty": 6, "unit_price_cop": 206769, "iva_tarifa": "19"},
                 {"product_name": "Pintura", "qty": 4, "unit_price_cop": 117000, "iva_tarifa": "19"},
                 {"product_name": "Cinta", "qty": 10, "unit_price_cop": 13200, "iva_tarifa": "5"}]
    so = _convertido(app_client, db, admin_token, productos, descuento=10)
    assert _nota_cancelados(documento_pven(db, so)) is None
    _cancelar_linea(app_client, db, admin_token, so, "Cinta")
    assert (so.total_cop, so.tax_cop, so.subtotal_cop) == (1829926, 292173, 1708614)

    doc = documento_pven(db, so)
    assert [l["descripcion"] for l in doc["lineas"]] == ["Rodillo", "Pintura"]
    assert [l["iva_etiqueta"] for l in doc["lineas"]] == ["IVA 19%", "IVA 19%"]
    assert doc["totales"] == {"subtotal": 1708614, "descuento_pct": 10, "descuento": 170861,
                              "impuestos": [{"etiqueta": "IVA 19%", "base": 1537753, "valor": 292173}],
                              "ajuste_redondeo": None, "total": 1829926}
    nota = _nota_cancelados(doc)["texto"]
    assert nota.startswith("Se cancelaron productos; los totales ya lo reflejan.") and "10 unidades de Cinta" in nota
    assert doc["pago"]["saldo"] == 1829926 and doc["pago"]["anticipo"] == 0  # a crédito


def test_lineas_canceladas_sin_iva_siguen_en_el_json_y_no_son_un_ajuste(app_client, db, admin_token):
    """Sin tarifas, la línea cancelada sigue en el JSON con su cantidad completa (T4): se muestra tal cual, los totales
    son los de la cabecera y la diferencia NO aparece como 'Ajuste por redondeo'."""
    from app.core.documento_cliente import documento_pven
    productos = [{"product_name": "Silla", "qty": 2, "unit_price_cop": 1000, "total_cop": 2000},
                 {"product_name": "Lámpara", "qty": 1, "unit_price_cop": 3000, "total_cop": 3000}]
    so = _convertido(app_client, db, admin_token, productos, subtotal=5000, total=5000)
    _cancelar_linea(app_client, db, admin_token, so, "Lámpara")
    assert so.total_cop == 2000

    doc = documento_pven(db, so)
    assert [(l["descripcion"], l["cantidad"], l["total_linea"]) for l in doc["lineas"]] == [
        ("Silla", 2, 2000), ("Lámpara", 1, 3000)]
    t = doc["totales"]
    assert (t["subtotal"], t["descuento"], t["impuestos"], t["ajuste_redondeo"], t["total"]) == (2000, 0, [], 0, 2000)
    # r1 (C7): la línea sigue a la vista con su cantidad completa, así que la nota dice cuál se canceló.
    assert _nota_cancelados(doc) == {"titulo": TITULO_CANCELADOS, "texto": (
        "Se cancelaron productos; los totales ya lo reflejan. Cancelado: 1 unidad de Lámpara.")}


def test_cancelar_todas_las_lineas_revoca_el_enlace(app_client, db, admin_token, monkeypatch):
    """r1 (C2): cancelar la única línea deja el pedido CANCELADO (recalculate_sale_order_state) y revoca su enlace en el
    mismo commit, igual que las otras dos formas de cancelarlo."""
    productos = [{"product_name": "Silla", "qty": 2, "unit_price_cop": 1000, "total_cop": 2000}]
    so = _convertido(app_client, db, admin_token, productos, subtotal=2000, total=2000)
    raw = _enlace(db, so.id)
    revocaciones = _espiar_revocaciones_pven(monkeypatch)
    _cancelar_linea(app_client, db, admin_token, so, "Silla")
    assert so.estado == "CANCELADO"
    fila = _fila(db, raw)
    assert fila["used_at"] is not None and fila["resultado"] == "REVOCADO"
    assert revocaciones == [False]  # r2 (C4): en el commit que cancela la línea
    _generico(_ver(app_client, raw))


# ─── Ronda r2: PATCH /solicitudes/{id}/cliente (privacidad 1) ────────────────────────────────────────────────

NOMBRE_B = "Cliente Beta Secreto"
DIRECCION_B = "Carrera Beta Secreta 99"


def _corregir(app_client, token, sc_id, **datos):
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc_id}/cliente", json=datos, headers=auth(token))
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_corregir_la_sc_de_otra_persona_no_lleva_sus_datos_al_pedido(app_client, db, admin_token):
    """r2, sonda 1: SC sin ficha de Ana con su COT y su PVEN (sin dirección de entrega). La SC pasa al cliente B y
    después se corrige la dirección por /cliente. El pedido de Ana (sin ficha, otro nombre) es de otra persona: no
    recibe la dirección de B, queda en documentos_de_otro_cliente y su enlace nunca muestra a B."""
    from app.models.customers import Customer
    so, cot, raw = _pedido(db, direccion_entrega=None)
    ficha_b = Customer(first_name="Cliente Beta", last_name="Secreto", phone="3005550000",
                       email=f"t5r2-{uuid.uuid4().hex[:8]}@test.nebulae")
    db.add(ficha_b); db.commit(); db.refresh(ficha_b)
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{so.sc_id}",
                            json={"customer_id": ficha_b.id, "customer_name": NOMBRE_B, "updated_by": "t"},
                            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    cuerpo = _corregir(app_client, admin_token, so.sc_id, customer_address=DIRECCION_B)
    assert so.numero in cuerpo["documentos_de_otro_cliente"] and cot.numero in cuerpo["documentos_de_otro_cliente"]
    assert so.numero not in cuerpo["documentos_actualizados"]
    db.expire_all()
    db.refresh(so)
    assert so.customer_address is None and so.customer_name == "Ana Pérez"
    resp = _ver(app_client, raw)
    assert DIRECCION_B not in resp.text and NOMBRE_B not in resp.text


def test_corregir_solo_la_direccion_no_revoca_el_enlace_del_pedido(app_client, db, admin_token):
    """r3 (R18 del Bloque 2): corregir solo la dirección de la misma persona no es un cambio de cliente: el pedido recibe
    la dirección y su enlace de consulta sigue vigente (lo ve la misma persona)."""
    so, _, raw = _pedido(db, direccion_entrega=None)
    cuerpo = _corregir(app_client, admin_token, so.sc_id, customer_address="Calle 9 # 1-2")
    assert so.numero in cuerpo["documentos_actualizados"] and cuerpo["enlaces_anulados"] == []
    assert _fila(db, raw)["used_at"] is None
    assert _renglones_de_enlace_anulado(db, so.id) == []
    resp = _ver(app_client, raw)
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["cliente"]["direccion_entrega"] == "Calle 9 # 1-2"


def test_corregir_la_sc_no_lleva_sus_datos_a_un_pedido_sin_ficha_ni_nombre(app_client, db, admin_token):
    """r4 (privacidad 2, sonda B): un pedido sin ficha y sin nombre (dato viejo) no permite afirmar que es de la misma
    persona: la SC pasa a B por nombre y se corrige la dirección; el pedido queda en documentos_de_otro_cliente, no
    recibe la dirección de B y su enlace sigue mostrando solo su propio pedido."""
    so, cot, raw = _pedido(db, customer_name=None, direccion_entrega=None)
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{so.sc_id}",
                            json={"customer_name": NOMBRE_B, "updated_by": "t"}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    cuerpo = _corregir(app_client, admin_token, so.sc_id, customer_address=DIRECCION_B)
    assert so.numero in cuerpo["documentos_de_otro_cliente"] and so.numero not in cuerpo["documentos_actualizados"]
    db.expire_all()
    db.refresh(so)
    assert so.customer_address is None
    resp = _ver(app_client, raw)
    assert DIRECCION_B not in resp.text and NOMBRE_B not in resp.text


def test_un_nombre_que_solo_difiere_en_tildes_es_la_misma_persona(app_client, db, admin_token):
    """r4 (C1): «Ana Perez» y «Ana Pérez» son la misma persona: el pedido sin ficha recibe el correo corregido y su
    enlace, que pudo llegar al correo equivocado, se revoca."""
    so, cot, raw = _pedido(db, customer_name="Ana  perez")
    cuerpo = _corregir(app_client, admin_token, so.sc_id, customer_email="ana.bien@cliente.com")
    assert so.numero in cuerpo["documentos_actualizados"] and so.numero not in cuerpo["documentos_de_otro_cliente"]
    assert cuerpo["enlaces_pedido_anulados"] == [so.numero]
    assert _fila(db, raw)["resultado"] == "REVOCADO"


def test_corregir_el_correo_revoca_el_enlace_del_pedido(app_client, db, admin_token):
    """r2, sonda 2: el mismo cliente corrige un correo equivocado por /cliente. El pedido abierto recibe el correo
    nuevo y su enlace de consulta (que pudo llegar al dato equivocado) se revoca en el mismo commit, con su renglón."""
    so, cot, raw = _pedido(db)
    cuerpo = _corregir(app_client, admin_token, so.sc_id, customer_email="ana.bien@cliente.com")
    assert so.numero in cuerpo["documentos_actualizados"]
    # r4: enlaces_anulados conserva el contrato del Bloque 2 (solo SC y COT); los pedidos van en su propia clave.
    assert cuerpo["enlaces_pedido_anulados"] == [so.numero] and so.numero not in cuerpo["enlaces_anulados"]
    fila = _fila(db, raw)
    assert fila["used_at"] is not None and fila["resultado"] == "REVOCADO"
    assert len(_renglones_de_enlace_anulado(db, so.id)) == 1
    _generico(_ver(app_client, raw))
