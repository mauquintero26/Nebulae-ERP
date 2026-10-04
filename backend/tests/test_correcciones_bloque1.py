"""Tarea 14: script de correcciones de datos del Bloque 1 (backend/scripts/correcciones_bloque1.py).

Por paso que escribe se prueba: que --listar encuentra lo suyo, que respeta la exclusion de los documentos reales
(aqui con numeros de prueba que imitan la exclusion), que aplicar cambia SOLO lo pedido y que escribe el respaldo
JSON en una carpeta temporal. Ademas: --aplicar con --base distinto aborta sin escribir, n1 sin decisiones no
escribe, un fallo a medio paso revierte todo el paso y --listar corre en una transaccion de solo lectura. Ronda 1: un
id o numero fuera de la lista aborta, el respaldo es minimo (sin datos del cliente) y se marca NO-APLICADO si el paso no
se aplico, h44 recoge las PXP desactualizadas por n1 (b), h46 respalda el lead y los enlaces.

La base erp_test es compartida y tiene datos reales: todo lo que escribe una prueba se limita a SUS filas (ids o
numeros propios) y el runner revierte la transaccion al terminar.

Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_correcciones_bloque1
"""
import contextlib
import datetime
import io
import json
import os
import shutil
import tempfile
import uuid
import warnings
from decimal import Decimal

import pytest
from sqlalchemy import text

BASE_COMPLETA = ("n1", "h44", "h45", "h46", "h36", "n4", "n2", "n5", "n10", "h7", "u9", "h42")
PASOS_QUE_ESCRIBEN = ("n1", "h44", "h45", "h46", "h36", "n4", "n5", "n10", "h7", "u9", "h42")
TABLA_DE_RESPALDO_H7 = "activity_logs_respaldo_textos_t14"
CONVERSION = "CONVERSION_COTIZACION"


# ─── ayudas ───────────────────────────────────────────────────────────────────────────────────────────────────

def _cb():
    from scripts import correcciones_bloque1
    return correcciones_bloque1


def _sfx():
    return uuid.uuid4().hex[:6].upper()


@contextlib.contextmanager
def _carpeta():
    ruta = tempfile.mkdtemp(prefix="respaldos_t14_")
    try:
        yield ruta
    finally:
        shutil.rmtree(ruta, ignore_errors=True)


def _respaldos(carpeta, paso):
    """Respaldos APLICADOS del paso (los '-NO-APLICADO.json' van aparte)."""
    return sorted(f for f in os.listdir(carpeta)
                  if f.startswith(f"{paso}-") and f.endswith(".json") and not f.endswith("-NO-APLICADO.json"))


def _no_aplicados(carpeta, paso):
    return sorted(f for f in os.listdir(carpeta) if f.startswith(f"{paso}-") and f.endswith("-NO-APLICADO.json"))


def _leer_respaldo(carpeta, nombre):
    """Lee un respaldo y comprueba que NO trae datos personales del cliente (respaldo minimo)."""
    with open(os.path.join(carpeta, nombre), encoding="utf-8") as f:
        crudo = f.read()
    for prohibido in ("customer_name", "customer_email", "customer_phone", "customer_address", "Cliente T14",
                      "cliente-t14@test.com", "3000000000"):
        assert prohibido not in crudo, f"el respaldo {nombre} trae {prohibido!r}"
    return json.loads(crudo)


def _base(db):
    return db.execute(text("SELECT current_database()")).scalar()


def _sc(db, numero, **campos):
    from app.models.erp_documents import CustomerRequest
    campos.setdefault("estado", "CONFIRMADA")
    campos.setdefault("modalidad_pago", "60/40 (60% anticipo - 40% pendiente)")
    sc = CustomerRequest(numero=numero, customer_name="Cliente T14", customer_email="cliente-t14@test.com",
                         productos=[{"product_name": "X", "qty": 1}], **campos)
    db.add(sc)
    db.commit()
    db.refresh(sc)
    return sc


def _cot(db, numero, sc=None, **campos):
    from app.models.erp_documents import SalesQuotation
    if sc is not None:
        campos.setdefault("sc_id", sc.id)
        campos.setdefault("sc_numero", sc.numero)
    campos.setdefault("estado", "BORRADOR")
    campos.setdefault("total_cop", 1000000)
    campos.setdefault("subtotal_cop", campos["total_cop"])
    campos.setdefault("anticipo_cop", 0)
    cot = SalesQuotation(numero=numero, customer_name="Cliente T14", customer_email="cliente-t14@test.com",
                         productos=[{"product_name": "X", "qty": 1, "unit_price_cop": 1000000}], **campos)
    db.add(cot)
    db.commit()
    db.refresh(cot)
    return cot


def _ven(db, numero, cot=None, sc=None, **campos):
    from app.models.erp_documents import SaleOrder
    if cot is not None:
        campos.setdefault("cot_id", cot.id)
        campos.setdefault("cot_numero", cot.numero)
        campos.setdefault("sc_id", cot.sc_id)
    if sc is not None:
        campos.setdefault("sc_id", sc.id)
    campos.setdefault("estado", "PENDIENTE_COMPRA")
    campos.setdefault("total_cop", 1000000)
    campos.setdefault("subtotal_cop", campos["total_cop"])
    campos.setdefault("anticipo_cop", 0)
    campos.setdefault("saldo_cop", campos["total_cop"])
    ven = SaleOrder(numero=numero, customer_name="Cliente T14", customer_email="cliente-t14@test.com",
                    customer_phone="3000000000", productos=[{"product_name": "X", "qty": 1}], **campos)
    db.add(ven)
    db.commit()
    db.refresh(ven)
    return ven


def _pago(db, ven, monto, metodo=CONVERSION, tipo="ANTICIPO", estado="CONFIRMADO", referencia=None):
    from app.models.fase4 import SaleOrderPayment
    p = SaleOrderPayment(sale_order_id=ven.id, tipo=tipo, monto=monto, moneda="COP", metodo_pago=metodo,
                         fecha=datetime.date.today(), referencia_bancaria=referencia, usuario="asesor@test",
                         idempotency_key=f"T14-{uuid.uuid4().hex}", estado=estado)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def _pxp(db, ven, numero, total, anticipo, pendiente, estado="PENDIENTE"):
    from app.models.erp_documents import PaymentPending
    p = PaymentPending(numero=numero, ven_id=ven.id, ven_numero=ven.numero, customer_name="Cliente T14",
                       monto_total=total, monto_anticipo=anticipo, monto_pendiente=pendiente, estado=estado)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def _log(db, entidad, entity_id, accion, descripcion, numero=None, **campos):
    from app.models.erp_documents import ActivityLog
    a = ActivityLog(entity_type=entidad, entity_id=entity_id, entity_numero=numero, action=accion,
                    description=descripcion, **campos)
    db.add(a)
    db.commit()
    db.refresh(a)
    return a


def _logs(db, entidad, entity_id, accion=None):
    from app.models.erp_documents import ActivityLog
    db.expire_all()
    q = db.query(ActivityLog).filter(ActivityLog.entity_type == entidad, ActivityLog.entity_id == entity_id)
    if accion:
        q = q.filter(ActivityLog.action == accion)
    return q.order_by(ActivityLog.id.asc()).all()


def _lead(db, sc, descripcion="SC creada:  - nota", fuente="SC", status="DRAFT"):
    """Un lead del CRM (sales_orders) de la solicitud, con un cliente de prueba."""
    from app.models.customers import Customer
    from app.models.sales import SalesOrder
    cliente = Customer(first_name="Cliente", last_name="T14", email=f"t14-{_sfx()}@test.nebulae")
    db.add(cliente)
    db.commit()
    lead = SalesOrder(customer_id=cliente.id, status=status, canonical_customer_request_id=sc.id,
                      lead_source=fuente, lead_description=descripcion)
    db.add(lead)
    db.commit()
    db.refresh(lead)
    return lead


def _numeros(listado, clave):
    return [f["numero"] for f in listado.seccion(clave).filas]


def _refrescar(db, *objs):
    db.expire_all()
    for o in objs:
        db.refresh(o)


# ─── la lista de pasos y los documentos reales ────────────────────────────────────────────────────────────────

def test_los_pasos_van_en_el_orden_obligatorio_y_los_reales_son_los_cuatro_del_usuario():
    cb = _cb()
    assert tuple(cb.PASOS) == BASE_COMPLETA
    assert tuple(cb.NUMEROS_REALES) == ("SC-20260731", "COT-20260449", "PVEN-20262799", "SC-20260746")
    assert set(cb.PASOS_QUE_ESCRIBEN) == set(PASOS_QUE_ESCRIBEN)


def test_calcular_excluidos_sigue_la_cadena_de_los_documentos_reales(db):
    cb = _cb()
    s = _sfx()
    sc = _sc(db, f"SC-T14{s}")
    cot = _cot(db, f"COT-T14{s}", sc)
    ven = _ven(db, f"PVEN-T14{s}", cot)
    pxp = _pxp(db, ven, f"PXP-T14{s}", 1000000, 0, 1000000)
    pago = _pago(db, ven, 100000, "Efectivo")
    # otra cadena que no tiene nada que ver
    sc2 = _sc(db, f"SC-T14B{s}")
    cot2 = _cot(db, f"COT-T14B{s}", sc2)
    ven2 = _ven(db, f"PVEN-T14B{s}", cot2)
    # sembrar por la SC, por la COT o por el PVEN da la misma cadena
    for semilla in (sc.numero, cot.numero, ven.numero):
        ex = cb.calcular_excluidos(db, (semilla,))
        assert sc.id in ex.sc and cot.id in ex.cot and ven.id in ex.pven, semilla
        assert pxp.id in ex.pxp and pago.id in ex.pagos, semilla
        assert sc2.id not in ex.sc and cot2.id not in ex.cot and ven2.id not in ex.pven, semilla
    # la etiqueta legible lleva el numero
    etiquetas = " ".join(cb.calcular_excluidos(db, (sc.numero,)).etiquetas)
    assert sc.numero in etiquetas and cot.numero in etiquetas and ven.numero in etiquetas and pxp.numero in etiquetas


# ─── n1: pagos CONVERSION_COTIZACION sin verificar ────────────────────────────────────────────────────────────

def _escenario_n1(db):
    """Un PVEN con un pago sin verificar, otro ya verificado, otro anulado y la cadena 'real' de prueba."""
    s = _sfx()
    sc = _sc(db, f"SC-T14{s}")
    cot = _cot(db, f"COT-T14{s}", sc)
    ven = _ven(db, f"PVEN-T14{s}", cot, total_cop=1000000, anticipo_cop=600000, saldo_cop=400000)
    pago = _pago(db, ven, 600000)
    pxp = _pxp(db, ven, f"PXP-T14{s}", 1000000, 600000, 400000)     # la PXP que n1 (b) deja desactualizada
    ven_ok = _ven(db, f"PVEN-T14K{s}", total_cop=1000000, anticipo_cop=600000, saldo_cop=400000)
    _pago(db, ven_ok, 600000, "Transferencia bancaria", referencia="BANCOL-1")
    ven_anulado = _ven(db, f"PVEN-T14A{s}", total_cop=1000000)
    _pago(db, ven_anulado, 600000, estado="ANULADO")
    real = _ven(db, f"PVEN-T14R{s}", total_cop=1000000, anticipo_cop=600000, saldo_cop=400000)
    pago_real = _pago(db, real, 600000)
    return dict(ven=ven, pago=pago, pxp=pxp, ven_ok=ven_ok, ven_anulado=ven_anulado, real=real,
                pago_real=pago_real)


