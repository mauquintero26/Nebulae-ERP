"""
Test suite for GoodsReceipt dias_retraso calculation.

Tests that Recepciones expose dias_retraso by comparing the actual
fecha_recepcion against the linked PurchaseOrderFull's fecha_entrega_estimada,
with a 1-day tolerance.
"""
from datetime import datetime, timedelta
import pytest


def test_recepcion_a_tiempo_no_marca_retraso(client, db_session, auth_headers):
    """
    Test that a GoodsReceipt received within tolerance (1 day) of the promised date
    shows dias_retraso = None.
    """
    from app.models.erp_documents import PurchaseOrderFull, GoodsReceipt

    pec = PurchaseOrderFull(
        numero="PEC-TEST001",
        supplier_name="Proveedor Prueba",
        estado="RECIBIDO",
        fecha_entrega_estimada=datetime.utcnow() - timedelta(days=1),
        tracking_stages=[],
        productos=[]
    )
    db_session.add(pec)
    db_session.commit()
    db_session.refresh(pec)

    gr = GoodsReceipt(
        numero="ENINV-TEST001",
        pec_id=pec.id,
        pec_numero=pec.numero,
        fecha_recepcion=datetime.utcnow(),  # llegó el mismo día + tolerancia
        productos=[]
    )
    db_session.add(gr)
    db_session.commit()
    db_session.refresh(gr)

    resp = client.get(f"/api/v1/compras/recepciones/{gr.id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["data"]["dias_retraso"] is None


def test_recepcion_tardia_marca_dias_retraso(client, db_session, auth_headers):
    """
    Test that a GoodsReceipt received late (beyond tolerance) shows the correct
    dias_retraso value (actual delay minus 1-day tolerance).
    """
    from app.models.erp_documents import PurchaseOrderFull, GoodsReceipt

    pec = PurchaseOrderFull(
        numero="PEC-TEST002",
        supplier_name="Proveedor Prueba",
        estado="RECIBIDO",
        fecha_entrega_estimada=datetime.utcnow() - timedelta(days=5),
        tracking_stages=[],
        productos=[]
    )
    db_session.add(pec)
    db_session.commit()
    db_session.refresh(pec)

    gr = GoodsReceipt(
        numero="ENINV-TEST002",
        pec_id=pec.id,
        pec_numero=pec.numero,
        fecha_recepcion=datetime.utcnow(),  # 5 días después del estimado (+1 tolerancia = 4 de retraso real)
        productos=[]
    )
    db_session.add(gr)
    db_session.commit()
    db_session.refresh(gr)

    resp = client.get(f"/api/v1/compras/recepciones/{gr.id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["data"]["dias_retraso"] == 4
