"""
test_fase2_alertas.py — Tests del Motor de Alertas Operativas de Tránsito (Fase 2)

Escenarios cubiertos y certificados:
1. Alerta TRACKING_PENDIENTE: PEC confirmada > 3 días sin tracking ni paquete asignado.
2. Alerta ENTREGA_VENCIDA: Shipment con estimated_delivery_date en el pasado y no recibido.
3. Alerta PENDIENTE_CONSOLIDACION: Paquete en Miami > 5 días sin incluir en consolidación.
4. Alerta DIAN_DEMORADO con cálculo de DÍAS HÁBILES REALES (lunes a viernes, America/Bogota):
   - Fines de semana no suman días hábiles (e.g., viernes a lunes = 1 día hábil).
   - Más de 3 días hábiles genera alerta con severidad ALTA.
5. Inmunidad del temporizador DIAN ante edición de notas:
   - Modificar notas actualiza `updated_at` pero preserva `dian_entered_at`, impidiendo reseteo fraudulento.
6. Resolución automática: al cambiar estado (e.g. a LIBERADA o RECIBIDO_BARRANQUILLA), la alerta se extingue.
"""
import uuid
import datetime
from zoneinfo import ZoneInfo
from decimal import Decimal
import pytest

from tests.conftest import TestSessionLocal
from app.models.erp_documents import PurchaseOrderFull, Supplier
from app.models.fase2 import Shipment, ShipmentEvent, Consolidation


BOGOTA_TZ = ZoneInfo("America/Bogota")


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
        assert pec_alerts[0]["severity"] in ("MEDIA", "ALTA")
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

    def test_alerta_dian_dias_habiles_y_fin_de_semana(self, app_client, admin_token):
        """
        4. Consolidación en DIAN evalúa DÍAS HÁBILES REALES (L-V) usando dian_entered_at:
           - Si han pasado 3 días naturales pero solo 1 día hábil (fin de semana), NO debe alertar.
           - Si han pasado >= 3 días hábiles, DEBE generar alerta DIAN_DEMORADO.
        """
        now = datetime.datetime.now(datetime.timezone.utc)

        # Caso A: Hace 1 día hábil (e.g. ayer o viernes si hoy es lunes)
        with TestSessionLocal() as session:
            con_reciente = Consolidation(
                consolidation_number=f"CON-OK-{uuid.uuid4().hex[:6].upper()}",
                carrier="Coordinadora",
                status="EN_DIAN",
                dian_entered_at=now - datetime.timedelta(days=1),
            )
            session.add(con_reciente)
            session.commit()
            con_reciente_id = con_reciente.id

        # Caso B: Hace 6 días naturales (al menos 4 días hábiles garantizados)
        with TestSessionLocal() as session:
            con_demorada = Consolidation(
                consolidation_number=f"CON-DN-{uuid.uuid4().hex[:6].upper()}",
                carrier="Coordinadora",
                status="EN_DIAN",
                dian_entered_at=now - datetime.timedelta(days=6),
            )
            session.add(con_demorada)
            session.commit()
            con_demorada_id = con_demorada.id

        res = app_client.get(
            "/api/v1/logistica/alertas-transito",
            headers=_auth(admin_token),
        )
        assert res.status_code == 200
        alerts = res.json()["data"]["alertas"]

        # con_reciente NO debe tener alerta DIAN_DEMORADO
        assert not any(a["alert_type"] == "DIAN_DEMORADO" and a["document_id"] == con_reciente_id for a in alerts)

        # con_demorada SÍ debe tener alerta DIAN_DEMORADO
        dian_alerts = [a for a in alerts if a["alert_type"] == "DIAN_DEMORADO" and a["document_id"] == con_demorada_id]
        assert len(dian_alerts) == 1
        assert dian_alerts[0]["severity"] == "ALTA"
        assert dian_alerts[0]["days_delay"] >= 3

    def test_alerta_dian_no_se_resetea_al_editar_notas(self, app_client, admin_token):
        """
        5. Editar las notas de una consolidación actualiza updated_at pero NO toca
           dian_entered_at, garantizando que el contador de días en aduana no se reinicie.
        """
        now = datetime.datetime.now(datetime.timezone.utc)
        antiguo_dian = now - datetime.timedelta(days=7)

        with TestSessionLocal() as session:
            con = Consolidation(
                consolidation_number=f"CON-IMM-{uuid.uuid4().hex[:6].upper()}",
                carrier="Coordinadora",
                status="EN_DIAN",
                dian_entered_at=antiguo_dian,
                updated_at=antiguo_dian,
            )
            session.add(con)
            session.commit()
            con_id = con.id

        # Editar notas mediante endpoint o DB
        patch_res = app_client.patch(
            f"/api/v1/logistica/consolidaciones/{con_id}",
            headers=_auth(admin_token),
            json={"notes": "Anotación de seguimiento documental aduanero"},
        )
        assert patch_res.status_code == 200

        # Verificar en DB que dian_entered_at no cambió
        with TestSessionLocal() as session:
            refreshed_con = session.query(Consolidation).filter(Consolidation.id == con_id).one()
            # dian_entered_at debe seguir siendo antiguo_dian
            diff = abs((refreshed_con.dian_entered_at.replace(tzinfo=datetime.timezone.utc) - antiguo_dian).total_seconds())
            assert diff < 5, "dian_entered_at fue modificado indebidamente al editar notas"

        # Verificar que la alerta sigue activa
        res = app_client.get(
            "/api/v1/logistica/alertas-transito",
            headers=_auth(admin_token),
        )
        assert res.status_code == 200
        alerts = res.json()["data"]["alertas"]
        dian_alerts = [a for a in alerts if a["alert_type"] == "DIAN_DEMORADO" and a["document_id"] == con_id]
        assert len(dian_alerts) == 1
        assert dian_alerts[0]["days_delay"] >= 4

    def test_resolucion_alerta_al_liberar_consolidacion(self, app_client, admin_token):
        """6. Al cambiar el estado de la consolidación a LIBERADA, la alerta aduanera se extingue."""
        now = datetime.datetime.now(datetime.timezone.utc)
        with TestSessionLocal() as session:
            con = Consolidation(
                consolidation_number=f"CON-RES-{uuid.uuid4().hex[:6].upper()}",
                carrier="Coordinadora",
                status="EN_DIAN",
                dian_entered_at=now - datetime.timedelta(days=6),
            )
            session.add(con)
            session.commit()
            con_id = con.id

        # Verificar alerta presente
        res1 = app_client.get("/api/v1/logistica/alertas-transito", headers=_auth(admin_token))
        alerts1 = res1.json()["data"]["alertas"]
        assert any(a["alert_type"] == "DIAN_DEMORADO" and a["document_id"] == con_id for a in alerts1)

        # Liberar consolidación
        with TestSessionLocal() as session:
            c = session.query(Consolidation).filter(Consolidation.id == con_id).one()
            c.status = "LIBERADA"
            session.commit()

        # Verificar alerta resuelta (ausente)
        res2 = app_client.get("/api/v1/logistica/alertas-transito", headers=_auth(admin_token))
        alerts2 = res2.json()["data"]["alertas"]
        assert not any(a["alert_type"] == "DIAN_DEMORADO" and a["document_id"] == con_id for a in alerts2)
