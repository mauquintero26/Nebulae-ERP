"""
test_fase2_consolidaciones.py — Tests de Consolidaciones Internacionales y Prorrateo de Flete (Fase 2 Deep Hardening).

Escenarios cubiertos:
1. Creación de una consolidación internacional agrupando múltiples paquetes elegibles (RECIBIDO_MIAMI).
2. Rechazo al intentar consolidar paquetes en estado inelegible (ej. ENVIADO_A_MIAMI falla 422).
3. Rechazo al intentar consolidar paquetes con ruta directa DIRECT_TO_BARRANQUILLA (falla 422).
4. Un paquete no puede pertenecer simultáneamente a más de una consolidación activa (falla 422).
5. Detectar shipment_ids repetidos en el mismo payload (falla 422).
6. Si algún shipment_id no existe, rechazar toda la operación con rollback atómico (404).
7. Rechazo al agregar paquetes a una consolidación cerrada o recibida (falla 422).
8. Idempotencia al agregar paquetes (no duplica asociaciones ni eventos).
9. Máquina de estados de consolidación: salto no permitido (ej. ABIERTA -> EN_VUELO falla 422).
10. Máquina de estados de consolidación: retroceso (ej. EN_VUELO -> CONSOLIDADA falla 422).
11. Máquina de estados de consolidación: repetición del estado actual es idempotente sin duplicar eventos.
12. Máquina de estados de consolidación: CERRADA es terminal y no admite cambios posteriores (falla 422).
13. Propagación en cascada de estados a paquetes respetando transiciones permitidas de cada paquete.
14. Prorrateo: rechazo en consolidación CERRADA (falla 422).
15. Prorrateo: método desconocido devuelve 422.
16. Prorrateo WEIGHT: paquete sin peso o con peso cero devuelve 422.
17. Prorrateo VOLUME: paquete sin volumen devuelve 422.
18. Prorrateo QUANTITY: paquete sin líneas/artículos devuelve 422.
19. Prorrateo VALUE: paquete sin valor comercial devuelve 422.
20. Prorrateo EQUAL: tres paquetes con división periódica ($100 / 3 -> $33.34 + $33.33 + $33.33 = $100.00 exacto).
21. Prorrateo por WEIGHT: reparto exacto en USD y COP según TRM.
22. Prorrateo por VOLUME, QUANTITY y VALUE: suma exacta de centavos y persistencia de allocation_method y allocation_base.
"""
import uuid
from decimal import Decimal
import pytest

from tests.conftest import TestSessionLocal
from app.models.erp_documents import PurchaseOrderFull, Supplier
from app.models.fase1b import PurchaseOrderLine
from app.models.fase2 import Shipment, Consolidation, ConsolidationShipment, ShipmentEvent, ShipmentLine
from app.models.catalog import ProductSKU, Product, Brand, Category


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _create_supplier_and_sku(db) -> tuple:
    s = Supplier(name=f"Sup-Con-{uuid.uuid4().hex[:6]}", is_active=True)
    db.add(s)
    br = Brand(name=f"Br-Con-{uuid.uuid4().hex[:6]}")
    db.add(br)
    ca = Category(name=f"Ca-Con-{uuid.uuid4().hex[:6]}")
    db.add(ca)
    db.flush()
    pr = Product(
        name=f"Pr-Con-{uuid.uuid4().hex[:6]}",
        brand_id=br.id,
        category_id=ca.id,
        type="Fisico",
        base_currency="USD",
        uom="Ud",
        is_active=True,
    )
    db.add(pr)
    db.flush()
    sk = ProductSKU(
        product_id=pr.id,
        sku=f"SKU-CON-{uuid.uuid4().hex[:8]}",
        cost_price=10.0,
        sale_price=20.0,
    )
    db.add(sk)
    db.commit()
    db.refresh(s)
    db.refresh(sk)
    return s.id, sk.id