def test_n1_lista_los_pagos_sin_verificar_y_excluye_los_reales(db):
    cb = _cb()
    e = _escenario_n1(db)
    listado = cb.listar_paso(db, "n1", excluidos=(e["real"].numero,), solo_lectura=False)
    numeros = _numeros(listado, "pagos")
    assert e["ven"].numero in numeros
    assert e["ven_ok"].numero not in numeros          # ya tiene metodo y referencia reales
    assert e["ven_anulado"].numero not in numeros     # el pago ya esta ANULADO
    assert e["real"].numero not in numeros            # documento real: excluido
    assert any(e["real"].numero in x for x in listado.excluidos)
    fila = next(f for f in listado.seccion("pagos").filas if f["numero"] == e["ven"].numero)
    assert e["pxp"].numero in fila["pxps"] and "Pendiente" in fila["pxps"]    # sus PXP: numero, estado y montos
    assert "$600.000" in fila["pxps"] and "$400.000" in fila["pxps"]
    texto = cb.texto_listado(listado)
    assert "Excluidos (documentos reales)" in texto and e["real"].numero in texto
    assert e["pxp"].numero in texto
    assert "Conteo" in texto
    assert "Cliente T14" not in texto and "cliente-t14@test.com" not in texto and "3000000000" not in texto


def test_n1_sin_decisiones_no_escribe(db):
    cb = _cb()
    e = _escenario_n1(db)
    with _carpeta() as carpeta:
        res = cb.aplicar_paso(db, "n1", base=_base(db), carpeta_respaldos=carpeta, excluidos=(e["real"].numero,),
                              numeros=[e["ven"].numero], decisiones=None)
        assert res.cambiados == 0 and not res.escribio
        assert _respaldos(carpeta, "n1") == []
    _refrescar(db, e["pago"], e["ven"])
    assert e["pago"].estado == "CONFIRMADO" and e["pago"].metodo_pago == CONVERSION
    assert e["ven"].saldo_cop == Decimal("400000")


def test_n1_opcion_a_completa_metodo_y_referencia_reales(db):
    cb = _cb()
    e = _escenario_n1(db)
    with _carpeta() as carpeta:
        res = cb.aplicar_paso(db, "n1", base=_base(db), carpeta_respaldos=carpeta, excluidos=(e["real"].numero,),
                              decisiones={e["ven"].numero: {"opcion": "a", "metodo_pago": "transferencia",
                                                            "referencia": "BANCOL-9981"}})
        assert res.cambiados == 1 and res.escribio
        archivos = _respaldos(carpeta, "n1")
        assert len(archivos) == 1 and _base(db) in archivos[0]
        guardado = _leer_respaldo(carpeta, archivos[0])
        fila = guardado["tablas"]["sale_order_payments"][0]
        assert fila["metodo_pago"] == CONVERSION and fila["estado"] == "CONFIRMADO"      # tal como estaba
        assert set(fila) == {"id", "estado", "metodo_pago", "referencia_bancaria", "notes"}   # solo lo que cambia
        assert "sale_orders" not in guardado["tablas"]       # la opcion (a) no toca el pedido
    _refrescar(db, e["pago"], e["ven"], e["pago_real"], e["real"])
    assert e["pago"].metodo_pago == "Transferencia bancaria" and e["pago"].referencia_bancaria == "BANCOL-9981"
    assert e["pago"].estado == "CONFIRMADO"
    assert e["ven"].anticipo_cop == Decimal("600000") and e["ven"].saldo_cop == Decimal("400000")  # no cambia
    assert e["pago_real"].metodo_pago == CONVERSION                                                  # el real, intacto
    assert _logs(db, "VEN", e["ven"].id, "ANTICIPO_VERIFICADO")


def test_n1_opcion_b_anula_el_pago_recalcula_y_deja_actividad(db):
    cb = _cb()
    e = _escenario_n1(db)
    # un PVEN con otro pago verificado (ABONO) al lado del automatico: el abono se conserva en las cuentas
    s = _sfx()
    mixto = _ven(db, f"PVEN-T14M{s}", total_cop=1000000, anticipo_cop=300000, saldo_cop=700000)
    pago_auto = _pago(db, mixto, 300000)
    _pago(db, mixto, 100000, "Efectivo", tipo="ABONO", referencia="REC-77")
    with _carpeta() as carpeta:
        res = cb.aplicar_paso(db, "n1", base=_base(db), carpeta_respaldos=carpeta, excluidos=(e["real"].numero,),
                              decisiones={e["ven"].numero: {"opcion": "b"}, mixto.numero: {"opcion": "b"}})
        assert res.cambiados == 2
        guardado = _leer_respaldo(carpeta, _respaldos(carpeta, "n1")[0])
        assert {f["id"] for f in guardado["tablas"]["sale_orders"]} == {e["ven"].id, mixto.id}
        fila = next(f for f in guardado["tablas"]["sale_orders"] if f["id"] == e["ven"].id)
        assert set(fila) == {"id", "anticipo_cop", "saldo_cop", "updated_at"}
        assert Decimal(fila["anticipo_cop"]) == Decimal("600000") and Decimal(fila["saldo_cop"]) == Decimal("400000")
    _refrescar(db, e["pago"], e["ven"], mixto, pago_auto, e["real"], e["pago_real"])
    assert e["pago"].estado == "ANULADO" and pago_auto.estado == "ANULADO"
    assert e["ven"].anticipo_cop == Decimal("0") and e["ven"].saldo_cop == Decimal("1000000")
    assert mixto.anticipo_cop == Decimal("0") and mixto.saldo_cop == Decimal("900000")  # total - abono verificado
    log = _logs(db, "VEN", e["ven"].id, "ANTICIPO_ANULADO")
    assert len(log) == 1 and "$600.000" in log[0].description
    assert e["pago_real"].estado == "CONFIRMADO" and e["real"].saldo_cop == Decimal("400000")


def test_n1_una_decision_invalida_aborta_el_paso_sin_escribir(db):
    cb = _cb()
    e = _escenario_n1(db)
    malas = [
        {e["ven"].numero: {"opcion": "a", "metodo_pago": "Trueque", "referencia": "ABC123"}},   # medio no permitido
        {e["ven"].numero: {"opcion": "a", "metodo_pago": "Efectivo", "referencia": "ab"}},       # referencia corta
        {e["ven"].numero: {"opcion": "c"}},                                                      # opcion inexistente
        {"PVEN-NO-EXISTE": {"opcion": "b"}},                                                      # no esta en el listado
        {e["real"].numero: {"opcion": "b"}},                                                      # documento real
    ]
    with _carpeta() as carpeta:
        for decisiones in malas:
            with pytest.raises(cb.ErrorCorreccion):
                cb.aplicar_paso(db, "n1", base=_base(db), carpeta_respaldos=carpeta,
                                excluidos=(e["real"].numero,), decisiones=decisiones)
        assert _respaldos(carpeta, "n1") == []
    _refrescar(db, e["pago"], e["pago_real"])
    assert e["pago"].estado == "CONFIRMADO" and e["pago"].metodo_pago == CONVERSION
    assert e["pago_real"].estado == "CONFIRMADO" and e["pago_real"].metodo_pago == CONVERSION


# ─── h44: PXP con los montos invertidos ───────────────────────────────────────────────────────────────────────

def test_h44_lista_las_pxp_invertidas_y_aplicar_las_corrige(db):
    cb = _cb()
    s = _sfx()
    ven = _ven(db, f"PVEN-T14{s}", total_cop=2786923, anticipo_cop=1724400, saldo_cop=1062523)
    mala = _pxp(db, ven, f"PXP-T14{s}", 2786923, 1062523, 1724400)           # invertida (la creaba el boton viejo)
    ven_b = _ven(db, f"PVEN-T14B{s}", total_cop=2786923, anticipo_cop=1724400, saldo_cop=1062523)
    buena = _pxp(db, ven_b, f"PXP-T14B{s}", 2786923, 1724400, 1062523)       # ya correcta: no se lista
    real = _ven(db, f"PVEN-T14R{s}", total_cop=2786923, anticipo_cop=1724400, saldo_cop=1062523)
    real_pxp = _pxp(db, real, f"PXP-T14R{s}", 2786923, 1062523, 1724400)     # invertida pero de un documento real
    otra = _ven(db, f"PVEN-T14C{s}", total_cop=2786923, anticipo_cop=1724400, saldo_cop=1062523)
    otra_mala = _pxp(db, otra, f"PXP-T14C{s}", 2786923, 1062523, 1724400)    # invertida y no incluida en --ids
    listado = cb.listar_paso(db, "h44", excluidos=(real.numero,), solo_lectura=False)
    numeros = _numeros(listado, "invertidas")
    assert mala.numero in numeros and otra_mala.numero in numeros
    assert buena.numero not in numeros and real_pxp.numero not in numeros
    assert any(real_pxp.numero in x for x in listado.excluidos)
    fila_mala = next(f for f in listado.seccion("invertidas").filas if f["id"] == mala.id)
    assert fila_mala["total_ok"] == Decimal("2786923") and fila_mala["anticipo_ok"] == Decimal("1724400")
    assert "Total (queda)" in cb.texto_listado(listado)
    with _carpeta() as carpeta:
        # pedir ademas la PXP real (o una que no es candidata) aborta SIN escribir y la nombra
        with pytest.raises(cb.ErrorCorreccion) as exc:
            cb.aplicar_paso(db, "h44", base=_base(db), carpeta_respaldos=carpeta, excluidos=(real.numero,),
                            ids=[mala.id, real_pxp.id, buena.id])
        assert f"id {real_pxp.id}" in str(exc.value) and "documento real" in str(exc.value)
        assert f"id {buena.id}" in str(exc.value) and "no se escribió nada" in str(exc.value)
        assert os.listdir(carpeta) == []
        res = cb.aplicar_paso(db, "h44", base=_base(db), carpeta_respaldos=carpeta, excluidos=(real.numero,),
                              ids=[mala.id])
        assert res.cambiados == 1
        guardado = _leer_respaldo(carpeta, _respaldos(carpeta, "h44")[0])
        fila = guardado["tablas"]["payment_pendings"][0]
        assert fila["id"] == mala.id and Decimal(fila["monto_anticipo"]) == Decimal("1062523")  # tal como estaba
        assert set(fila) == {"id", "monto_total", "monto_anticipo", "monto_pendiente", "updated_at"}
    _refrescar(db, mala, buena, real_pxp, otra_mala)
    assert (mala.monto_total, mala.monto_anticipo, mala.monto_pendiente) == (
        Decimal("2786923"), Decimal("1724400"), Decimal("1062523"))
    assert real_pxp.monto_anticipo == Decimal("1062523") and otra_mala.monto_anticipo == Decimal("1062523")
    assert buena.monto_anticipo == Decimal("1724400")
    log = _logs(db, "PXP", mala.id, "UPDATED")
    assert len(log) == 1 and log[0].description == "Montos corregidos (estaban invertidos)"


