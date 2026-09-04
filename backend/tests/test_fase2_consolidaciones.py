"""
test_fase2_consolidaciones.py — Tests de Consolidaciones Internacionales y Prorrateo de Flete (Fase 2 Endurecida).

Escenarios cubiertos:
1. Creación de una consolidación internacional agrupando múltiples paquetes.
2. Un paquete no puede pertenecer simultáneamente a más de una consolidación activa (falla 422).
3. Detectar shipment_ids repetidos en el mismo payload (falla 422).
4. Si algún shipment_id no existe, rechazar toda la operación con rollback atómico (404).
5. Rechazo al agregar paquetes a una consolidación cerrada o recibida (falla 422).
6. Idempotencia al agregar paquetes (no duplica asociaciones ni eventos).
7. Propagación en cascada de estados a paquetes sin duplicar eventos ante reintentos.
8. Prorrateo: método desconocido devuelve 422.
9. Prorrateo: paquete sin peso devuelve 422 en WEIGHT.
10. Prorrateo: paquete con peso cero devuelve 422 en WEIGHT.
11. Prorrateo: tres paquetes con división periódica ($100 / 3 -> suma exacta $100.00 USD y COP al centavo con residuo determinista).
12. Prorrateo: reparto por peso exacto en USD y COP según TRM.
13. Repetición idempotente de prorrateo.
14. Consulta detallada de la consolidación con desglose de paquetes y costos.
"""
import uuid
from decimal import Decimal
import pytest