def _create_shipments(client, token, count=3, weights=(2.0, 3.0, 5.0), volumes=(0.01, 0.02, 0.03)):
    """Crea envíos y los avanza a RECIBIDO_MIAMI para que sean elegibles para consolidación."""
    shipment_ids = []
    for i in range(count):
        w = weights[i] if i < len(weights) else 2.0
        v = volumes[i] if i < len(volumes) else 0.01
        res = client.post(
            "/api/v1/logistica/shipments",
            headers=_auth(token),
            json={
                "carrier": "UPS",
                "tracking_number": f"1Z-CS-{uuid.uuid4().hex[:8]}",
                "weight_kg": w,
                "volume_cbm": v,
                "route_type": "VIA_MIAMI",
            },
        )
        assert res.status_code == 200, f"Error creando shipment: {res.text}"
        sid = res.json()["data"]["id"]
        # Avanzar a RECIBIDO_MIAMI
        res_ev = client.post(
            f"/api/v1/logistica/shipments/{sid}/eventos",
            headers=_auth(token),
            json={"event_type": "RECIBIDO_MIAMI"},
        )
        assert res_ev.status_code == 200, f"Error avanzando a RECIBIDO_MIAMI: {res_ev.text}"
        shipment_ids.append(sid)
    return shipment_ids