def test_h44_despues_de_n1_b_lista_y_corrige_la_pxp_pendiente_del_pedido(db):
    cb = _cb()
    s = _sfx()
    ven = _ven(db, f"PVEN-T14{s}", total_cop=1000000, anticipo_cop=600000, saldo_cop=400000)
    _pago(db, ven, 600000)                                          # el pago automatico que nadie verifico
    pxp = _pxp(db, ven, f"PXP-T14{s}", 1000000, 600000, 400000)     # correcta... mientras el pago "contaba"
    otro = _ven(db, f"PVEN-T14B{s}", total_cop=1000000, anticipo_cop=0, saldo_cop=1000000)
    pxp_otra = _pxp(db, otro, f"PXP-T14B{s}", 1000000, 600000, 400000)   # desactualizada pero SIN pago anulado
    cancelada = _ven(db, f"PVEN-T14C{s}", total_cop=1000000, anticipo_cop=600000, saldo_cop=400000)
    _pago(db, cancelada, 600000, estado="ANULADO")
    pxp_cancelada = _pxp(db, cancelada, f"PXP-T14C{s}", 1000000, 0, 1000000, estado="CANCELADA")  # no es PENDIENTE
    # antes de n1 (b) h44 no la lista: no es una PXP invertida
    antes = cb.listar_paso(db, "h44", solo_lectura=False)
    assert pxp.numero not in _numeros(antes, "invertidas") + _numeros(antes, "tras_n1")
    with _carpeta() as carpeta:
        cb.aplicar_paso(db, "n1", base=_base(db), carpeta_respaldos=carpeta,
                        decisiones={ven.numero: {"opcion": "b"}}, numeros=[ven.numero])
        _refrescar(db, ven)
        assert ven.anticipo_cop == Decimal("0") and ven.saldo_cop == Decimal("1000000")
        listado = cb.listar_paso(db, "h44", solo_lectura=False)
        assert pxp.numero in _numeros(listado, "tras_n1") and pxp.numero not in _numeros(listado, "invertidas")
        assert pxp_otra.numero not in _numeros(listado, "tras_n1")          # sin pago anulado: no es de este grupo
        assert pxp_cancelada.numero not in _numeros(listado, "tras_n1")     # solo las PENDIENTE
        fila = next(f for f in listado.seccion("tras_n1").filas if f["id"] == pxp.id)
        assert (fila["total_ok"], fila["anticipo_ok"], fila["pendiente_ok"]) == (
            Decimal("1000000"), Decimal("0"), Decimal("1000000"))
        assert "(b) PXP pendientes de pedidos con un pago sin verificar ANULADO" in cb.texto_listado(listado)
        res = cb.aplicar_paso(db, "h44", base=_base(db), carpeta_respaldos=carpeta, ids=[pxp.id])
        assert res.cambiados == 1
        guardado = _leer_respaldo(carpeta, _respaldos(carpeta, "h44")[0])
        assert Decimal(guardado["tablas"]["payment_pendings"][0]["monto_anticipo"]) == Decimal("600000")
    _refrescar(db, pxp, pxp_otra)
    assert (pxp.monto_total, pxp.monto_anticipo, pxp.monto_pendiente) == (
        Decimal("1000000"), Decimal("0"), Decimal("1000000"))
    assert pxp_otra.monto_anticipo == Decimal("600000")                     # no era candidata: intacta
    log = _logs(db, "PXP", pxp.id, "UPDATED")
    assert len(log) == 1 and "recalculados desde el pedido" in log[0].description
    # ya corregida, deja de salir
    otra_vez = cb.listar_paso(db, "h44", solo_lectura=False)
    assert pxp.numero not in _numeros(otra_vez, "tras_n1")


# ─── h45: PXP pendientes de pedidos cancelados ────────────────────────────────────────────────────────────────

def test_h45_lista_y_cancela_las_pxp_pendientes_de_pedidos_cancelados(db):
    cb = _cb()
    s = _sfx()
    cancelado = _ven(db, f"PVEN-T14{s}", estado="CANCELADO", total_cop=500000, saldo_cop=300000)
    pxp = _pxp(db, cancelado, f"PXP-T14{s}", 500000, 200000, 300000)
    cancelado.pxp_id, cancelado.pxp_numero = pxp.id, pxp.numero
    db.commit()
    pagada = _pxp(db, cancelado, f"PXP-T14P{s}", 500000, 200000, 300000, estado="PAGADA")  # no es PENDIENTE
    vivo = _ven(db, f"PVEN-T14V{s}", estado="EN_PROCESO")
    pxp_viva = _pxp(db, vivo, f"PXP-T14V{s}", 1000000, 0, 1000000)                        # pedido no cancelado
    real = _ven(db, f"PVEN-T14R{s}", estado="CANCELADO")
    pxp_real = _pxp(db, real, f"PXP-T14R{s}", 1000000, 0, 1000000)
    listado = cb.listar_paso(db, "h45", excluidos=(real.numero,), solo_lectura=False)
    numeros = _numeros(listado, "pendientes")
    assert pxp.numero in numeros
    assert pagada.numero not in numeros and pxp_viva.numero not in numeros and pxp_real.numero not in numeros
    assert any(pxp_real.numero in x for x in listado.excluidos)
    with _carpeta() as carpeta:
        with pytest.raises(cb.ErrorCorreccion) as exc:        # la real y la de un pedido vivo no son candidatas
            cb.aplicar_paso(db, "h45", base=_base(db), carpeta_respaldos=carpeta, excluidos=(real.numero,),
                            ids=[pxp.id, pxp_real.id, pxp_viva.id])
        assert f"id {pxp_real.id}" in str(exc.value) and f"id {pxp_viva.id}" in str(exc.value)
        assert os.listdir(carpeta) == []
        res = cb.aplicar_paso(db, "h45", base=_base(db), carpeta_respaldos=carpeta, excluidos=(real.numero,),
                              ids=[pxp.id])
        assert res.cambiados == 1
        guardado = _leer_respaldo(carpeta, _respaldos(carpeta, "h45")[0])
        assert guardado["tablas"]["payment_pendings"][0]["estado"] == "PENDIENTE"  # tal como estaba
        fila_pxp = guardado["tablas"]["payment_pendings"][0]
        assert set(fila_pxp) == {"id", "estado", "notas", "updated_at"}
        fila_ven = guardado["tablas"]["sale_orders"][0]
        assert fila_ven["id"] == cancelado.id and fila_ven["pxp_id"] == pxp.id and set(fila_ven) == {
            "id", "pxp_id", "pxp_numero"}
    _refrescar(db, pxp, pagada, pxp_viva, pxp_real, cancelado)
    assert pxp.estado == "CANCELADA" and "ya estaba cancelado" in pxp.notas
    assert pagada.estado == "PAGADA" and pxp_viva.estado == "PENDIENTE" and pxp_real.estado == "PENDIENTE"
    assert cancelado.pxp_id is None and cancelado.pxp_numero is None
    estado = _logs(db, "PXP", pxp.id, "ESTADO_CHANGED")
    assert len(estado) == 1 and (estado[0].old_estado, estado[0].new_estado) == ("PENDIENTE", "CANCELADA")
    assert _logs(db, "VEN", cancelado.id, "PXP_CANCELADA")


# ─── h46: COT confirmadas con todos sus pedidos cancelados ─────────────────────────────────────────────────────

def test_h46_reabre_las_cotizaciones_con_todos_sus_pedidos_cancelados(db):
    from app.core.confirmation_tokens import create_confirmation_token
    from app.models.confirmation import DocumentConfirmationToken
    cb = _cb()
    s = _sfx()
    sc = _sc(db, f"SC-T14{s}", estado="CONFIRMADA")
    cot = _cot(db, f"COT-T14{s}", sc, estado="CONFIRMADA", gate2_confirmed_at=datetime.datetime.utcnow())
    ven = _ven(db, f"PVEN-T14{s}", cot, estado="CANCELADO")
    lead = _lead(db, sc, "SC creada: x", status="DRAFT")            # su lead: hoy "Nuevo Lead", pasaria a cotizacion
    create_confirmation_token(db, "COT", cot.id)                     # un enlace de confirmacion pendiente
    token = db.query(DocumentConfirmationToken).filter(
        DocumentConfirmationToken.document_type == "COT", DocumentConfirmationToken.document_id == cot.id).first()
    sc_v = _sc(db, f"SC-T14V{s}", estado="CONFIRMADA")
    cot_viva = _cot(db, f"COT-T14V{s}", sc_v, estado="CONFIRMADA")
    _ven(db, f"PVEN-T14V{s}", cot_viva, estado="EN_PROCESO")                    # pedido vigente: no se lista
    sc_r = _sc(db, f"SC-T14R{s}", estado="CONFIRMADA")
    cot_real = _cot(db, f"COT-T14R{s}", sc_r, estado="CONFIRMADA", gate2_confirmed_at=datetime.datetime.utcnow())
    _ven(db, f"PVEN-T14R{s}", cot_real, estado="CANCELADO")                      # documento real
    listado = cb.listar_paso(db, "h46", excluidos=(cot_real.numero,), solo_lectura=False)
    numeros = _numeros(listado, "cotizaciones")
    assert cot.numero in numeros and cot_viva.numero not in numeros and cot_real.numero not in numeros
    assert any(cot_real.numero in x for x in listado.excluidos)
    fila = next(f for f in listado.seccion("cotizaciones").filas if f["id"] == cot.id)
    assert fila["lead"] == f"#{lead.id}" and fila["lead_etapa"] == "Nuevo Lead"      # legible, no 'DRAFT'
    assert fila["lead_destino"] and fila["lead_destino"] != "QUOTATION" and fila["lead_destino"] != "-"
    texto = cb.texto_listado(listado)
    assert "Etapa del lead (hoy)" in texto and "Nuevo Lead" in texto
    assert "NO es atómico" in listado.que_haria and "idempotente" in listado.que_haria     # aviso en el listado
    with _carpeta() as carpeta:
        with pytest.raises(cb.ErrorCorreccion) as exc:
            cb.aplicar_paso(db, "h46", base=_base(db), carpeta_respaldos=carpeta, excluidos=(cot_real.numero,),
                            numeros=[cot.numero, cot_real.numero, cot_viva.numero])
        assert cot_real.numero in str(exc.value) and cot_viva.numero in str(exc.value)
        assert os.listdir(carpeta) == []
        res = cb.aplicar_paso(db, "h46", base=_base(db), carpeta_respaldos=carpeta, excluidos=(cot_real.numero,),
                              numeros=[cot.numero])
        assert res.cambiados == 1
        assert any("NO es atómico" in d and "idempotente" in d for d in res.detalle)    # aviso en la salida
        guardado = _leer_respaldo(carpeta, _respaldos(carpeta, "h46")[0])
        t = guardado["tablas"]
        assert [f["id"] for f in t["sales_quotations"]] == [cot.id]
        assert t["sales_quotations"][0]["estado"] == "CONFIRMADA" and t["sales_quotations"][0]["gate2_confirmed_at"]
        assert set(t["sales_quotations"][0]) == {"id", "estado", "gate2_confirmed_at", "updated_at"}
        assert [(f["id"], f["estado"]) for f in t["customer_requests"]] == [(sc.id, "CONFIRMADA")]
        assert [(f["id"], f["status"], f["pipeline_stage_id"]) for f in t["sales_orders"]] == [
            (lead.id, "DRAFT", None)]                                        # el lead, tal como estaba
        assert [(f["id"], f["used_at"]) for f in t["document_confirmation_tokens"]] == [(token.id, None)]
    _refrescar(db, cot, sc, cot_viva, cot_real, sc_r, lead, token)
    assert cot.estado == "BORRADOR" and cot.gate2_confirmed_at is None and sc.estado == "COTIZADA"
    assert lead.status == "QUOTATION" and token.used_at is not None                  # lo que el respaldo permite deshacer
    assert cot_viva.estado == "CONFIRMADA" and cot_real.estado == "CONFIRMADA" and sc_r.estado == "CONFIRMADA"
    log = _logs(db, "COT", cot.id, "ESTADO_CHANGED")
    assert len(log) == 1 and ven.numero in log[0].description and "vuelve a Borrador" in log[0].description


