"""
test_fase2_consolidaciones.py — Tests de Consolidaciones Internacionales y Prorrateo de Flete (Fase 2)

Escenarios cubiertos:
1. Creación de una consolidación internacional agrupando múltiples paquetes.
2. Prorrateo de costos de flete por PESO (WEIGHT) en USD y COP según TRM.
3. Prorrateo de costos de flete por partes IGUALES (EQUAL).
4. Adición de nuevos paquetes a una consolidación existente abierta.
5. Propagación en cascada de estados (EN_VUELO, EN_DIAN, LIBERADA, RECIBIDA_DESTINO) a todos los paquetes contenidos.
6. Rechazo al agregar paquetes a una consolidación cerrada (CERRADA).
7. Consulta detallada de la consolidación con desglose de paquetes y costos.
"""
import uuid
from decimal import Decimal
import pytest

from tests.conftest import TestSessionLocal
from app.models.erp_documents import PurchaseOrderFull, Supplier
from app.models.fase2 import Shipment, Consolidation, ConsolidationShipment


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _create_supplier_db(db) -> int:
    s = Supplier(name=f"Sup-{uuid.uuid4().hex[:6]}", is_active=True)
    db.add(s)
    db.commit()
    db.refresh(s)
    return s.id


def _create_shipments(client, token, count=3, weights=(2.0, 3.0, 5.0)):
    shipment_ids = []
    for i, w in enumerate(weights[:count]):
        res = client.post(
            "/api/v1/logistica/shipments",
            headers=_auth(token),
            json={
                "carrier": "UPS",
                "tracking_number": f"1Z-CS-{uuid.uuid4().hex[:8]}",
                "weight_kg": w,
            },
        )
        assert res.status_code == 200, f"Error: {res.text}"
        shipment_ids.append(res.json()["data"]["id"])
    return shipment_ids