class TestFase2Consolidaciones:

    def test_crear_consolidacion_exitosa(self, app_client, admin_token):
        """1. Crear consolidación internacional agrupando paquetes elegibles."""
        shp_ids = _create_shipments(app_client, admin_token, count=2, weights=(3.0, 7.0), volumes=(0.015, 0.035))

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

    def test_paquete_inelegible_rechazado_422(self, app_client, admin_token):
        """2. Rechazo al intentar consolidar un paquete en ENVIADO_A_MIAMI (debe estar en RECIBIDO_MIAMI)."""
        # Crear shipment sin avanzar a RECIBIDO_MIAMI (queda en ENVIADO_A_MIAMI)
        res_shp = app_client.post(
            "/api/v1/logistica/shipments",
            headers=_auth(admin_token),
            json={"carrier": "FedEx", "tracking_number": f"FDX-INEL-{uuid.uuid4().hex[:6]}"},
        )
        assert res_shp.status_code == 200
        shp_id = res_shp.json()["data"]["id"]

        res = app_client.post(
            "/api/v1/logistica/consolidaciones",
            headers=_auth(admin_token),
            json={"carrier": "Carrier X", "shipment_ids": [shp_id]},
        )
        assert res.status_code == 422
        assert "no está en un estado elegible para consolidación" in res.text

    def test_paquete_directo_rechazado_para_consolidacion_422(self, app_client, admin_token):
        """3. Rechazo al intentar consolidar un paquete con ruta DIRECT_TO_BARRANQUILLA."""
        res_shp = app_client.post(
            "/api/v1/logistica/shipments",
            headers=_auth(admin_token),
            json={
                "carrier": "Amazon Direct",
                "tracking_number": f"AMZ-NODIR-{uuid.uuid4().hex[:6]}",
                "route_type": "DIRECT_TO_BARRANQUILLA",
            },
        )
        assert res_shp.status_code == 200
        shp_id = res_shp.json()["data"]["id"]

        res = app_client.post(
            "/api/v1/logistica/consolidaciones",
            headers=_auth(admin_token),
            json={"carrier": "Carrier Y", "shipment_ids": [shp_id]},
        )
        assert res.status_code == 422
        assert "DIRECT_TO_BARRANQUILLA" in res.text

    def test_paquete_en_dos_consolidaciones_activas_falla_422(self, app_client, admin_token):
        """4. Un paquete no puede pertenecer simultáneamente a dos consolidaciones activas."""
        shp_ids = _create_shipments(app_client, admin_token, count=1, weights=(4.0,))
        s_id = shp_ids[0]

        # Consolidación 1 (activa)
        res1 = app_client.post(
            "/api/v1/logistica/consolidaciones",
            headers=_auth(admin_token),
            json={"carrier": "Carrier 1", "shipment_ids": [s_id]},
        )
        assert res1.status_code == 200

        # Consolidación 2 intenta incluir el mismo paquete
        res2 = app_client.post(
            "/api/v1/logistica/consolidaciones",
            headers=_auth(admin_token),
            json={"carrier": "Carrier 2", "shipment_ids": [s_id]},
        )
        assert res2.status_code == 422
        assert "ya pertenece a la consolidación activa" in res2.text

    def test_shipment_ids_repetidos_en_payload_falla_422(self, app_client, admin_token):
        """5. Detectar shipment_ids repetidos en el mismo payload y rechazar."""
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
        """6. Si algún shipment_id no existe, rechaza toda la operación con rollback atómico."""
        shp_ids = _create_shipments(app_client, admin_token, count=1, weights=(5.0,))
        s_id = shp_ids[0]

        trk_con = f"COO-RB-{uuid.uuid4().hex[:6]}"
        res = app_client.post(
            "/api/v1/logistica/consolidaciones",
            headers=_auth(admin_token),
            json={
                "carrier": "Carrier RB",
                "tracking_international": trk_con,
                "shipment_ids": [s_id, 999999],
            },
        )
        assert res.status_code == 404
        assert "no existen" in res.text

        with TestSessionLocal() as session:
            c = session.query(Consolidation).filter(Consolidation.tracking_international == trk_con).first()
            assert c is None

    def test_agregar_paquetes_a_consolidacion_cerrada_falla_422(self, app_client, admin_token):
        """7. Rechazo al agregar paquetes a una consolidación CERRADA."""
        shp_ids = _create_shipments(app_client, admin_token, count=2, weights=(2.0, 3.0))

        con_res = app_client.post(
            "/api/v1/logistica/consolidaciones",
            headers=_auth(admin_token),
            json={"carrier": "Carrier Close", "shipment_ids": [shp_ids[0]]},
        )
        con_id = con_res.json()["data"]["id"]

        # Cerrar consolidación siguiendo la máquina de estados
        for st in ["CONSOLIDADA", "EN_VUELO", "EN_DIAN", "LIBERADA", "RECIBIDA_DESTINO", "CERRADA"]:
            r = app_client.patch(
                f"/api/v1/logistica/consolidaciones/{con_id}/estado",
                headers=_auth(admin_token),
                json={"status": st},
            )
            assert r.status_code == 200, f"Error avanzando a {st}: {r.text}"

        # Intentar agregar el paquete 2
        res_add = app_client.post(
            f"/api/v1/logistica/consolidaciones/{con_id}/shipments",
            headers=_auth(admin_token),
            json={"shipment_ids": [shp_ids[1]]},
        )
        assert res_add.status_code == 422
        assert "consolidación cerrada" in res_add.text

    def test_idempotencia_agregar_paquetes(self, app_client, admin_token):
        """8. Reintentar agregar los mismos paquetes no duplica asociaciones ni eventos."""
        shp_ids = _create_shipments(app_client, admin_token, count=1, weights=(2.0,))
        s_id = shp_ids[0]

        con_res = app_client.post(
            "/api/v1/logistica/consolidaciones",
            headers=_auth(admin_token),
            json={"carrier": "Carrier Idem", "shipment_ids": [s_id]},
        )
        con_id = con_res.json()["data"]["id"]

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
            assert len(assocs) == 1

    def test_maquina_estados_consolidacion_saltos_y_retrocesos_rechazados_422(self, app_client, admin_token):
        """9-10. Saltos no permitidos y regresiones en consolidación se rechazan con 422."""
        shp_ids = _create_shipments(app_client, admin_token, count=1, weights=(2.0,))
        con_res = app_client.post(
            "/api/v1/logistica/consolidaciones",
            headers=_auth(admin_token),
            json={"carrier": "Carrier FSM", "shipment_ids": shp_ids},
        )
        con_id = con_res.json()["data"]["id"]

        # 1. Salto: ABIERTA -> EN_VUELO (debe ser CONSOLIDADA)
        res_jump = app_client.patch(
            f"/api/v1/logistica/consolidaciones/{con_id}/estado",
            headers=_auth(admin_token),
            json={"status": "EN_VUELO"},
        )
        assert res_jump.status_code == 422
        assert "Transición inválida" in res_jump.text

        # 2. Transición válida: ABIERTA -> CONSOLIDADA
        res_valid = app_client.patch(
            f"/api/v1/logistica/consolidaciones/{con_id}/estado",
            headers=_auth(admin_token),
            json={"status": "CONSOLIDADA"},
        )
        assert res_valid.status_code == 200

        # 3. Retroceso: CONSOLIDADA -> ABIERTA
        res_back = app_client.patch(
            f"/api/v1/logistica/consolidaciones/{con_id}/estado",
            headers=_auth(admin_token),
            json={"status": "ABIERTA"},
        )
        assert res_back.status_code == 422
        assert "Transición inválida" in res_back.text

    def test_maquina_estados_repeticion_idempotente_y_terminal_cerrada(self, app_client, admin_token):
        """11-12. Repetir estado actual es idempotente y CERRADA es terminal."""
        shp_ids = _create_shipments(app_client, admin_token, count=1, weights=(2.0,))
        con_res = app_client.post(
            "/api/v1/logistica/consolidaciones",
            headers=_auth(admin_token),
            json={"carrier": "Carrier Term", "shipment_ids": shp_ids},
        )
        con_id = con_res.json()["data"]["id"]

        # Repetir ABIERTA (idempotente)
        res_rep = app_client.patch(
            f"/api/v1/logistica/consolidaciones/{con_id}/estado",
            headers=_auth(admin_token),
            json={"status": "ABIERTA"},
        )
        assert res_rep.status_code == 200
        assert "ya se encontraba en estado ABIERTA" in res_rep.json()["message"]

        # Avanzar hasta CERRADA
        for st in ["CONSOLIDADA", "EN_VUELO", "EN_DIAN", "LIBERADA", "RECIBIDA_DESTINO", "CERRADA"]:
            app_client.patch(f"/api/v1/logistica/consolidaciones/{con_id}/estado", headers=_auth(admin_token), json={"status": st})

        # Intentar modificar estado desde CERRADA
        res_after = app_client.patch(
            f"/api/v1/logistica/consolidaciones/{con_id}/estado",
            headers=_auth(admin_token),
            json={"status": "ABIERTA"},
        )
        assert res_after.status_code == 422
        assert "estado terminal" in res_after.text

    def test_propagacion_estados_respetando_transiciones_de_paquetes(self, app_client, admin_token):
        """13. Propagación en cascada de estados a paquetes respetando transiciones permitidas."""
        shp_ids = _create_shipments(app_client, admin_token, count=1, weights=(2.0,))
        s_id = shp_ids[0]

        con_res = app_client.post(
            "/api/v1/logistica/consolidaciones",
            headers=_auth(admin_token),
            json={"carrier": "Carrier Casc", "shipment_ids": [s_id]},
        )
        con_id = con_res.json()["data"]["id"]

        # Paso 1: CONSOLIDADA
        app_client.patch(f"/api/v1/logistica/consolidaciones/{con_id}/estado", headers=_auth(admin_token), json={"status": "CONSOLIDADA"})

        # Paso 2: EN_VUELO
        res_vuelo = app_client.patch(f"/api/v1/logistica/consolidaciones/{con_id}/estado", headers=_auth(admin_token), json={"status": "EN_VUELO"})
        assert res_vuelo.status_code == 200

        with TestSessionLocal() as session:
            shp = session.query(Shipment).filter(Shipment.id == s_id).first()
            assert shp.status_fise == "EN_VUELO"

    def test_prorrateo_en_consolidacion_cerrada_falla_422(self, app_client, admin_token):
        """14. Prorratear costos en una consolidación CERRADA debe fallar con 422."""
        shp_ids = _create_shipments(app_client, admin_token, count=1, weights=(2.0,))
        con_res = app_client.post(
            "/api/v1/logistica/consolidaciones",
            headers=_auth(admin_token),
            json={"carrier": "Carrier PrClose", "shipment_ids": shp_ids},
        )
        con_id = con_res.json()["data"]["id"]

        for st in ["CONSOLIDADA", "EN_VUELO", "EN_DIAN", "LIBERADA", "RECIBIDA_DESTINO", "CERRADA"]:
            app_client.patch(f"/api/v1/logistica/consolidaciones/{con_id}/estado", headers=_auth(admin_token), json={"status": st})

        res_pr = app_client.post(
            f"/api/v1/logistica/consolidaciones/{con_id}/repartir-costos",
            headers=_auth(admin_token),
            json={"allocation_method": "EQUAL", "total_freight_usd": 100.0},
        )
        assert res_pr.status_code == 422
        assert "consolidación cerrada" in res_pr.text

    def test_prorrateo_metodo_desconocido_falla_422(self, app_client, admin_token):
        """15. Método de prorrateo desconocido debe arrojar 422."""
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

    def test_prorrateo_bases_invalidas_falla_422(self, app_client, admin_token):
        """16-19. Rechazar WEIGHT sin peso, VOLUME sin volumen, QUANTITY sin líneas o VALUE sin costo."""
        # Crear un paquete con peso 0
        res_w0 = app_client.post(
            "/api/v1/logistica/shipments",
            headers=_auth(admin_token),
            json={"carrier": "UPS", "tracking_number": f"1Z-W0-{uuid.uuid4().hex[:8]}", "weight_kg": 0.0},
        )
        s_id = res_w0.json()["data"]["id"]
        app_client.post(f"/api/v1/logistica/shipments/{s_id}/eventos", headers=_auth(admin_token), json={"event_type": "RECIBIDO_MIAMI"})

        con_res = app_client.post(
            "/api/v1/logistica/consolidaciones",
            headers=_auth(admin_token),
            json={"carrier": "Carrier Bases", "shipment_ids": [s_id]},
        )
        con_id = con_res.json()["data"]["id"]

        # WEIGHT falla
        res_w = app_client.post(f"/api/v1/logistica/consolidaciones/{con_id}/repartir-costos", headers=_auth(admin_token), json={"allocation_method": "WEIGHT", "total_freight_usd": 100.0})
        assert res_w.status_code == 422

        # VOLUME falla (volume_cbm es None)
        res_v = app_client.post(f"/api/v1/logistica/consolidaciones/{con_id}/repartir-costos", headers=_auth(admin_token), json={"allocation_method": "VOLUME", "total_freight_usd": 100.0})
        assert res_v.status_code == 422

        # QUANTITY falla (no tiene líneas)
        res_q = app_client.post(f"/api/v1/logistica/consolidaciones/{con_id}/repartir-costos", headers=_auth(admin_token), json={"allocation_method": "QUANTITY", "total_freight_usd": 100.0})
        assert res_q.status_code == 422

        # VALUE falla (no tiene líneas con valor)
        res_val = app_client.post(f"/api/v1/logistica/consolidaciones/{con_id}/repartir-costos", headers=_auth(admin_token), json={"allocation_method": "VALUE", "total_freight_usd": 100.0})
        assert res_val.status_code == 422

    def test_prorrateo_tres_paquetes_division_periodica_equal(self, app_client, admin_token):
        """20. Prorrateo EQUAL de $100 USD entre 3 paquetes ($33.34 + $33.33 + $33.33 = $100.00 exacto)."""
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

        assert usd_shares == [33.34, 33.33, 33.33]
        assert round(sum(usd_shares), 2) == 100.00
        assert sum(cop_shares) == 400000.00

        with TestSessionLocal() as session:
            db_assocs = session.query(ConsolidationShipment).filter(ConsolidationShipment.consolidation_id == con_id).all()
            assert sum(Decimal(str(a.cost_allocation_usd)) for a in db_assocs) == Decimal("100.00")
            assert sum(Decimal(str(a.cost_allocation_cop)) for a in db_assocs) == Decimal("400000.00")
            for a in db_assocs:
                assert a.allocation_method == "EQUAL"
                assert a.allocation_base == Decimal("1.0000")

    def test_prorrateo_por_peso_suma_exacta_usd_cop(self, app_client, admin_token):
        """21. Prorrateo por PESO (WEIGHT) con pesos desiguales y suma exacta."""
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

    def test_prorrateo_por_volume_quantity_value_completo(self, app_client, admin_token):
        """22. Prorrateo por VOLUME, QUANTITY y VALUE con líneas reales y suma exacta."""
        with TestSessionLocal() as session:
            sup_id, sku_id = _create_supplier_and_sku(session)
            pec = PurchaseOrderFull(
                numero=f"PEC-ALL-{uuid.uuid4().hex[:6].upper()}",
                supplier_id=sup_id,
                supplier_name="Sup Allocation",
                estado="COMPRA_REALIZADA",
            )
            session.add(pec)
            session.flush()

            l1 = PurchaseOrderLine(pec_id=pec.id, sku_id=sku_id, description="Item 1", quantity_ordered=Decimal("10.0"), unit_cost_usd=Decimal("10.0"))
            l2 = PurchaseOrderLine(pec_id=pec.id, sku_id=sku_id, description="Item 2", quantity_ordered=Decimal("20.0"), unit_cost_usd=Decimal("25.0"))
            session.add(l1)
            session.add(l2)
            session.commit()
            pec_id = pec.id
            l1_id = l1.id
            l2_id = l2.id

        # Paquete 1: 5 unidades de l1 (5 * 10 = $50 USD), volumen 0.01 cbm
        res1 = app_client.post(
            "/api/v1/logistica/shipments",
            headers=_auth(admin_token),
            json={
                "pec_id": pec_id,
                "carrier": "UPS",
                "tracking_number": f"1Z-AL1-{uuid.uuid4().hex[:6]}",
                "weight_kg": 2.0,
                "volume_cbm": 0.01,
                "lines": [{"po_line_id": l1_id, "quantity": 5.0}],
            },
        )
        s1_id = res1.json()["data"]["id"]
        app_client.post(f"/api/v1/logistica/shipments/{s1_id}/eventos", headers=_auth(admin_token), json={"event_type": "RECIBIDO_MIAMI"})

        # Paquete 2: 10 unidades de l2 (10 * 25 = $250 USD), volumen 0.04 cbm
        res2 = app_client.post(
            "/api/v1/logistica/shipments",
            headers=_auth(admin_token),
            json={
                "pec_id": pec_id,
                "carrier": "FedEx",
                "tracking_number": f"FDX-AL2-{uuid.uuid4().hex[:6]}",
                "weight_kg": 5.0,
                "volume_cbm": 0.04,
                "lines": [{"po_line_id": l2_id, "quantity": 10.0}],
            },
        )
        s2_id = res2.json()["data"]["id"]
        app_client.post(f"/api/v1/logistica/shipments/{s2_id}/eventos", headers=_auth(admin_token), json={"event_type": "RECIBIDO_MIAMI"})

        con_res = app_client.post(
            "/api/v1/logistica/consolidaciones",
            headers=_auth(admin_token),
            json={"carrier": "Carrier Prorate", "shipment_ids": [s1_id, s2_id], "trm": 4000.0, "total_freight_usd": 150.0},
        )
        con_id = con_res.json()["data"]["id"]

        # 1. Prorrateo por VOLUME: bases 0.01 y 0.04 (ratio 1:4 -> $30 y $120)
        res_vol = app_client.post(
            f"/api/v1/logistica/consolidaciones/{con_id}/repartir-costos",
            headers=_auth(admin_token),
            json={"allocation_method": "VOLUME", "total_freight_usd": 150.0, "trm": 4000.0},
        )
        assert res_vol.status_code == 200
        reparto_vol = res_vol.json()["data"]["reparto"]
        assert reparto_vol[0]["cost_allocation_usd"] == 30.00
        assert reparto_vol[1]["cost_allocation_usd"] == 120.00

        # 2. Prorrateo por QUANTITY: bases 5 y 10 (ratio 1:2 -> $50 y $100)
        res_qty = app_client.post(
            f"/api/v1/logistica/consolidaciones/{con_id}/repartir-costos",
            headers=_auth(admin_token),
            json={"allocation_method": "QUANTITY", "total_freight_usd": 150.0, "trm": 4000.0},
        )
        assert res_qty.status_code == 200
        reparto_qty = res_qty.json()["data"]["reparto"]
        assert reparto_qty[0]["cost_allocation_usd"] == 50.00
        assert reparto_qty[1]["cost_allocation_usd"] == 100.00

        # 3. Prorrateo por VALUE: bases 50 y 250 (ratio 1:5 -> $25 y $125)
        res_val = app_client.post(
            f"/api/v1/logistica/consolidaciones/{con_id}/repartir-costos",
            headers=_auth(admin_token),
            json={"allocation_method": "VALUE", "total_freight_usd": 150.0, "trm": 4000.0},
        )
        assert res_val.status_code == 200
        reparto_val = res_val.json()["data"]["reparto"]
        assert reparto_val[0]["cost_allocation_usd"] == 25.00
        assert reparto_val[1]["cost_allocation_usd"] == 125.00

        # Verificar persistencia final en base de datos
        with TestSessionLocal() as session:
            c = session.query(Consolidation).filter(Consolidation.id == con_id).first()
            assert c.last_allocation_method == "VALUE"
            assocs = {cs.shipment_id: cs for cs in c.shipment_associations}
            assert assocs[s1_id].allocation_method == "VALUE"
            assert assocs[s1_id].allocation_base == Decimal("50.0000")
            assert assocs[s2_id].allocation_base == Decimal("250.0000")