def test_h46_no_cuenta_como_reabierta_la_que_queda_sin_su_renglon_de_actividad(db, monkeypatch):
    import app.api.v1.erp_ventas as m_ventas
    cb = _cb()
    s = _sfx()
    sc = _sc(db, f"SC-T14{s}", estado="CONFIRMADA")
    cot = _cot(db, f"COT-T14{s}", sc, estado="CONFIRMADA", gate2_confirmed_at=datetime.datetime.utcnow())
    _ven(db, f"PVEN-T14{s}", cot, estado="CANCELADO")

    def _helper_que_deja_borrador_sin_log(db_, so, user_name):          # cambia el estado pero no registra la Actividad
        cot_ = db_.query(type(cot)).filter_by(id=so.cot_id).first()
        cot_.estado = "BORRADOR"
        db_.commit()

    monkeypatch.setattr(m_ventas, "_reabrir_cotizacion_por_pven_cancelado", _helper_que_deja_borrador_sin_log)
    with _carpeta() as carpeta:
        res = cb.aplicar_paso(db, "h46", base=_base(db), carpeta_respaldos=carpeta, numeros=[cot.numero])
        assert res.cambiados == 0
        assert any(cot.numero in d and "NO se encontró su renglón de Actividad" in d for d in res.detalle)
        # no cambio nada "contado": el respaldo queda marcado como no aplicado
        assert _respaldos(carpeta, "h46") == [] and len(_no_aplicados(carpeta, "h46")) == 1
        assert res.respaldo is None and any("NO-APLICADO" in d for d in res.detalle)


# ─── h36: anticipo de las COT abiertas ────────────────────────────────────────────────────────────────────────

def test_h36_recalcula_el_anticipo_segun_la_modalidad(db):
    cb = _cb()
    s = _sfx()
    sc60 = _sc(db, f"SC-T14A{s}", modalidad_pago="60/40 (60% anticipo - 40% pendiente)")
    cot60 = _cot(db, f"COT-T14A{s}", sc60, total_cop=2786923, anticipo_cop=1724400)      # 60% de un total anterior
    sc_c = _sc(db, f"SC-T14B{s}", modalidad_pago="Contado")
    cot_c = _cot(db, f"COT-T14B{s}", sc_c, estado="ENVIADA", total_cop=1000000, anticipo_cop=0)
    sc_cr = _sc(db, f"SC-T14C{s}", modalidad_pago="Crédito 30 días")
    cot_cr = _cot(db, f"COT-T14C{s}", sc_cr, total_cop=1000000, anticipo_cop=600000)
    sc_ok = _sc(db, f"SC-T14D{s}")
    cot_ok = _cot(db, f"COT-T14D{s}", sc_ok, total_cop=1000000, anticipo_cop=600000)     # ya correcta
    sc_v = _sc(db, f"SC-T14E{s}")
    cot_v = _cot(db, f"COT-T14E{s}", sc_v, estado="CONFIRMADA", total_cop=1000000, anticipo_cop=0)
    _ven(db, f"PVEN-T14E{s}", cot_v, estado="EN_PROCESO")                                # pedido vigente: no se toca
    sc_r = _sc(db, f"SC-T14R{s}", modalidad_pago="Contado")
    cot_r = _cot(db, f"COT-T14R{s}", sc_r, total_cop=1000000, anticipo_cop=0)            # real
    listado = cb.listar_paso(db, "h36", excluidos=(cot_r.numero,), solo_lectura=False)
    filas = {f["numero"]: f for f in listado.seccion("desactualizadas").filas}
    assert set(filas) >= {cot60.numero, cot_c.numero, cot_cr.numero}
    assert cot_ok.numero not in filas and cot_v.numero not in filas and cot_r.numero not in filas
    assert Decimal(str(filas[cot60.numero]["anticipo_nuevo"])) == Decimal("1672154")
    assert filas[cot60.numero]["pct"] == "60%" and filas[cot_c.numero]["pct"] == "100%"   # formato_pct
    assert any(cot_r.numero in x for x in listado.excluidos)
    with _carpeta() as carpeta:
        with pytest.raises(cb.ErrorCorreccion) as exc:    # ya correcta, con pedido vigente y real: no son candidatas
            cb.aplicar_paso(db, "h36", base=_base(db), carpeta_respaldos=carpeta, excluidos=(cot_r.numero,),
                            numeros=[cot60.numero, cot_ok.numero, cot_v.numero, cot_r.numero])
        for fuera in (cot_ok, cot_v, cot_r):
            assert fuera.numero in str(exc.value)
        assert cot60.numero not in str(exc.value) and os.listdir(carpeta) == []
        res = cb.aplicar_paso(db, "h36", base=_base(db), carpeta_respaldos=carpeta, excluidos=(cot_r.numero,),
                              numeros=[cot60.numero, cot_c.numero, cot_cr.numero])
        assert res.cambiados == 3
        guardado = _leer_respaldo(carpeta, _respaldos(carpeta, "h36")[0])
        assert {f["id"] for f in guardado["tablas"]["sales_quotations"]} == {cot60.id, cot_c.id, cot_cr.id}
        assert set(guardado["tablas"]["sales_quotations"][0]) == {"id", "anticipo_cop", "updated_at"}
    _refrescar(db, cot60, cot_c, cot_cr, cot_ok, cot_v, cot_r)
    assert cot60.anticipo_cop == Decimal("1672154") and cot_c.anticipo_cop == Decimal("1000000")
    assert cot_cr.anticipo_cop == Decimal("0") and cot_ok.anticipo_cop == Decimal("600000")
    assert cot_v.anticipo_cop == Decimal("0") and cot_r.anticipo_cop == Decimal("0")
    log = _logs(db, "COT", cot60.id, "UPDATED")
    assert len(log) == 1 and "Anticipo recalculado" in log[0].description and "$1.672.154" in log[0].description


# ─── n4: solicitudes canceladas ───────────────────────────────────────────────────────────────────────────────

def test_n4_lista_a_b_c_y_aplicar_solo_escribe_el_c(db):
    cb = _cb()
    s = _sfx()
    # (a) SC cancelada con una COT activa
    sc_a = _sc(db, f"SC-T14A{s}", estado="CANCELADA", eliminada_at=datetime.datetime.utcnow(), razon_cancelacion="x")
    cot_a = _cot(db, f"COT-T14A{s}", sc_a, estado="ENVIADA")
    # (b) SC en la papelera que no esta cancelada
    sc_b = _sc(db, f"SC-T14B{s}", estado="ASIGNADA", eliminada_at=datetime.datetime.utcnow())
    # (c) SC cancelada con la pastilla vieja: sin eliminada_at ni motivo
    sc_c = _sc(db, f"SC-T14C{s}", estado="CANCELADA")
    sc_sop = _sc(db, f"SC-T14S{s}", estado="CANCELADA", tipo_solicitud="Soporte Tecnico")   # Soporte no se toca
    sc_nula = _sc(db, f"SC-T14N{s}", estado="CANCELADA")
    # tipo_solicitud NULL de verdad (con None el ORM aplica el default de la columna): no es Soporte, se corrige igual
    db.execute(text("UPDATE customer_requests SET tipo_solicitud = NULL WHERE id = :i"), {"i": sc_nula.id})
    db.commit()
    sc_ok =_sc(db, f"SC-T14K{s}", estado="CANCELADA", eliminada_at=datetime.datetime.utcnow(), razon_cancelacion="x")
    sc_real = _sc(db, f"SC-T14R{s}", estado="CANCELADA")                                       # real
    sc_ref = _sc(db, f"SC-T14F{s}", estado="CANCELADA")        # cancelada a la antigua pero con una COT rechazada
    _cot(db, f"COT-T14F{s}", sc_ref, estado="RECHAZADA")
    listado = cb.listar_paso(db, "n4", excluidos=(sc_real.numero,), solo_lectura=False)
    assert sc_a.numero in _numeros(listado, "a")
    assert sc_b.numero in _numeros(listado, "b")
    c = _numeros(listado, "c")
    assert sc_c.numero in c and sc_nula.numero in c
    assert sc_sop.numero not in c and sc_ok.numero not in c and sc_real.numero not in c
    assert cot_a.numero in " ".join(str(f.get("documentos", "")) for f in listado.seccion("a").filas)
    assert any(sc_real.numero in x for x in listado.excluidos)
    filas_c = {f["numero"]: f for f in listado.seccion("c").filas}
    assert "se purgaría" in filas_c[sc_c.numero]["purga"] and "no se purga" in filas_c[sc_ref.numero]["purga"]
    assert "BORRA DEFINITIVAMENTE" in listado.que_haria and "30 días" in listado.que_haria     # aviso de la purga
    with _carpeta() as carpeta:
        with pytest.raises(cb.ErrorCorreccion) as exc:       # a y b no se escriben; Soporte y la real no son candidatas
            cb.aplicar_paso(db, "n4", base=_base(db), carpeta_respaldos=carpeta, excluidos=(sc_real.numero,),
                            numeros=[sc_a.numero, sc_b.numero, sc_c.numero, sc_sop.numero, sc_real.numero])
        msg = str(exc.value)
        assert f"{sc_a.numero}: está en el grupo (a)" in msg and f"{sc_b.numero}: está en el grupo (b)" in msg
        assert f"{sc_sop.numero}: no está entre los candidatos" in msg and f"{sc_real.numero}: es un documento real" in msg
        assert sc_c.numero not in msg and os.listdir(carpeta) == []
        res = cb.aplicar_paso(db, "n4", base=_base(db), carpeta_respaldos=carpeta, excluidos=(sc_real.numero,),
                              numeros=[sc_c.numero])
        assert res.cambiados == 1                                     # solo la (c): a y b se listan y ya
        assert any(sc_c.numero in d and "purga" in d for d in res.detalle)    # sin documentos: avisa que se purgaria
        guardado = _leer_respaldo(carpeta, _respaldos(carpeta, "n4")[0])
        assert [f["id"] for f in guardado["tablas"]["customer_requests"]] == [sc_c.id]
        assert set(guardado["tablas"]["customer_requests"][0]) == {"id", "eliminada_at", "razon_cancelacion"}
    _refrescar(db, sc_a, sc_b, sc_c, sc_sop, sc_nula, sc_real)
    assert sc_c.eliminada_at is not None and sc_c.razon_cancelacion.startswith("Cancelada con el cambio de estado")
    assert sc_sop.eliminada_at is None and sc_nula.eliminada_at is None and sc_real.eliminada_at is None
    assert sc_a.estado == "CANCELADA" and sc_b.estado == "ASIGNADA"


