"""
Test suite for GoodsReceipt dias_retraso calculation.

Tests that Recepciones expose dias_retraso by comparing the actual
fecha_recepcion against the linked PurchaseOrderFull's fecha_entrega_estimada,
with a 1-day tolerance.
"""
from datetime import datetime, timedelta
import pytest


def auth(token):
    """Helper to create auth headers."""
    return {"Authorization": f"Bearer {token}"}


def test_recepcion_a_tiempo_no_marca_retraso(app_client, db, admin_token):
    """
    Test that a GoodsReceipt received within tolerance (1 day) of the promised date
    shows dias_retraso = None.
    """
    from app.models.erp_documents import PurchaseOrderFull, GoodsReceipt

    pec = PurchaseOrderFull(
        numero="PEC-TEST001",
        supplier_name="Proveedor Prueba",
        estado="RECIBIDO",
        fecha_entrega_estimada=datetime(2026, 11, 3, 15, 0),   # B4 T24 (FINAL-m6): instantes fijos, sin depender de la hora
        tracking_stages=[],
        productos=[]
    )
    db.add(pec)
    db.commit()
    db.refresh(pec)

    gr = GoodsReceipt(
        numero="ENINV-TEST001",
        pec_id=pec.id,
        pec_numero=pec.numero,
        fecha_recepcion=datetime(2026, 11, 4, 15, 0),  # llegó el día siguiente: dentro de la tolerancia
        productos=[]
    )
    db.add(gr)
    db.commit()
    db.refresh(gr)

    resp = app_client.get(f"/api/v1/compras/recepciones/{gr.id}", headers=auth(admin_token))
    assert resp.status_code == 200
    assert resp.json()["data"]["dias_retraso"] is None


def test_recepcion_tardia_marca_dias_retraso(app_client, db, admin_token):
    """
    Test that a GoodsReceipt received late (beyond tolerance) shows the correct
    dias_retraso value (actual delay minus 1-day tolerance).
    """
    from app.models.erp_documents import PurchaseOrderFull, GoodsReceipt

    pec = PurchaseOrderFull(
        numero="PEC-TEST002",
        supplier_name="Proveedor Prueba",
        estado="RECIBIDO",
        fecha_entrega_estimada=datetime(2026, 11, 3, 15, 0),
        tracking_stages=[],
        productos=[]
    )
    db.add(pec)
    db.commit()
    db.refresh(pec)

    gr = GoodsReceipt(
        numero="ENINV-TEST002",
        pec_id=pec.id,
        pec_numero=pec.numero,
        fecha_recepcion=datetime(2026, 11, 8, 15, 0),  # 5 días después del estimado (+1 tolerancia = 4 de retraso real)
        productos=[]
    )
    db.add(gr)
    db.commit()
    db.refresh(gr)

    resp = app_client.get(f"/api/v1/compras/recepciones/{gr.id}", headers=auth(admin_token))
    assert resp.status_code == 200
    assert resp.json()["data"]["dias_retraso"] == 4


def test_el_dia_de_la_recepcion_es_el_de_colombia(app_client, db, admin_token):
    """B4 T24 (FINAL-m6): una recepción a las 00:30 UTC del 9 de noviembre es el 8 en Colombia (19:30): con lo prometido el
    3 (+1 de tolerancia) son 4 días de retraso, no 5. La fecha prometida sigue con .date() (RP40)."""
    from app.models.erp_documents import PurchaseOrderFull, GoodsReceipt
    import uuid
    s = uuid.uuid4().hex[:8].upper()
    pec = PurchaseOrderFull(numero=f"PEC-M6{s}", supplier_name="Proveedor Prueba", estado="RECIBIDO",
                            fecha_entrega_estimada=datetime(2026, 11, 3, 15, 0), tracking_stages=[], productos=[])
    db.add(pec)
    db.commit()
    for cuando, esperado in ((datetime(2026, 11, 9, 0, 30), 4), (datetime(2026, 11, 9, 5, 0), 5),
                             (datetime(2026, 11, 5, 4, 59), None)):
        gr = GoodsReceipt(numero=f"ENINV-M6{s[:4]}{cuando:%d%H%M}", pec_id=pec.id, pec_numero=pec.numero,
                          fecha_recepcion=cuando, productos=[])
        db.add(gr)
        db.commit()
        resp = app_client.get(f"/api/v1/compras/recepciones/{gr.id}", headers=auth(admin_token))
        assert resp.status_code == 200 and resp.json()["data"]["dias_retraso"] == esperado, (cuando, resp.text)