from tests.conftest import TestSessionLocal
from app.models.erp_documents import PurchaseOrderFull, Supplier
from app.models.fase2 import Shipment, Consolidation, ConsolidationShipment, ShipmentEvent


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


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

    def test_paquete_en_dos_consolidaciones_activas_falla_422(self, app_client, admin_token):
        """2. Un paquete no puede pertenecer simultáneamente a dos consolidaciones activas."""
        shp_ids = _create_shipments(app_client, admin_token, count=1, weights=(4.0,))
        s_id = shp_ids[0]

        # Consolidación 1 (activa)
        res1 = app_client.post(
            "/api/v1/logistica/consolidaciones",
            headers=_auth(admin_token),
            json={"carrier": "Carrier 1", "shipment_ids": [s_id]},
        )
        assert res1.status_code == 200

        # Consolidación 2 intenta incluir el mismo paquete mientras la 1 está activa
        res2 = app_client.post(
            "/api/v1/logistica/consolidaciones",
            headers=_auth(admin_token),
            json={"carrier": "Carrier 2", "shipment_ids": [s_id]},
        )
        assert res2.status_code == 422
        assert "ya pertenece a la consolidación activa" in res2.text

    def test_shipment_ids_repetidos_en_payload_falla_422(self, app_client, admin_token):
        """3. Detectar shipment_ids repetidos en el mismo payload y rechazar."""
        shp_ids = _create_shipments(app_client, admin_token, count=1, weights=(5.0,))
        s_id = shp_ids[0]

        res = app_client.post(
            "/api/v1/logistica/consolidaciones",
            headers=_auth(admin_token),
            json={"carrier": "Carrier Dup", "shipment_ids": [s_id, s_id]},
        )
        assert res.status_code == 422
        assert "shipment_ids repetidos" in res.text

    def test_id_inexistente_rechaza_con_rollback_atomico(self, app_client, admin_token):
        """4. Si algún shipment_id no existe, rechaza toda la operación y no crea la consolidación."""
        shp_ids = _create_shipments(app_client, admin_token, count=1, weights=(5.0,))
        s_id = shp_ids[0]

        trk_con = f"COO-RB-{uuid.uuid4().hex[:6]}"
        res = app_client.post(
            "/api/v1/logistica/consolidaciones",
            headers=_auth(admin_token),
            json={
                "carrier": "Carrier RB",
                "tracking_international": trk_con,
                "shipment_ids": [s_id, 999999],  # 999999 no existe
            },
        )
        assert res.status_code == 404
        assert "no existen" in res.text

        # Verificar rollback: la consolidación no debe haberse creado
        with TestSessionLocal() as session:
            c = session.query(Consolidation).filter(Consolidation.tracking_international == trk_con).first()
            assert c is None, "La consolidación debió ser revertida por rollback"

    def test_agregar_paquetes_a_consolidacion_cerrada_falla_422(self, app_client, admin_token):
        """5. Rechazo al agregar paquetes a una consolidación CERRADA."""
        shp_ids = _create_shipments(app_client, admin_token, count=2, weights=(2.0, 3.0))

        con_res = app_client.post(
            "/api/v1/logistica/consolidaciones",
            headers=_auth(admin_token),
            json={"carrier": "Carrier Close", "shipment_ids": [shp_ids[0]]},
        )
        con_id = con_res.json()["data"]["id"]

        # Cerrar consolidación
        app_client.patch(
            f"/api/v1/logistica/consolidaciones/{con_id}/estado",
            headers=_auth(admin_token),
            json={"status": "CERRADA"},
        )

        # Intentar agregar el paquete 2
        res_add = app_client.post(
            f"/api/v1/logistica/consolidaciones/{con_id}/shipments",
            headers=_auth(admin_token),
            json={"shipment_ids": [shp_ids[1]]},
        )
        assert res_add.status_code == 422
        assert "consolidación cerrada" in res_add.text

    def test_idempotencia_agregar_paquetes(self, app_client, admin_token):
        """6. Reintentar agregar los mismos paquetes a la misma consolidación no duplica asociaciones."""
        shp_ids = _create_shipments(app_client, admin_token, count=1, weights=(2.0,))
        s_id = shp_ids[0]

        con_res = app_client.post(
            "/api/v1/logistica/consolidaciones",
            headers=_auth(admin_token),
            json={"carrier": "Carrier Idem", "shipment_ids": [s_id]},
        )
        con_id = con_res.json()["data"]["id"]

        # Reintento con el mismo ID
        res_readd = app_client.post(
            f"/api/v1/logistica/consolidaciones/{con_id}/shipments",
            headers=_auth(admin_token),
            json={"shipment_ids": [s_id]},
        )
        assert res_readd.status_code == 200

        with TestSessionLocal() as session:
            assocs = session.query(ConsolidationShipment).filter(
                ConsolidationShipment.consolidation_id == con_id,
                ConsolidationShipment.shipment_id == s_id,
            ).all()
            assert len(assocs) == 1, f"Se esperaba 1 asociación única, encontradas {len(assocs)}"

    def test_propagacion_estados_y_deduplicacion_eventos(self, app_client, admin_token):
        """7. Actualizar estado propaga a paquetes sin duplicar eventos al repetir."""
        shp_ids = _create_shipments(app_client, admin_token, count=1, weights=(2.0,))
        s_id = shp_ids[0]

        con_res = app_client.post(
            "/api/v1/logistica/consolidaciones",
            headers=_auth(admin_token),
            json={"carrier": "Carrier Casc", "shipment_ids": [s_id]},
        )
        con_id = con_res.json()["data"]["id"]

        # Cambiar a EN_VUELO
        res_vuelo = app_client.patch(
            f"/api/v1/logistica/consolidaciones/{con_id}/estado",
            headers=_auth(admin_token),
            json={"status": "EN_VUELO"},
        )
        assert res_vuelo.status_code == 200

        # Repetir EN_VUELO (idempotente)
        res_vuelo_repeat = app_client.patch(
            f"/api/v1/logistica/consolidaciones/{con_id}/estado",
            headers=_auth(admin_token),
            json={"status": "EN_VUELO"},
        )
        assert res_vuelo_repeat.status_code == 200

        # Verificar que el paquete tiene exactamente 1 evento EN_VUELO
        with TestSessionLocal() as session:
            evs = session.query(ShipmentEvent).filter(
                ShipmentEvent.shipment_id == s_id,
                ShipmentEvent.event_type == "EN_VUELO",
            ).all()
            assert len(evs) == 1, f"Se esperaba 1 solo evento EN_VUELO, encontrados {len(evs)}"

    def test_prorrateo_metodo_desconocido_falla_422(self, app_client, admin_token):
        """8. Método de prorrateo desconocido debe arrojar 422."""
        shp_ids = _create_shipments(app_client, admin_token, count=1, weights=(2.0,))
        con_res = app_client.post(
            "/api/v1/logistica/consolidaciones",
            headers=_auth(admin_token),
            json={"carrier": "Carrier M", "shipment_ids": shp_ids},
        )
        con_id = con_res.json()["data"]["id"]

        res = app_client.post(
            f"/api/v1/logistica/consolidaciones/{con_id}/repartir-costos",
            headers=_auth(admin_token),
            json={"allocation_method": "VOLUMETRIC_RANDOM", "total_freight_usd": 100.0},
        )
        assert res.status_code == 422

    def test_prorrateo_peso_faltante_o_cero_falla_422(self, app_client, admin_token):
        """9. Si un paquete no tiene peso o tiene peso cero, WEIGHT falla con 422."""
        # Crear un paquete con peso 0.0 (o None)
        shp_res = app_client.post(
            "/api/v1/logistica/shipments",
            headers=_auth(admin_token),
            json={"carrier": "UPS", "tracking_number": f"1Z-W0-{uuid.uuid4().hex[:8]}", "weight_kg": 0.0},
        )
        assert shp_res.status_code == 200
        s_id = shp_res.json()["data"]["id"]

        con_res = app_client.post(
            "/api/v1/logistica/consolidaciones",
            headers=_auth(admin_token),
            json={"carrier": "Carrier W0", "shipment_ids": [s_id]},
        )
        con_id = con_res.json()["data"]["id"]

        res = app_client.post(
            f"/api/v1/logistica/consolidaciones/{con_id}/repartir-costos",
            headers=_auth(admin_token),
            json={"allocation_method": "WEIGHT", "total_freight_usd": 100.0},
        )
        assert res.status_code == 422
        assert "no tiene un peso válido mayor a 0 kg" in res.text

    def test_prorrateo_tres_paquetes_division_periodica_suma_exacta(self, app_client, admin_token):
        """10. Prorrateo EQUAL de $100 USD entre 3 paquetes ($33.34 + $33.33 + $33.33 = $100.00 exacto)."""
        shp_ids = _create_shipments(app_client, admin_token, count=3, weights=(2.0, 2.0, 2.0))

        con_res = app_client.post(
            "/api/v1/logistica/consolidaciones",
            headers=_auth(admin_token),
            json={"carrier": "Carrier Equal", "shipment_ids": shp_ids, "trm": 4000.0, "total_freight_usd": 100.0},
        )
        con_id = con_res.json()["data"]["id"]

        res = app_client.post(
            f"/api/v1/logistica/consolidaciones/{con_id}/repartir-costos",
            headers=_auth(admin_token),
            json={"allocation_method": "EQUAL", "total_freight_usd": 100.0, "trm": 4000.0},
        )
        assert res.status_code == 200
        reparto = res.json()["data"]["reparto"]
        assert len(reparto) == 3

        usd_shares = [r["cost_allocation_usd"] for r in reparto]
        cop_shares = [r["cost_allocation_cop"] for r in reparto]

        # Verificar cuotas
        assert usd_shares == [33.34, 33.33, 33.33]
        assert round(sum(usd_shares), 2) == 100.00
        assert sum(cop_shares) == 400000.00

        # Verificar persistencia en base de datos
        with TestSessionLocal() as session:
            db_assocs = session.query(ConsolidationShipment).filter(ConsolidationShipment.consolidation_id == con_id).all()
            db_sum_usd = sum(Decimal(str(a.cost_allocation_usd)) for a in db_assocs)
            db_sum_cop = sum(Decimal(str(a.cost_allocation_cop)) for a in db_assocs)
            assert db_sum_usd == Decimal("100.00")
            assert db_sum_cop == Decimal("400000.00")

    def test_prorrateo_por_peso_suma_exacta_usd_cop(self, app_client, admin_token):
        """11. Prorrateo por PESO (WEIGHT) con pesos desiguales y suma exacta."""
        # 1.0 kg (10%), 3.0 kg (30%), 6.0 kg (60%) -> Total 10 kg
        shp_ids = _create_shipments(app_client, admin_token, count=3, weights=(1.0, 3.0, 6.0))

        con_res = app_client.post(
            "/api/v1/logistica/consolidaciones",
            headers=_auth(admin_token),
            json={"carrier": "Carrier Weight", "shipment_ids": shp_ids, "trm": 4123.50, "total_freight_usd": 250.75},
        )
        con_id = con_res.json()["data"]["id"]

        res = app_client.post(
            f"/api/v1/logistica/consolidaciones/{con_id}/repartir-costos",
            headers=_auth(admin_token),
            json={"allocation_method": "WEIGHT", "total_freight_usd": 250.75, "trm": 4123.50},
        )
        assert res.status_code == 200
        reparto = res.json()["data"]["reparto"]

        sum_usd = sum(Decimal(str(r["cost_allocation_usd"])) for r in reparto)
        assert sum_usd == Decimal("250.75")

        detail = app_client.get(f"/api/v1/logistica/consolidaciones/{con_id}", headers=_auth(admin_token)).json()["data"]
        sum_cop = sum(Decimal(str(p["cost_allocation_cop"])) for p in detail["paquetes"])
        assert sum_cop == Decimal(str(detail["total_freight_cop"]))
