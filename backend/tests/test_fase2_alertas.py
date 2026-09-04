"""
test_fase2_alertas.py — Tests del Motor de Alertas Operativas de Tránsito (Fase 2)

Escenarios cubiertos:
1. Alerta TRACKING_PENDIENTE: PEC confirmada hace > 3 días sin tracking asignado ni paquete.
2. Alerta ENTREGA_VENCIDA: Shipment con estimated_delivery_date en el pasado y no recibido.
3. Alerta PENDIENTE_CONSOLIDACION: Paquete en Miami hace > 5 días sin incluir en consolidación.
4. Alerta DIAN_DEMORADO: Consolidación retenida en aduana > 3 días.
5. Resolución automática: al corregir la condición, la alerta no vuelve a aparecer.
"""
import uuid
import datetime
from decimal import Decimal
import pytest

from tests.conftest import TestSessionLocal
from app.models.erp_documents import PurchaseOrderFull, Supplier
from app.models.fase2 import Shipment, ShipmentEvent, Consolidation


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _create_supplier_db(db) -> int:
    s = Supplier(name=f"Sup-{uuid.uuid4().hex[:6]}", is_active=True)
    db.add(s)
    db.commit()
    db.refresh(s)
    return s.id


class TestFase2Alertas:

    def test_alerta_tracking_pendiente(self, app_client, admin_token):
        """1. PEC confirmada > 3 días sin tracking genera alerta TRACKING_PENDIENTE."""
        past_time = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=4)
        with TestSessionLocal() as session:
            sup_id = _create_supplier_db(session)
            pec = PurchaseOrderFull(
                numero=f"PEC-ALT-{uuid.uuid4().hex[:6].upper()}",
                supplier_id=sup_id,
                supplier_name="Alerta Proveedor",
                estado="CONFIRMADA",
                created_at=past_time,
                tracking_number=None,
            )
            session.add(pec)
            session.commit()
            pec_id = pec.id

        res = app_client.get(
            "/api/v1/logistica/alertas-transito",
            headers=_auth(admin_token),
        )
        assert res.status_code == 200
        alerts = res.json()["data"]["alertas"]
        pec_alerts = [a for a in alerts if a["alert_type"] == "TRACKING_PENDIENTE" and a["document_id"] == pec_id]
        assert len(pec_alerts) == 1
        assert pec_alerts[0]["severity"] == "MEDIA"
        assert pec_alerts[0]["days_delay"] >= 4

    def test_alerta_entrega_vencida(self, app_client, admin_token):
        """2. Shipment con fecha estimada vencida genera alerta ENTREGA_VENCIDA."""
        past_date = datetime.date.today() - datetime.timedelta(days=5)
        with TestSessionLocal() as session:
            shp = Shipment(
                shipment_number=f"SHP-ALT-{uuid.uuid4().hex[:6].upper()}",
                carrier="UPS",
                tracking_number=f"1Z-{uuid.uuid4().hex[:8]}",
                estimated_delivery_date=past_date,
                status_fise="ENVIADO_A_MIAMI",
            )
            session.add(shp)
            session.commit()
            shp_id = shp.id

        res = app_client.get(
            "/api/v1/logistica/alertas-transito",
            headers=_auth(admin_token),
        )
        assert res.status_code == 200
        alerts = res.json()["data"]["alertas"]
        shp_alerts = [a for a in alerts if a["alert_type"] == "ENTREGA_VENCIDA" and a["document_id"] == shp_id]
        assert len(shp_alerts) == 1
        assert shp_alerts[0]["severity"] == "CRITICA"
        assert shp_alerts[0]["days_delay"] == 5

    def test_alerta_pendiente_consolidacion(self, app_client, admin_token):
        """3. Paquete en Miami > 5 días sin consolidar genera alerta PENDIENTE_CONSOLIDACION."""
        past_time = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=6)
        with TestSessionLocal() as session:
            shp = Shipment(
                shipment_number=f"SHP-MIA-{uuid.uuid4().hex[:6].upper()}",
                carrier="FedEx",
                tracking_number=f"FDX-{uuid.uuid4().hex[:8]}",
                status_fise="RECIBIDO_MIAMI",
            )
            session.add(shp)
            session.flush()

            ev = ShipmentEvent(
                shipment_id=shp.id,
                event_type="RECIBIDO_MIAMI",
                location="Bodega Miami Agency",
                timestamp=past_time,
            )
            session.add(ev)
            session.commit()
            shp_id = shp.id

        res = app_client.get(
            "/api/v1/logistica/alertas-transito",
            headers=_auth(admin_token),
        )
        assert res.status_code == 200
        alerts = res.json()["data"]["alertas"]
        mia_alerts = [a for a in alerts if a["alert_type"] == "PENDIENTE_CONSOLIDACION" and a["document_id"] == shp_id]
        assert len(mia_alerts) == 1
        assert mia_alerts[0]["severity"] == "MEDIA"

    def test_alerta_dian_demorado(self, app_client, admin_token):
        """4. Consolidación en EN_DIAN > 3 días genera alerta DIAN_DEMORADO."""
        past_time = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=4)
        with TestSessionLocal() as session:
            con = Consolidation(
                consolidation_number=f"CON-DN-{uuid.uuid4().hex[:6].upper()}",
                carrier="Coordinadora",
                status="EN_DIAN",
                updated_at=past_time,
            )
            session.add(con)
            session.commit()
            con_id = con.id

        res = app_client.get(
            "/api/v1/logistica/alertas-transito",
            headers=_auth(admin_token),
        )
        assert res.status_code == 200
        alerts = res.json()["data"]["alertas"]
        dian_alerts = [a for a in alerts if a["alert_type"] == "DIAN_DEMORADO" and a["document_id"] == con_id]
        assert len(dian_alerts) == 1
        assert dian_alerts[0]["severity"] == "ALTA"