# ─── n2: solo listado ─────────────────────────────────────────────────────────────────────────────────────────

def test_n2_lista_las_tres_consultas_y_aplicar_no_escribe(db):
    from app.models.inventory import InventoryOperation
    cb = _cb()
    s = _sfx()
    revivido = _ven(db, f"PVEN-T14A{s}", estado="EN_PROCESO")
    db.add(InventoryOperation(operation_type="DELIVERY", status="DONE", source_document_type="PVEN",
                              source_document_id=revivido.id, source_document_numero=revivido.numero))
    db.commit()
    reabierto = _ven(db, f"PVEN-T14B{s}", estado="EN_PROCESO", cancelled_at=datetime.datetime.utcnow(),
                     cancellation_reason="El cliente desistió")
    sin_motivo = _ven(db, f"PVEN-T14C{s}", estado="CANCELADO")
    con_motivo = _ven(db, f"PVEN-T14D{s}", estado="CANCELADO", cancellation_reason="El cliente desistió")
    entregado = _ven(db, f"PVEN-T14E{s}", estado="ENTREGADO")
    db.add(InventoryOperation(operation_type="DELIVERY", status="DONE", source_document_type="PVEN",
                              source_document_id=entregado.id, source_document_numero=entregado.numero))
    real = _ven(db, f"PVEN-T14R{s}", estado="EN_PROCESO", cancelled_at=datetime.datetime.utcnow())
    db.commit()
    listado = cb.listar_paso(db, "n2", excluidos=(real.numero,), solo_lectura=False)
    assert revivido.numero in _numeros(listado, "a") and entregado.numero not in _numeros(listado, "a")
    assert reabierto.numero in _numeros(listado, "b") and real.numero not in _numeros(listado, "b")
    assert sin_motivo.numero in _numeros(listado, "c") and con_motivo.numero not in _numeros(listado, "c")
    assert any(real.numero in x for x in listado.excluidos)
    texto = cb.texto_listado(listado)                               # (c) se imprime como lista de numeros
    assert sin_motivo.numero in texto and con_motivo.numero not in texto
    with _carpeta() as carpeta:
        res = cb.aplicar_paso(db, "n2", base=_base(db), carpeta_respaldos=carpeta, excluidos=(real.numero,),
                              numeros=[revivido.numero])
        assert res.cambiados == 0 and not res.escribio and "no escribe" in " ".join(res.detalle).lower()
        assert os.listdir(carpeta) == []
    _refrescar(db, revivido, reabierto, sin_motivo)
    assert (revivido.estado, reabierto.estado, sin_motivo.estado) == ("EN_PROCESO", "EN_PROCESO", "CANCELADO")


# ─── n5: estados ajenos ───────────────────────────────────────────────────────────────────────────────────────

def test_n5_lista_a_b_c_y_aplica_la_correccion_solo_a_los_numeros_pedidos(db, user_admin):
    cb = _cb()
    s = _sfx()
    # (a) SC con un estado de pedido
    sc_cot = _sc(db, f"SC-T14A{s}", estado="FACTURADO")
    cot_env = _cot(db, f"COT-T14A{s}", sc_cot, estado="ENVIADA")             # -> EN_ESPERA_CONFIRMACION
    sc_asesor = _sc(db, f"SC-T14B{s}", estado="ENTREGADO", advisor_user_id=user_admin.id)   # sin COT -> ASIGNADA
    sc_libre = _sc(db, f"SC-T14C{s}", estado="EN_PROCESO")                                   # sin COT ni asesor -> BORRADOR
    sc_sin_pedir = _sc(db, f"SC-T14D{s}", estado="FACTURADO")                                 # no esta en --numeros
    # (b) COT con un estado ajeno
    sc_v = _sc(db, f"SC-T14E{s}", estado="CONFIRMADA")
    cot_ajena_viva = _cot(db, f"COT-T14E{s}", sc_v, estado="ENTREGADO")
    _ven(db, f"PVEN-T14E{s}", cot_ajena_viva, estado="EN_PROCESO")           # con pedido vigente -> CONFIRMADA
    cot_ajena = _cot(db, f"COT-T14F{s}", None, estado="FACTURADO")           # sin pedido -> BORRADOR
    # (c) COT que no esta CONFIRMADA y tiene un pedido vivo
    sc_c = _sc(db, f"SC-T14G{s}", estado="CONFIRMADA")
    cot_rech = _cot(db, f"COT-T14G{s}", sc_c, estado="RECHAZADA")
    _ven(db, f"PVEN-T14G{s}", cot_rech, estado="PENDIENTE_COMPRA")
    # documento real
    sc_real = _sc(db, f"SC-T14R{s}", estado="FACTURADO")
    listado = cb.listar_paso(db, "n5", excluidos=(sc_real.numero,), solo_lectura=False)
    a, b, c = _numeros(listado, "a"), _numeros(listado, "b"), _numeros(listado, "c")
    assert {sc_cot.numero, sc_asesor.numero, sc_libre.numero, sc_sin_pedir.numero} <= set(a)
    assert sc_real.numero not in a and any(sc_real.numero in x for x in listado.excluidos)
    assert {cot_ajena_viva.numero, cot_ajena.numero} <= set(b)
    assert cot_rech.numero in c
    sugeridos = {f["numero"]: f["sugerido"] for sec in ("a", "b", "c") for f in listado.seccion(sec).filas}
    assert sugeridos[sc_cot.numero] == "EN_ESPERA_CONFIRMACION" and sugeridos[sc_asesor.numero] == "ASIGNADA"
    assert sugeridos[sc_libre.numero] == "BORRADOR" and sugeridos[cot_ajena_viva.numero] == "CONFIRMADA"
    assert sugeridos[cot_ajena.numero] == "BORRADOR" and sugeridos[cot_rech.numero] == "CONFIRMADA"
    etiquetas = {f["numero"]: f["sugerido_txt"] for sec in ("a", "b", "c") for f in listado.seccion(sec).filas}
    assert etiquetas[sc_cot.numero] == "En espera de confirmación" and etiquetas[sc_asesor.numero] == "Asignada"
    assert etiquetas[cot_ajena_viva.numero] == "Confirmada" and etiquetas[cot_ajena.numero] == "Borrador"
    with _carpeta() as carpeta:
        # sin --numeros no aplica nada: n5 se decide documento por documento
        sin = cb.aplicar_paso(db, "n5", base=_base(db), carpeta_respaldos=carpeta, excluidos=(sc_real.numero,))
        assert sin.cambiados == 0 and _respaldos(carpeta, "n5") == []
        # --ids no se acepta (los ids de SC y COT se repiten) y un numero fuera de la lista aborta
        with pytest.raises(cb.ErrorCorreccion) as exc:
            cb.aplicar_paso(db, "n5", base=_base(db), carpeta_respaldos=carpeta, excluidos=(sc_real.numero,),
                            ids=[sc_cot.id], numeros=[sc_cot.numero])
        assert "solo acepta --numeros" in str(exc.value)
        with pytest.raises(cb.ErrorCorreccion) as exc:
            cb.aplicar_paso(db, "n5", base=_base(db), carpeta_respaldos=carpeta, excluidos=(sc_real.numero,),
                            numeros=[sc_cot.numero, sc_real.numero, "SC-NO-EXISTE"])
        assert sc_real.numero in str(exc.value) and "SC-NO-EXISTE" in str(exc.value) and os.listdir(carpeta) == []
        res = cb.aplicar_paso(db, "n5", base=_base(db), carpeta_respaldos=carpeta, excluidos=(sc_real.numero,),
                              numeros=[sc_cot.numero, sc_asesor.numero, sc_libre.numero, cot_ajena_viva.numero,
                                       cot_ajena.numero, cot_rech.numero])
        assert res.cambiados == 6
        guardado = _leer_respaldo(carpeta, _respaldos(carpeta, "n5")[0])
        assert {f["id"] for f in guardado["tablas"]["customer_requests"]} == {sc_cot.id, sc_asesor.id, sc_libre.id}
        assert {f["id"] for f in guardado["tablas"]["sales_quotations"]} == {
            cot_ajena_viva.id, cot_ajena.id, cot_rech.id}
        assert set(guardado["tablas"]["sales_quotations"][0]) == {"id", "estado", "updated_at"}
    _refrescar(db, sc_cot, sc_asesor, sc_libre, sc_sin_pedir, sc_real, cot_ajena_viva, cot_ajena, cot_rech)
    assert (sc_cot.estado, sc_asesor.estado, sc_libre.estado) == ("EN_ESPERA_CONFIRMACION", "ASIGNADA", "BORRADOR")
    assert (cot_ajena_viva.estado, cot_ajena.estado, cot_rech.estado) == ("CONFIRMADA", "BORRADOR", "CONFIRMADA")
    assert sc_sin_pedir.estado == "FACTURADO" and sc_real.estado == "FACTURADO"
    log = _logs(db, "SC", sc_cot.id, "ESTADO_CHANGED")
    assert len(log) == 1 and (log[0].old_estado, log[0].new_estado) == ("FACTURADO", "EN_ESPERA_CONFIRMACION")


# ─── n10: logs de mercancia disponible ────────────────────────────────────────────────────────────────────────