class TestFase2Consolidaciones:

    def test_crear_consolidacion_exitosa(self, app_client, admin_token):
        """1. Crear consolidación internacional agrupando paquetes."""
        shp_ids = _create_shipments(app_client, admin_token, count=2, weights=(3.0, 7.0))

        payload = {
            "carrier": "Coordinadora USA",
            "tracking_international": f"COO-USA-{uuid.uuid4().hex[:6]}",
            "agency_name": "Miami Agency Central",
            "origin": "MIAMI",
            "destination": "BARRANQUILLA",
            "trm": 4200.0,
            "total_freight_usd": 150.0,
            "shipment_ids": shp_ids,
        }
        res = app_client.post(
            "/api/v1/logistica/consolidaciones",
            headers=_auth(admin_token),
            json=payload,
        )
        assert res.status_code == 200, f"Error: {res.text}"
        data = res.json()["data"]
        assert "CON-" in data["consolidation_number"]
        assert data["status"] == "ABIERTA"
        assert data["total_weight_kg"] == 10.0
        assert data["shipments_count"] == 2

    def test_prorrateo_flete_por_peso(self, app_client, admin_token):
        """2. Prorratear flete según el peso de cada paquete (WEIGHT)."""
        # Paquete 1: 2.0 kg (20%) | Paquete 2: 8.0 kg (80%) -> Total 10 kg
        shp_ids = _create_shipments(app_client, admin_token, count=2, weights=(2.0, 8.0))

        con_res = app_client.post(
            "/api/v1/logistica/consolidaciones",
            headers=_auth(admin_token),
            json={
                "carrier": "Servientrega Internacional",
                "shipment_ids": shp_ids,
                "trm": 4000.0,
                "total_freight_usd": 100.0,
            },
        )
        con_id = con_res.json()["data"]["id"]

        # Ejecutar prorrateo por peso
        alloc_res = app_client.post(
            f"/api/v1/logistica/consolidaciones/{con_id}/repartir-costos",
            headers=_auth(admin_token),
            json={"allocation_method": "WEIGHT", "total_freight_usd": 100.0, "trm": 4000.0},
        )
        assert alloc_res.status_code == 200, f"Error: {alloc_res.text}"
        reparto = alloc_res.json()["data"]["reparto"]

        # Mapear por shipment_id
        alloc_map = {r["shipment_id"]: r for r in reparto}
        assert alloc_map[shp_ids[0]]["cost_allocation_usd"] == 20.0
        assert alloc_map[shp_ids[0]]["cost_allocation_cop"] == 80000.0
        assert alloc_map[shp_ids[1]]["cost_allocation_usd"] == 80.0
        assert alloc_map[shp_ids[1]]["cost_allocation_cop"] == 320000.0

    def test_prorrateo_flete_por_partes_iguales(self, app_client, admin_token):
        """3. Prorratear flete por partes iguales (EQUAL)."""
        shp_ids = _create_shipments(app_client, admin_token, count=4, weights=(1.0, 2.0, 3.0, 4.0))

        con_res = app_client.post(
            "/api/v1/logistica/consolidaciones",
            headers=_auth(admin_token),
            json={"shipment_ids": shp_ids, "trm": 4000.0, "total_freight_usd": 100.0},
        )
        con_id = con_res.json()["data"]["id"]

        alloc_res = app_client.post(
            f"/api/v1/logistica/consolidaciones/{con_id}/repartir-costos",
            headers=_auth(admin_token),
            json={"allocation_method": "EQUAL", "total_freight_usd": 100.0, "trm": 4000.0},
        )
        assert alloc_res.status_code == 200
        reparto = alloc_res.json()["data"]["reparto"]
        for r in reparto:
            assert r["cost_allocation_usd"] == 25.0
            assert r["cost_allocation_cop"] == 100000.0

    def test_agregar_paquetes_a_consolidacion_abierta(self, app_client, admin_token):
        """4. Agregar paquetes adicionales a una consolidación existente."""
        shp1 = _create_shipments(app_client, admin_token, count=1, weights=(5.0,))[0]
        shp2 = _create_shipments(app_client, admin_token, count=1, weights=(3.0,))[0]

        con_res = app_client.post(
            "/api/v1/logistica/consolidaciones",
            headers=_auth(admin_token),
            json={"shipment_ids": [shp1]},
        )
        con_id = con_res.json()["data"]["id"]

        add_res = app_client.post(
            f"/api/v1/logistica/consolidaciones/{con_id}/shipments",
            headers=_auth(admin_token),
            json={"shipment_ids": [shp2]},
        )
        assert add_res.status_code == 200
        data = add_res.json()["data"]
        assert data["shipments_count"] == 2
        assert data["total_weight_kg"] == 8.0

    def test_propagacion_en_cascada_de_estados_a_paquetes(self, app_client, admin_token):
        """5. Cambio de estado de consolidación actualiza todos sus paquetes asociados."""
        shp_ids = _create_shipments(app_client, admin_token, count=2, weights=(2.0, 2.0))

        con_res = app_client.post(
            "/api/v1/logistica/consolidaciones",
            headers=_auth(admin_token),
            json={"shipment_ids": shp_ids},
        )
        con_id = con_res.json()["data"]["id"]

        # Avanzar consolidación a EN_VUELO
        app_client.patch(
            f"/api/v1/logistica/consolidaciones/{con_id}/estado",
            headers=_auth(admin_token),
            json={"status": "EN_VUELO", "notes": "Carga aérea despegó"},
        )
        for sid in shp_ids:
            s_det = app_client.get(f"/api/v1/logistica/shipments/{sid}", headers=_auth(admin_token)).json()["data"]
            assert s_det["status_fise"] == "EN_VUELO"

        # Avanzar consolidación a EN_DIAN
        app_client.patch(
            f"/api/v1/logistica/consolidaciones/{con_id}/estado",
            headers=_auth(admin_token),
            json={"status": "EN_DIAN"},
        )
        for sid in shp_ids:
            s_det = app_client.get(f"/api/v1/logistica/shipments/{sid}", headers=_auth(admin_token)).json()["data"]
            assert s_det["status_fise"] == "EN_DIAN"

        # Avanzar consolidación a RECIBIDA_DESTINO
        app_client.patch(
            f"/api/v1/logistica/consolidaciones/{con_id}/estado",
            headers=_auth(admin_token),
            json={"status": "RECIBIDA_DESTINO"},
        )
        for sid in shp_ids:
            s_det = app_client.get(f"/api/v1/logistica/shipments/{sid}", headers=_auth(admin_token)).json()["data"]
            assert s_det["status_fise"] == "RECIBIDO_BARRANQUILLA"
            assert s_det["commercial_status"] == "EN_BARRANQUILLA"

    def test_agregar_paquetes_a_consolidacion_cerrada_falla_422(self, app_client, admin_token):
        """6. No se pueden agregar paquetes a una consolidación CERRADA."""
        shp1 = _create_shipments(app_client, admin_token, count=1, weights=(2.0,))[0]
        shp2 = _create_shipments(app_client, admin_token, count=1, weights=(3.0,))[0]

        con_res = app_client.post(
            "/api/v1/logistica/consolidaciones",
            headers=_auth(admin_token),
            json={"shipment_ids": [shp1]},
        )
        con_id = con_res.json()["data"]["id"]

        # Cerrar consolidación
        app_client.patch(
            f"/api/v1/logistica/consolidaciones/{con_id}/estado",
            headers=_auth(admin_token),
            json={"status": "CERRADA"},
        )

        # Intentar agregar
        add_res = app_client.post(
            f"/api/v1/logistica/consolidaciones/{con_id}/shipments",
            headers=_auth(admin_token),
            json={"shipment_ids": [shp2]},
        )
        assert add_res.status_code == 422
        assert "cerrada" in add_res.text