def test_n10_cuenta_y_corrige_los_logs_de_mercancia_disponible(db):
    from app.models.fase1b import SaleOrderLineErp
    cb = _cb()
    s = _sfx()
    ven = _ven(db, f"PVEN-T14{s}")
    linea = SaleOrderLineErp(so_id=ven.id, description="Cuna", quantity=1, unit_price_cop=1000)
    real = _ven(db, f"PVEN-T14R{s}")
    linea_real = SaleOrderLineErp(so_id=real.id, description="Cuna", quantity=1, unit_price_cop=1000)
    db.add_all([linea, linea_real])
    db.commit()
    malo = _log(db, "PVEN", linea.id, "MERCANCIA_DISPONIBLE", "Mercancia disponible para la cuna")
    malo_real = _log(db, "PVEN", linea_real.id, "MERCANCIA_DISPONIBLE", "Mercancia disponible (real)")
    huerfano = _log(db, "PVEN", 2_000_000_000, "MERCANCIA_DISPONIBLE", "Sin linea")
    otra_accion = _log(db, "PVEN", linea.id, "VENTA_CANCELADA", "No es de mercancia")
    ya_bien = _log(db, "VEN", ven.id, "MERCANCIA_DISPONIBLE", "Ya estaba bien")
    listado = cb.listar_paso(db, "n10", excluidos=(real.numero,), solo_lectura=False)
    ids = [f["id"] for f in listado.seccion("logs").filas]
    assert malo.id in ids and malo_real.id not in ids and huerfano.id not in ids
    assert otra_accion.id not in ids and ya_bien.id not in ids
    assert any(str(malo_real.id) in x or real.numero in x for x in listado.excluidos)
    texto = cb.texto_listado(listado)
    assert "Conteo" in texto and "sin línea" in texto.lower()
    with _carpeta() as carpeta:
        with pytest.raises(cb.ErrorCorreccion) as exc:        # la real y la de linea inexistente no son candidatas
            cb.aplicar_paso(db, "n10", base=_base(db), carpeta_respaldos=carpeta, excluidos=(real.numero,),
                            ids=[malo.id, malo_real.id, huerfano.id])
        assert f"id {malo_real.id}: es un documento real" in str(exc.value)
        assert f"id {huerfano.id}: está en el grupo de logs sin línea de pedido" in str(exc.value)
        assert os.listdir(carpeta) == []
        res = cb.aplicar_paso(db, "n10", base=_base(db), carpeta_respaldos=carpeta, excluidos=(real.numero,),
                              ids=[malo.id])
        assert res.cambiados == 1
        guardado = _leer_respaldo(carpeta, _respaldos(carpeta, "n10")[0])
        fila = guardado["tablas"]["activity_logs"][0]
        assert fila["id"] == malo.id and fila["entity_type"] == "PVEN" and fila["entity_id"] == linea.id
        assert set(fila) == {"id", "entity_type", "entity_id", "entity_numero"}
    _refrescar(db, malo, malo_real, huerfano, otra_accion)
    assert (malo.entity_type, malo.entity_id, malo.entity_numero) == ("VEN", ven.id, ven.numero)
    assert (malo_real.entity_type, malo_real.entity_id) == ("PVEN", linea_real.id)
    assert (huerfano.entity_type, huerfano.entity_id) == ("PVEN", 2_000_000_000)
    assert (otra_accion.entity_type, otra_accion.entity_id) == ("PVEN", linea.id)


# ─── h7: textos de la Actividad ───────────────────────────────────────────────────────────────────────────────

def test_h7_reutiliza_corregir_excluye_los_reales_y_respalda_en_json(db):
    cb = _cb()
    s = _sfx()
    cot = _cot(db, f"COT-T14{s}")
    cot_real = _cot(db, f"COT-T14R{s}")
    a = _log(db, "COT", cot.id, "CREATED", f"Cotizacion {cot.numero} creada", cot.numero)
    nota = _log(db, "COT", cot.id, "NOTE_ADDED", "Cotizacion revisada con el cliente", cot.numero)
    b = _log(db, "COT", cot.id, "ESTADO_CHANGED", "Estado cambiado a PENDIENTE_CONFIRMACION", cot.numero)
    a2 = _log(db, "COT", cot.id, "CREATED", f"Cotizacion {cot.numero} creada desde SC-T14", cot.numero)
    real = _log(db, "COT", cot_real.id, "CREATED", f"Cotizacion {cot_real.numero} creada", cot_real.numero)
    ids = [a.id, a2.id, nota.id, b.id, real.id]
    listado = cb.listar_paso(db, "h7", excluidos=(cot_real.numero,), solo_lectura=False, ids=ids)
    assert listado.datos["candidatas"] == 3                       # a, a2 y b; la nota y el real no
    assert any("Cotización" in str(f.get("despues", "")) for f in listado.seccion("ejemplos").filas)
    assert listado.datos["excluidas"] == 1
    assert any(cot_real.numero in x for x in listado.excluidos)       # los excluidos, con su numero de documento
    assert len(listado.seccion("tipos").filas) == 2              # dos TIPOS de correccion...
    assert listado.seccion("tipos").total == 3 and listado.conteo == 3   # ...pero el conteo es de FILAS
    assert any("PVEN" in n and "montos con coma" in n for n in listado.notas)
    with _carpeta() as carpeta:
        # la nota (texto de una persona) y la actividad real no son candidatas: aborta sin escribir y las nombra
        with pytest.raises(cb.ErrorCorreccion) as exc:
            cb.aplicar_paso(db, "h7", base=_base(db), carpeta_respaldos=carpeta, excluidos=(cot_real.numero,),
                            ids=ids, tabla_respaldo=TABLA_DE_RESPALDO_H7)
        assert f"id {nota.id}" in str(exc.value) and f"id {real.id}: es un documento real" in str(exc.value)
        assert os.listdir(carpeta) == []
        with pytest.raises(cb.ErrorCorreccion) as exc:                # h7 no acepta --numeros
            cb.aplicar_paso(db, "h7", base=_base(db), carpeta_respaldos=carpeta, numeros=[cot.numero])
        assert "solo acepta --ids" in str(exc.value)
        res = cb.aplicar_paso(db, "h7", base=_base(db), carpeta_respaldos=carpeta, excluidos=(cot_real.numero,),
                              ids=[a.id, a2.id, b.id], tabla_respaldo=TABLA_DE_RESPALDO_H7)
        assert res.cambiados == 3
        guardado = _leer_respaldo(carpeta, _respaldos(carpeta, "h7")[0])
        filas = {f["id"]: f for f in guardado["tablas"]["activity_logs"]}
        assert set(filas) == {a.id, a2.id, b.id} and filas[a.id]["description"] == f"Cotizacion {cot.numero} creada"
        assert set(filas[a.id]) == {"id", "description"}
        # segunda corrida: ya corregidas, dejan de ser candidatas (aborta nombrandolas); nada nuevo que respaldar
        with pytest.raises(cb.ErrorCorreccion):
            cb.aplicar_paso(db, "h7", base=_base(db), carpeta_respaldos=carpeta, excluidos=(cot_real.numero,),
                            ids=[a.id, a2.id, b.id], tabla_respaldo=TABLA_DE_RESPALDO_H7)
        assert len(_respaldos(carpeta, "h7")) == 1
    _refrescar(db, a, a2, nota, b, real)
    assert a.description == f"Cotización {cot.numero} creada"
    assert a2.description == f"Cotización {cot.numero} creada desde SC-T14"
    assert b.description == "Estado cambiado a Esperando confirmación del cliente"
    assert nota.description == "Cotizacion revisada con el cliente"
    assert real.description == f"Cotizacion {cot_real.numero} creada"
    en_respaldo = db.execute(text(f"SELECT count(*) FROM {TABLA_DE_RESPALDO_H7} WHERE id = ANY(:i)"),
                             {"i": [a.id, a2.id, nota.id, b.id, real.id]}).scalar()
    assert en_respaldo == 3


# ─── u9: leads del CRM sin el numero de la solicitud ──────────────────────────────────────────────────────────

def test_u9_completa_el_numero_de_la_solicitud_en_los_leads(db):
    from app.models.customers import Customer
    from app.models.sales import SalesOrder
    cb = _cb()
    s = _sfx()
    cliente = Customer(first_name="Cliente", last_name="T14", email=f"t14-{s}@test.nebulae")
    db.add(cliente)
    db.commit()

    def _lead(sc, descripcion, fuente="SC"):
        lead = SalesOrder(customer_id=cliente.id, status="DRAFT", canonical_customer_request_id=sc.id,
                          lead_source=fuente, lead_description=descripcion)
        db.add(lead)
        db.commit()
        db.refresh(lead)
        return lead

    sc = _sc(db, f"SC-T14{s}")
    sc_bien = _sc(db, f"SC-T14B{s}")
    sc_otra = _sc(db, f"SC-T14C{s}")
    sc_real = _sc(db, f"SC-T14R{s}")
    malo = _lead(sc, "SC creada:  - nota-secreta del asesor")
    bien = _lead(sc_bien, f"SC creada: {sc_bien.numero} - nota")
    otra_fuente = _lead(sc_otra, "SC creada:  - nota", fuente="WhatsApp")
    malo_real = _lead(sc_real, "SC creada:  - nota real")
    listado = cb.listar_paso(db, "u9", excluidos=(sc_real.numero,), solo_lectura=False)
    ids = [f["id"] for f in listado.seccion("leads").filas]
    assert malo.id in ids and bien.id not in ids and otra_fuente.id not in ids and malo_real.id not in ids
    assert any(sc_real.numero in x for x in listado.excluidos)
    assert "nota-secreta" not in cb.texto_listado(listado)        # el texto libre del lead no se imprime
    fila = next(f for f in listado.seccion("leads").filas if f["id"] == malo.id)
    assert fila["etapa"] == "Nuevo Lead"                          # la etapa legible, no 'DRAFT'
    with _carpeta() as carpeta:
        with pytest.raises(cb.ErrorCorreccion) as exc:        # el real y el que ya tiene numero no son candidatos
            cb.aplicar_paso(db, "u9", base=_base(db), carpeta_respaldos=carpeta, excluidos=(sc_real.numero,),
                            ids=[malo.id, malo_real.id, bien.id])
        assert f"id {malo_real.id}: es un documento real" in str(exc.value) and f"id {bien.id}" in str(exc.value)
        assert os.listdir(carpeta) == []
        res = cb.aplicar_paso(db, "u9", base=_base(db), carpeta_respaldos=carpeta, excluidos=(sc_real.numero,),
                              ids=[malo.id])
        assert res.cambiados == 1
        guardado = _leer_respaldo(carpeta, _respaldos(carpeta, "u9")[0])
        assert guardado["tablas"]["sales_orders"][0]["lead_description"] == "SC creada:  - nota-secreta del asesor"
        assert set(guardado["tablas"]["sales_orders"][0]) == {"id", "lead_description"}
    _refrescar(db, malo, bien, otra_fuente, malo_real)
    assert malo.lead_description == f"SC creada: {sc.numero} - nota-secreta del asesor"
    assert bien.lead_description == f"SC creada: {sc_bien.numero} - nota"
    assert otra_fuente.lead_description == "SC creada:  - nota" and malo_real.lead_description == "SC creada:  - nota real"


# ─── h42: montos con centavos ─────────────────────────────────────────────────────────────────────────────────

def test_h42_lista_los_montos_con_decimales_y_redondea_solo_los_que_no_tienen_pagos(db):
    cb = _cb()
    s = _sfx()
    sin_pagos = _ven(db, f"PVEN-T14A{s}", total_cop=Decimal("2786923.08"), saldo_cop=Decimal("2786923.08"),
                     subtotal_cop=Decimal("2786923.08"))
    con_pagos = _ven(db, f"PVEN-T14B{s}", total_cop=Decimal("1000000.50"), saldo_cop=Decimal("400000.50"),
                     anticipo_cop=600000)
    _pago(db, con_pagos, 600000, "Transferencia bancaria", referencia="BANCOL-2")
    entero = _ven(db, f"PVEN-T14C{s}", total_cop=1000000, saldo_cop=1000000)
    # sin pagos registrados pero con un saldo menor que el total (un anticipo que no esta en el libro): el saldo
    # redondeado debe conservar lo pagado (1000.50 - 400.20 = 600.30 -> 600), no redondearse solo (400).
    parcial = _ven(db, f"PVEN-T14P{s}", total_cop=Decimal("1000.50"), saldo_cop=Decimal("400.20"),
                   subtotal_cop=Decimal("1000.50"))
    cot = _cot(db, f"COT-T14D{s}", total_cop=Decimal("342461.54"), subtotal_cop=Decimal("342461.54"),
               anticipo_cop=Decimal("205476.92"))
    cot_de_pven_pagado = _cot(db, f"COT-T14E{s}", total_cop=Decimal("1000000.50"))
    ven_e = _ven(db, f"PVEN-T14E{s}", cot_de_pven_pagado, total_cop=Decimal("1000000.50"), saldo_cop=Decimal("0"),
                 anticipo_cop=Decimal("1000000.50"))
    _pago(db, ven_e, 1000000, "Efectivo", tipo="PAGO_TOTAL", referencia="REC-1")   # su COT hereda "tiene pagos"
    real = _ven(db, f"PVEN-T14R{s}", total_cop=Decimal("999.99"), saldo_cop=Decimal("999.99"))
    listado = cb.listar_paso(db, "h42", excluidos=(real.numero,), solo_lectura=False)
    filas = {f["numero"]: f for sec in ("pedidos", "cotizaciones") for f in listado.seccion(sec).filas}
    assert {sin_pagos.numero, con_pagos.numero, cot.numero, cot_de_pven_pagado.numero, parcial.numero} <= set(filas)
    assert entero.numero not in filas and real.numero not in filas
    assert filas[sin_pagos.numero]["pagos"] == "No" and filas[con_pagos.numero]["pagos"] == "Sí"
    assert filas[cot.numero]["pagos"] == "No" and filas[cot_de_pven_pagado.numero]["pagos"] == "Sí"
    assert any(real.numero in x for x in listado.excluidos)
    assert any("no lo recomienda" in n.lower() for n in listado.notas)
    assert any("NO toca las líneas, el JSON de productos ni las PXP" in n for n in listado.notas)
    with _carpeta() as carpeta:
        with pytest.raises(cb.ErrorCorreccion) as exc:        # la real y el que no tiene decimales no son candidatos
            cb.aplicar_paso(db, "h42", base=_base(db), carpeta_respaldos=carpeta, excluidos=(real.numero,),
                            numeros=[sin_pagos.numero, entero.numero, real.numero])
        assert entero.numero in str(exc.value) and f"{real.numero}: es un documento real" in str(exc.value)
        assert os.listdir(carpeta) == []
        res = cb.aplicar_paso(db, "h42", base=_base(db), carpeta_respaldos=carpeta, excluidos=(real.numero,),
                              numeros=[sin_pagos.numero, con_pagos.numero, cot.numero, cot_de_pven_pagado.numero,
                                       parcial.numero])
        assert res.cambiados == 3                                    # solo los que no tienen pagos
        assert any(con_pagos.numero in d for d in res.detalle)       # explica por que no toco el que tiene pagos
        guardado = _leer_respaldo(carpeta, _respaldos(carpeta, "h42")[0])
        assert {f["id"] for f in guardado["tablas"]["sale_orders"]} == {sin_pagos.id, parcial.id}
        assert [f["id"] for f in guardado["tablas"]["sales_quotations"]] == [cot.id]
        assert set(guardado["tablas"]["sale_orders"][0]) == {
            "id", "total_cop", "subtotal_cop", "anticipo_cop", "saldo_cop", "updated_at"}
        assert set(guardado["tablas"]["sales_quotations"][0]) == {
            "id", "total_cop", "subtotal_cop", "anticipo_cop", "updated_at"}
    _refrescar(db, sin_pagos, con_pagos, cot, cot_de_pven_pagado, real, parcial)
    assert (parcial.total_cop, parcial.saldo_cop) == (Decimal("1001"), Decimal("401"))    # conserva el pagado (600)
    assert (sin_pagos.total_cop, sin_pagos.saldo_cop, sin_pagos.subtotal_cop) == (
        Decimal("2786923"), Decimal("2786923"), Decimal("2786923"))
    assert (cot.total_cop, cot.subtotal_cop, cot.anticipo_cop) == (Decimal("342462"), Decimal("342462"), Decimal("205477"))
    assert con_pagos.total_cop == Decimal("1000000.50") and con_pagos.saldo_cop == Decimal("400000.50")
    assert cot_de_pven_pagado.total_cop == Decimal("1000000.50") and real.total_cop == Decimal("999.99")
    assert _logs(db, "VEN", sin_pagos.id, "UPDATED") and _logs(db, "COT", cot.id, "UPDATED")


def test_h42_sin_numeros_no_escribe_y_no_acepta_ids(db):
    cb = _cb()
    s = _sfx()
    ven = _ven(db, f"PVEN-T14{s}", total_cop=Decimal("500.50"), saldo_cop=Decimal("500.50"))
    with _carpeta() as carpeta:
        sin = cb.aplicar_paso(db, "h42", base=_base(db), carpeta_respaldos=carpeta)
        assert sin.cambiados == 0 and not sin.escribio and os.listdir(carpeta) == []
        assert any("--numeros" in d for d in sin.detalle)
        with pytest.raises(cb.ErrorCorreccion) as exc:
            cb.aplicar_paso(db, "h42", base=_base(db), carpeta_respaldos=carpeta, ids=[ven.id])
        assert "solo acepta --numeros" in str(exc.value) and os.listdir(carpeta) == []
    _refrescar(db, ven)
    assert ven.total_cop == Decimal("500.50")


# ─── seguridad del script ─────────────────────────────────────────────────────────────────────────────────────

def test_aplicar_con_una_base_distinta_aborta_sin_escribir_en_ningun_paso(db):
    cb = _cb()
    s = _sfx()
    cancelado = _ven(db, f"PVEN-T14{s}", estado="CANCELADO")
    pxp = _pxp(db, cancelado, f"PXP-T14{s}", 1000000, 0, 1000000)
    pago = _pago(db, cancelado, 600000)
    with _carpeta() as carpeta:
        for paso in cb.PASOS_QUE_ESCRIBEN:
            with pytest.raises(cb.ErrorCorreccion) as exc:
                cb.aplicar_paso(db, paso, base="otra_base_que_no_es", carpeta_respaldos=carpeta,
                                ids=[pxp.id], numeros=[cancelado.numero],
                                decisiones={cancelado.numero: {"opcion": "b"}})
            assert "otra_base_que_no_es" in str(exc.value) and _base(db) in str(exc.value)
        assert os.listdir(carpeta) == []
    _refrescar(db, pxp, pago)
    assert pxp.estado == "PENDIENTE" and pago.estado == "CONFIRMADO"


def test_un_fallo_a_medio_paso_revierte_todo_el_paso(db, monkeypatch):
    cb = _cb()
    s = _sfx()
    ven1 = _ven(db, f"PVEN-T14A{s}", estado="CANCELADO")
    ven2 = _ven(db, f"PVEN-T14B{s}", estado="CANCELADO")
    pxp1 = _pxp(db, ven1, f"PXP-T14A{s}", 1000000, 0, 1000000)
    pxp2 = _pxp(db, ven2, f"PXP-T14B{s}", 1000000, 0, 1000000)
    original = cb.anular_pxps_de_pedido
    llamadas = []

    def _falla_en_la_segunda(db_, so, autor, motivo=None):
        llamadas.append(so.id)
        if len(llamadas) == 2:
            raise RuntimeError("falla simulada")
        return original(db_, so, autor, motivo)

    monkeypatch.setattr(cb, "anular_pxps_de_pedido", _falla_en_la_segunda)
    with _carpeta() as carpeta:
        with pytest.raises(RuntimeError):
            cb.aplicar_paso(db, "h45", base=_base(db), carpeta_respaldos=carpeta, ids=[pxp1.id, pxp2.id])
        # el respaldo que se alcanzo a escribir NO queda como si fuera de algo aplicado: pasa a '-NO-APLICADO.json'
        assert _respaldos(carpeta, "h45") == []
        huerfanos = _no_aplicados(carpeta, "h45")
        assert len(huerfanos) == 1 and huerfanos[0].startswith(f"h45-{_base(db)}-")
        assert len(_leer_respaldo(carpeta, huerfanos[0])["tablas"]["payment_pendings"]) == 2
    _refrescar(db, pxp1, pxp2)
    assert len(llamadas) == 2
    assert pxp1.estado == "PENDIENTE" and pxp2.estado == "PENDIENTE"   # la primera tambien se revirtio


def test_la_cli_exige_base_para_aplicar_y_todo_solo_lista():
    cb = _cb()
    parser = cb.armar_parser()
    args = parser.parse_args(["n1", "--listar"])
    assert args.paso == "n1" and args.listar and not args.aplicar
    args = parser.parse_args(["h45", "--aplicar", "--base", "erp_test", "--ids", "3,4", "--numeros", "A-1,B-2"])
    assert args.aplicar and args.base == "erp_test" and args.ids == [3, 4] and args.numeros == ["A-1", "B-2"]
    assert parser.parse_args(["todo", "--listar"]).paso == "todo"
    for malo in (["n1", "--aplicar"],                       # falta --base
                 ["todo", "--aplicar", "--base", "erp_test"],  # todo solo lista
                 ["n1"],                                    # ni --listar ni --aplicar
                 ["n1", "--listar", "--aplicar", "--base", "erp_test"],
                 ["paso_que_no_existe", "--listar"]):
        with contextlib.redirect_stderr(io.StringIO()), pytest.raises(SystemExit):  # argparse imprime su uso
            parser.parse_args(malo)


def test_un_paso_con_una_columna_que_no_existe_dice_no_aplica_y_todo_sigue(db, monkeypatch):
    cb = _cb()
    requisitos = {paso: dict(tablas) for paso, tablas in cb.REQUISITOS.items()}
    requisitos["u9"]["sales_orders"] = list(requisitos["u9"]["sales_orders"]) + ["columna_que_no_existe_t14"]
    monkeypatch.setattr(cb, "REQUISITOS", requisitos)
    listado = cb.listar_paso(db, "u9", solo_lectura=False)
    assert listado.no_aplica and "columna_que_no_existe_t14" in listado.no_aplica
    assert "No aplica:" in cb.texto_listado(listado)
    # un paso que revienta no tumba a los demas
    def _revienta(db_, excl, **_):
        raise RuntimeError("explota")
    monkeypatch.setitem(cb.LISTADORES, "h45", _revienta)
    todos = cb.listar_todo(db, solo_lectura=False)
    assert [l.paso for l in todos] == list(BASE_COMPLETA)
    por_paso = {l.paso: l for l in todos}
    assert por_paso["u9"].no_aplica and por_paso["h45"].error and "explota" in por_paso["h45"].error
    assert por_paso["n1"].error is None and por_paso["h42"].error is None


def test_todo_listar_corre_los_12_pasos_en_orden_contra_el_esquema_real(db):
    cb = _cb()
    todos = cb.listar_todo(db, solo_lectura=False)
    assert [l.paso for l in todos] == list(BASE_COMPLETA)
    for l in todos:
        assert l.error is None, (l.paso, l.error)
        assert l.titulo and l.que_es and l.que_haria
        texto = cb.texto_listado(l, indice=BASE_COMPLETA.index(l.paso) + 1, total=12)
        assert "Excluidos (documentos reales)" in texto or l.no_aplica
    resumen = cb.texto_resumen(todos)
    assert "n1" in resumen and "h42" in resumen


def test_listar_corre_en_una_transaccion_de_solo_lectura_y_no_deja_escribir(db):
    # Va al final del modulo en espiritu: SET TRANSACTION READ ONLY dura lo que queda de la transaccion de la prueba.
    cb = _cb()
    from sqlalchemy.exc import DBAPIError
    cb.iniciar_solo_lectura(db)
    assert db.execute(text("SHOW transaction_read_only")).scalar() == "on"
    with pytest.raises(DBAPIError):
        db.execute(text("UPDATE activity_logs SET description = description WHERE id = -1"))


# ─── ronda 1 del controlador ──────────────────────────────────────────────────────────────────────────────────

def test_un_id_o_numero_fuera_de_la_lista_aborta_el_paso_sin_escribir_y_lo_nombra(db):
    """Uniforme en todos los pasos que escriben: lo pedido que no es candidato aborta (antes unos lo ignoraban en
    silencio y otros lo avisaban sin abortar)."""
    cb = _cb()
    s = _sfx()
    ven = _ven(db, f"PVEN-T14{s}", estado="CANCELADO")
    pxp = _pxp(db, ven, f"PXP-T14{s}", 1000000, 0, 1000000)
    por_ids = ("h44", "h45", "h46", "h36", "n4", "n10", "u9", "h7", "n1")
    por_numeros = ("n5", "h42", "h44", "h45", "h46", "h36", "n4", "n10", "u9", "n1")
    with _carpeta() as carpeta:
        for paso in por_ids:
            bobo = 2_000_000_000
            with pytest.raises(cb.ErrorCorreccion) as exc:
                cb.aplicar_paso(db, paso, base=_base(db), carpeta_respaldos=carpeta, ids=[bobo],
                                decisiones={ven.numero: {"opcion": "b"}})
            assert f"id {bobo}" in str(exc.value) and "no se escribió nada" in str(exc.value), paso
        for paso in por_numeros:
            with pytest.raises(cb.ErrorCorreccion) as exc:
                cb.aplicar_paso(db, paso, base=_base(db), carpeta_respaldos=carpeta, numeros=["DOC-NO-EXISTE"],
                                decisiones={ven.numero: {"opcion": "b"}})
            assert "DOC-NO-EXISTE" in str(exc.value) and "no se escribió nada" in str(exc.value), paso
        assert os.listdir(carpeta) == []
    _refrescar(db, pxp)
    assert pxp.estado == "PENDIENTE"


def test_el_respaldo_es_minimo_y_no_guarda_datos_personales_del_cliente(db, monkeypatch):
    cb = _cb()
    e = _escenario_n1(db)                                  # sus PVEN traen customer_name, correo y telefono
    with _carpeta() as carpeta:
        cb.aplicar_paso(db, "n1", base=_base(db), carpeta_respaldos=carpeta, excluidos=(e["real"].numero,),
                        decisiones={e["ven"].numero: {"opcion": "b"}})
        nombre = _respaldos(carpeta, "n1")[0]
        with open(os.path.join(carpeta, nombre), encoding="utf-8") as f:
            crudo = f.read()
        for prohibido in ("customer_name", "customer_email", "customer_phone", "Cliente T14",
                          "cliente-t14@test.com", "3000000000"):
            assert prohibido not in crudo
        guardado = json.loads(crudo)
        assert guardado["columnas"]["sale_orders"] == ["id", "anticipo_cop", "saldo_cop", "updated_at"]
        assert guardado["columnas"]["sale_order_payments"] == [
            "id", "estado", "metodo_pago", "referencia_bancaria", "notes"]
        # el respaldo solo sabe de las tablas y columnas de su paso, y nunca de columnas del cliente
        with pytest.raises(cb.ErrorCorreccion):
            cb.escribir_respaldo(db, carpeta, "n1", "x", {"customer_requests": [1]})
        with pytest.raises(cb.ErrorCorreccion):
            cb.escribir_respaldo(db, carpeta, "paso_que_no_existe", "x", {"sale_orders": [1]})
        columnas = {paso: {t: list(c) for t, c in tablas.items()} for paso, tablas in cb.RESPALDO_COLUMNAS.items()}
        columnas["n1"]["sale_orders"].append("customer_name")
        monkeypatch.setattr(cb, "RESPALDO_COLUMNAS", columnas)
        with pytest.raises(cb.ErrorCorreccion):
            cb.escribir_respaldo(db, carpeta, "n1", "x", {"sale_orders": [e["ven"].id]})
    monkeypatch.undo()
    for paso, tablas in cb.RESPALDO_COLUMNAS.items():
        for tabla, cols in tablas.items():
            assert not any(c.startswith("customer_") for c in cols), (paso, tabla)


def test_listar_paso_en_solo_lectura_pone_el_set_antes_de_la_primera_consulta_y_termina_en_rollback(db, contador_sql):
    from sqlalchemy import event
    cb = _cb()
    rollbacks = []
    event.listen(db, "after_soft_rollback", lambda sesion, previa: rollbacks.append(1))
    contador_sql.reset()
    cb.listar_paso(db, "h7", solo_lectura=True, ids=[2_000_000_000])
    sentencias = [x.strip() for x in contador_sql.sentencias]
    assert sentencias[0].upper() == "SET TRANSACTION READ ONLY"           # lo primero que corre el listado
    assert sentencias.count("SET TRANSACTION READ ONLY") >= 2              # y h7 vuelve a entrar tras el rollback de corregir
    assert not any(x.upper().startswith(("INSERT", "UPDATE", "DELETE", "CREATE", "DROP", "ALTER")) for x in sentencias)
    assert contador_sql.commits == 0 and rollbacks                         # termina en rollback, nunca en commit


def test_listar_paso_sin_solo_lectura_no_toca_la_transaccion_de_la_prueba(db, contador_sql):
    cb = _cb()
    contador_sql.reset()
    cb.listar_paso(db, "n1", solo_lectura=False)
    assert "SET TRANSACTION READ ONLY" not in [x.strip() for x in contador_sql.sentencias]


def test_main_con_una_base_distinta_sale_con_codigo_2_sin_escribir(db):
    cb = _cb()
    s = _sfx()
    cancelado = _ven(db, f"PVEN-T14{s}", estado="CANCELADO")
    pxp = _pxp(db, cancelado, f"PXP-T14{s}", 1000000, 0, 1000000)
    salida, error = io.StringIO(), io.StringIO()
    with _carpeta() as carpeta, contextlib.redirect_stdout(salida), contextlib.redirect_stderr(error):
        codigo = cb.main(["h45", "--aplicar", "--base", "otra_base_que_no_es", "--ids", str(pxp.id),
                          "--respaldos", carpeta])
        assert os.listdir(carpeta) == []
    assert codigo == 2
    assert "ABORTADO" in error.getvalue() and "otra_base_que_no_es" in error.getvalue()
    assert "SELECT current_database()" in salida.getvalue()                 # imprime la base antes de decidir
    _refrescar(db, pxp)
    assert pxp.estado == "PENDIENTE"


def test_las_decisiones_se_leen_con_bom_y_un_archivo_malo_aborta_sin_traceback(db):
    cb = _cb()
    with _carpeta() as carpeta:
        con_bom = os.path.join(carpeta, "con_bom.json")
        with open(con_bom, "w", encoding="utf-8-sig") as f:             # lo que guarda el Bloc de notas de Windows
            f.write('{"PVEN-1": {"opcion": "b"}}')
        assert cb._cargar_decisiones(con_bom) == {"PVEN-1": {"opcion": "b"}}
        roto = os.path.join(carpeta, "roto.json")
        with open(roto, "w", encoding="utf-8") as f:
            f.write("{no es json")
        lista = os.path.join(carpeta, "lista.json")
        with open(lista, "w", encoding="utf-8") as f:
            f.write("[1, 2]")
        for ruta in (roto, os.path.join(carpeta, "no_existe.json"), lista):
            with pytest.raises(cb.ErrorCorreccion):
                cb._cargar_decisiones(ruta)
            salida, error = io.StringIO(), io.StringIO()
            with contextlib.redirect_stdout(salida), contextlib.redirect_stderr(error):
                codigo = cb.main(["n1", "--aplicar", "--base", _base(db), "--decisiones", ruta,
                                  "--respaldos", carpeta])
            assert codigo == 2 and "ABORTADO" in error.getvalue() and "Traceback" not in error.getvalue()
        assert [f for f in os.listdir(carpeta) if f.startswith("n1-")] == []


def test_la_hora_del_script_no_usa_utcnow_ni_avisa(db):
    from pathlib import Path
    cb = _cb()
    with warnings.catch_warnings():
        warnings.simplefilter("error")               # cualquier DeprecationWarning (datetime.utcnow) rompe la prueba
        ctx = cb.Contexto(db=db, base="x", carpeta=Path("."), excl=cb.Excluidos())
        ahora = cb._ahora_utc()
    assert ahora.tzinfo is None and ctx.ahora.tzinfo is None             # UTC naive, el estandar de la app
    assert abs((datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) - ahora).total_seconds()) < 5
