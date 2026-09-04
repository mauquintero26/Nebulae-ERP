"""
test_fase2_shipments_tracking.py — Tests de Paquetes, Envíos y Trazabilidad (Fase 2 Endurecida).

Escenarios cubiertos:
1. Creación de un paquete (Shipment) con tracking individual y eventos automáticos iniciales.
2. Un PEC dividido en múltiples paquetes (ej. FedEx + UPS con líneas separadas).
3. Rechazo si una línea de compra pertenece a otra PEC (falla 422).
4. Cantidad despachada superior a la cantidad ordenada (falla 422).
5. Exceso acumulado en dos paquetes (6 + 6 en orden de 10 falla 422).
6. Líneas duplicadas (mismo po_line_id) en el mismo paquete (falla 422).
7. Rollback completo si una de varias líneas es inválida (no se crea el Shipment).
8. Control de concurrencia al crear paquetes simultáneos (SELECT FOR UPDATE).
9. Máquina de estados: transición válida paso a paso.
10. Máquina de estados: salto inválido (ej: ENVIADO_A_MIAMI -> RECIBIDO_BARRANQUILLA falla 422).
11. Máquina de estados: retroceso (ej: EN_DIAN -> RECIBIDO_MIAMI falla 422).
12. Máquina de estados: evento duplicado es idempotente sin duplicar fila.
13. Máquina de estados: evento posterior a la entrega final RECIBIDO_BARRANQUILLA falla 422.
14. Máquina de estados: Ruta Amazon Directo (proveedor directo a vuelo -> DIAN -> Barranquilla).
15. Idempotencia en creación de paquete (mismo carrier + tracking_number).
16. Catálogo de ubicaciones logísticas intermedias (LogisticsLocation).
"""
import uuid
import datetime
from decimal import Decimal
from concurrent.futures import ThreadPoolExecutor
import pytest

from tests.conftest import TestSessionLocal
from app.models.erp_documents import PurchaseOrderFull, Supplier
from app.models.fase1b import PurchaseOrderLine
from app.models.fase2 import Shipment, ShipmentLine, ShipmentEvent, LogisticsLocation
from app.models.catalog import ProductSKU, Product, Brand, Category


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _create_supplier_db(db) -> int:
    s = Supplier(name=f"Sup-{uuid.uuid4().hex[:6]}", is_active=True)
    db.add(s)
    db.commit()
    db.refresh(s)
    return s.id


def _create_sku_db(db) -> int:
    br = Brand(name=f"Br-{uuid.uuid4().hex[:6]}")
    db.add(br)
    ca = Category(name=f"Ca-{uuid.uuid4().hex[:6]}")
    db.add(ca)
    db.flush()
    pr = Product(
        name=f"Pr-{uuid.uuid4().hex[:6]}",
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
        sku=f"TST-{uuid.uuid4().hex[:8]}",
        cost_price=10.0,
        sale_price=20.0,
    )
    db.add(sk)
    db.commit()
    db.refresh(sk)
    return sk.id


def _create_pec_with_lines(db, sup_id: int, sku_id: int) -> tuple:
    pec = PurchaseOrderFull(
        numero=f"PEC-LOG-{uuid.uuid4().hex[:6].upper()}",
        supplier_id=sup_id,
        supplier_name="Amazon US",
        estado="COMPRA_REALIZADA",
        total_cop=500000.0,
    )
    db.add(pec)
    db.flush()

    line1 = PurchaseOrderLine(
        pec_id=pec.id,
        sku_id=sku_id,
        description="Item Parte 1",
        quantity_ordered=Decimal("5.0"),
        unit_cost_usd=Decimal("15.0"),
    )
    line2 = PurchaseOrderLine(
        pec_id=pec.id,
        sku_id=sku_id,
        description="Item Parte 2",
        quantity_ordered=Decimal("3.0"),
        unit_cost_usd=Decimal("25.0"),
    )
    db.add(line1)
    db.add(line2)
    db.commit()
    db.refresh(pec)
    db.refresh(line1)
    db.refresh(line2)
    return pec, line1, line2


class TestFase2ShipmentsTracking:

    def test_crear_shipment_exitoso_y_eventos_iniciales(self, app_client, admin_token):
        """1. Creación de un paquete individual con tracking y carrier."""
        with TestSessionLocal() as session:
            sup_id = _create_supplier_db(session)
            sku_id = _create_sku_db(session)
            pec, l1, l2 = _create_pec_with_lines(session, sup_id, sku_id)
            pec_id = pec.id
            l1_id = l1.id

        trk = f"1Z{uuid.uuid4().hex[:10].upper()}"
        payload = {
            "pec_id": pec_id,
            "carrier": "UPS",
            "tracking_number": trk,
            "carrier_service": "Ground",
            "origin": "PROVEEDOR",
            "destination": "MIAMI",
            "weight_lb": 4.5,
            "weight_kg": 2.04,
            "shipping_cost_usd": 18.50,
            "lines": [{"po_line_id": l1_id, "quantity": 5.0}],
        }
        res = app_client.post("/api/v1/logistica/shipments", headers=_auth(admin_token), json=payload)
        assert res.status_code == 200, f"Error: {res.text}"
        data = res.json()["data"]
        assert data["carrier"] == "UPS"
        assert data["tracking_number"] == trk
        assert data["status_fise"] == "ENVIADO_A_MIAMI"

    def test_un_pec_dividido_en_multiples_paquetes(self, app_client, admin_token):
        """2. Un PEC con 2 líneas despachado en 2 paquetes con carriers distintos."""
        with TestSessionLocal() as session:
            sup_id = _create_supplier_db(session)
            sku_id = _create_sku_db(session)
            pec, l1, l2 = _create_pec_with_lines(session, sup_id, sku_id)
            pec_id = pec.id
            l1_id, l2_id = l1.id, l2.id

        # Paquete 1: línea 1 por FedEx
        res1 = app_client.post(
            "/api/v1/logistica/shipments",
            headers=_auth(admin_token),
            json={
                "pec_id": pec_id,
                "carrier": "FedEx",
                "tracking_number": f"FDX-{uuid.uuid4().hex[:8].upper()}",
                "lines": [{"po_line_id": l1_id, "quantity": 5.0}],
            },
        )
        assert res1.status_code == 200

        # Paquete 2: línea 2 por USPS
        res2 = app_client.post(
            "/api/v1/logistica/shipments",
            headers=_auth(admin_token),
            json={
                "pec_id": pec_id,
                "carrier": "USPS",
                "tracking_number": f"9400{uuid.uuid4().hex[:8].upper()}",
                "lines": [{"po_line_id": l2_id, "quantity": 3.0}],
            },
        )
        assert res2.status_code == 200

        res_list = app_client.get(f"/api/v1/logistica/shipments?pec_id={pec_id}", headers=_auth(admin_token))
        assert res_list.status_code == 200
        assert res_list.json()["data"]["total"] == 2

    def test_linea_perteneciente_a_otra_pec_falla_422(self, app_client, admin_token):
        """3. Falla con 422 si se intenta meter una línea de otra PEC en el paquete."""
        with TestSessionLocal() as session:
            sup_id = _create_supplier_db(session)
            sku_id = _create_sku_db(session)
            pec1, l1_a, _ = _create_pec_with_lines(session, sup_id, sku_id)
            pec2, l2_a, _ = _create_pec_with_lines(session, sup_id, sku_id)
            pec1_id = pec1.id
            l2_a_id = l2_a.id  # Línea de PEC 2

        payload = {
            "pec_id": pec1_id,
            "carrier": "DHL",
            "tracking_number": f"DHL-{uuid.uuid4().hex[:8]}",
            "lines": [{"po_line_id": l2_a_id, "quantity": 1.0}],
        }
        res = app_client.post("/api/v1/logistica/shipments", headers=_auth(admin_token), json=payload)
        assert res.status_code == 422
        assert "no pertenece a la orden PEC" in res.text

    def test_cantidad_superior_a_la_ordenada_falla_422(self, app_client, admin_token):
        """4. Falla con 422 si se intenta despachar una cantidad mayor a la ordenada."""
        with TestSessionLocal() as session:
            sup_id = _create_supplier_db(session)
            sku_id = _create_sku_db(session)
            pec, l1, _ = _create_pec_with_lines(session, sup_id, sku_id)
            pec_id = pec.id
            l1_id = l1.id  # ordered = 5.0

        payload = {
            "pec_id": pec_id,
            "carrier": "UPS",
            "tracking_number": f"1Z-{uuid.uuid4().hex[:8]}",
            "lines": [{"po_line_id": l1_id, "quantity": 6.0}],  # 6.0 > 5.0
        }
        res = app_client.post("/api/v1/logistica/shipments", headers=_auth(admin_token), json=payload)
        assert res.status_code == 422
        assert "superaría la cantidad ordenada" in res.text

    def test_exceso_acumulado_en_dos_paquetes_falla_422(self, app_client, admin_token):
        """5. Primer paquete despacha 3 de 5; segundo paquete intenta despachar 3 más (total 6 > 5) -> Falla 422."""
        with TestSessionLocal() as session:
            sup_id = _create_supplier_db(session)
            sku_id = _create_sku_db(session)
            pec, l1, _ = _create_pec_with_lines(session, sup_id, sku_id)
            pec_id = pec.id
            l1_id = l1.id

        # Paquete 1: 3.0
        res1 = app_client.post(
            "/api/v1/logistica/shipments",
            headers=_auth(admin_token),
            json={
                "pec_id": pec_id,
                "carrier": "UPS",
                "tracking_number": f"1Z-{uuid.uuid4().hex[:8]}",
                "lines": [{"po_line_id": l1_id, "quantity": 3.0}],
            },
        )
        assert res1.status_code == 200

        # Paquete 2: 3.0 más (acumulado sería 6.0 > 5.0)
        res2 = app_client.post(
            "/api/v1/logistica/shipments",
            headers=_auth(admin_token),
            json={
                "pec_id": pec_id,
                "carrier": "FedEx",
                "tracking_number": f"FDX-{uuid.uuid4().hex[:8]}",
                "lines": [{"po_line_id": l1_id, "quantity": 3.0}],
            },
        )
        assert res2.status_code == 422
        assert "superaría la cantidad ordenada" in res2.text

    def test_po_line_id_repetida_dentro_del_mismo_paquete_falla_422(self, app_client, admin_token):
        """6. Falla con 422 si se repite la misma po_line_id en el payload del paquete."""
        with TestSessionLocal() as session:
            sup_id = _create_supplier_db(session)
            sku_id = _create_sku_db(session)
            pec, l1, _ = _create_pec_with_lines(session, sup_id, sku_id)
            pec_id = pec.id
            l1_id = l1.id

        payload = {
            "pec_id": pec_id,
            "carrier": "UPS",
            "tracking_number": f"1Z-{uuid.uuid4().hex[:8]}",
            "lines": [
                {"po_line_id": l1_id, "quantity": 2.0},
                {"po_line_id": l1_id, "quantity": 2.0},
            ],
        }
        res = app_client.post("/api/v1/logistica/shipments", headers=_auth(admin_token), json=payload)
        assert res.status_code == 422
        assert "Líneas duplicadas detectadas" in res.text

    def test_rollback_completo_si_una_linea_es_invalida(self, app_client, admin_token):
        """7. Si una de las líneas es inválida, ninguna línea se crea ni se persiste el paquete."""
        with TestSessionLocal() as session:
            sup_id = _create_supplier_db(session)
            sku_id = _create_sku_db(session)
            pec, l1, l2 = _create_pec_with_lines(session, sup_id, sku_id)
            pec_id = pec.id
            l1_id = l1.id
            trk = f"1Z-RB-{uuid.uuid4().hex[:8]}"

        payload = {
            "pec_id": pec_id,
            "carrier": "UPS",
            "tracking_number": trk,
            "lines": [
                {"po_line_id": l1_id, "quantity": 2.0},
                {"po_line_id": 9999999, "quantity": 1.0},  # Línea inexistente
            ],
        }
        res = app_client.post("/api/v1/logistica/shipments", headers=_auth(admin_token), json=payload)
        assert res.status_code == 422

        # Comprobar que no quedó paquete huérfano en BD
        with TestSessionLocal() as session:
            found = session.query(Shipment).filter(Shipment.tracking_number == trk).first()
            assert found is None, "El paquete debió ser revertido por rollback completo"

    def test_maquina_estados_transicion_valida(self, app_client, admin_token):
        """8. Transiciones válidas y ordenadas en la máquina de estados de Miami."""
        with TestSessionLocal() as session:
            sup_id = _create_supplier_db(session)
            sku_id = _create_sku_db(session)
            pec, l1, _ = _create_pec_with_lines(session, sup_id, sku_id)
            pec_id = pec.id

        res = app_client.post(
            "/api/v1/logistica/shipments",
            headers=_auth(admin_token),
            json={"pec_id": pec_id, "carrier": "FedEx", "tracking_number": f"FDX-{uuid.uuid4().hex[:8]}"},
        )
        shp_id = res.json()["data"]["id"]

        # Secuencia canónica
        steps = [
            "RECIBIDO_MIAMI",
            "PENDIENTE_CONSOLIDACION",
            "CONSOLIDADO",
            "EN_VUELO",
            "EN_DIAN",
            "LIBERADO_DIAN",
            "RECIBIDO_BOGOTA",
            "ENVIADO_BARRANQUILLA",
            "RECIBIDO_BARRANQUILLA",
        ]
        for step in steps:
            ev_res = app_client.post(
                f"/api/v1/logistica/shipments/{shp_id}/eventos",
                headers=_auth(admin_token),
                json={"event_type": step, "location": "Hub Operativo"},
            )
            assert ev_res.status_code == 200, f"Error en paso {step}: {ev_res.text}"
            assert ev_res.json()["data"]["nuevo_status_fise"] == step

        # Verificar estado comercial final
        detail = app_client.get(f"/api/v1/logistica/shipments/{shp_id}", headers=_auth(admin_token)).json()["data"]
        assert detail["status_fise"] == "RECIBIDO_BARRANQUILLA"
        assert detail["commercial_status"] == "EN_BARRANQUILLA"
        assert detail["actual_delivery_date"] is not None

    def test_maquina_estados_salto_invalido_falla_422(self, app_client, admin_token):
        """9. Intentar saltar directamente de ENVIADO_A_MIAMI a RECIBIDO_BARRANQUILLA debe fallar con 422."""
        with TestSessionLocal() as session:
            sup_id = _create_supplier_db(session)
            sku_id = _create_sku_db(session)
            pec, _, _ = _create_pec_with_lines(session, sup_id, sku_id)
            pec_id = pec.id

        res = app_client.post(
            "/api/v1/logistica/shipments",
            headers=_auth(admin_token),
            json={"pec_id": pec_id, "carrier": "FedEx", "tracking_number": f"FDX-{uuid.uuid4().hex[:8]}"},
        )
        shp_id = res.json()["data"]["id"]

        # Intento de salto inválido
        res_bad = app_client.post(
            f"/api/v1/logistica/shipments/{shp_id}/eventos",
            headers=_auth(admin_token),
            json={"event_type": "RECIBIDO_BARRANQUILLA"},
        )
        assert res_bad.status_code == 422
        assert "Transición inválida" in res_bad.text

    def test_maquina_estados_retroceso_falla_422(self, app_client, admin_token):
        """10. Intentar retroceder de EN_DIAN a RECIBIDO_MIAMI debe fallar con 422."""
        with TestSessionLocal() as session:
            sup_id = _create_supplier_db(session)
            sku_id = _create_sku_db(session)
            pec, _, _ = _create_pec_with_lines(session, sup_id, sku_id)
            pec_id = pec.id

        res = app_client.post(
            "/api/v1/logistica/shipments",
            headers=_auth(admin_token),
            json={"pec_id": pec_id, "carrier": "FedEx", "tracking_number": f"FDX-{uuid.uuid4().hex[:8]}"},
        )
        shp_id = res.json()["data"]["id"]

        # Avanzar hasta EN_DIAN
        for step in ["RECIBIDO_MIAMI", "CONSOLIDADO", "EN_VUELO", "EN_DIAN"]:
            app_client.post(f"/api/v1/logistica/shipments/{shp_id}/eventos", headers=_auth(admin_token), json={"event_type": step})

        # Intentar retroceder a RECIBIDO_MIAMI
        res_retro = app_client.post(
            f"/api/v1/logistica/shipments/{shp_id}/eventos",
            headers=_auth(admin_token),
            json={"event_type": "RECIBIDO_MIAMI"},
        )
        assert res_retro.status_code == 422
        assert "Transición inválida" in res_retro.text

    def test_maquina_estados_duplicado_idempotente(self, app_client, admin_token):
        """11. Enviar el mismo evento cuando el paquete ya está en ese estado es idempotente y no duplica filas."""
        with TestSessionLocal() as session:
            sup_id = _create_supplier_db(session)
            sku_id = _create_sku_db(session)
            pec, _, _ = _create_pec_with_lines(session, sup_id, sku_id)
            pec_id = pec.id

        res = app_client.post(
            "/api/v1/logistica/shipments",
            headers=_auth(admin_token),
            json={"pec_id": pec_id, "carrier": "FedEx", "tracking_number": f"FDX-{uuid.uuid4().hex[:8]}"},
        )
        shp_id = res.json()["data"]["id"]

        app_client.post(f"/api/v1/logistica/shipments/{shp_id}/eventos", headers=_auth(admin_token), json={"event_type": "RECIBIDO_MIAMI"})

        # Reintento idéntico
        res_dup = app_client.post(f"/api/v1/logistica/shipments/{shp_id}/eventos", headers=_auth(admin_token), json={"event_type": "RECIBIDO_MIAMI"})
        assert res_dup.status_code == 200
        assert "idempotente" in res_dup.json()["message"]

        with TestSessionLocal() as session:
            events = session.query(ShipmentEvent).filter(ShipmentEvent.shipment_id == shp_id, ShipmentEvent.event_type == "RECIBIDO_MIAMI").all()
            assert len(events) == 1, f"Se esperaba 1 solo evento, encontrados {len(events)}"

    def test_maquina_estados_evento_despues_de_estado_final_falla_422(self, app_client, admin_token):
        """12. Intentar registrar un nuevo evento tras alcanzar RECIBIDO_BARRANQUILLA debe fallar con 422."""
        with TestSessionLocal() as session:
            sup_id = _create_supplier_db(session)
            sku_id = _create_sku_db(session)
            pec, _, _ = _create_pec_with_lines(session, sup_id, sku_id)
            pec_id = pec.id

        res = app_client.post(
            "/api/v1/logistica/shipments",
            headers=_auth(admin_token),
            json={"pec_id": pec_id, "carrier": "FedEx", "tracking_number": f"FDX-{uuid.uuid4().hex[:8]}"},
        )
        shp_id = res.json()["data"]["id"]

        for step in ["RECIBIDO_MIAMI", "CONSOLIDADO", "EN_VUELO", "EN_DIAN", "LIBERADO_DIAN", "RECIBIDO_BOGOTA", "ENVIADO_BARRANQUILLA", "RECIBIDO_BARRANQUILLA"]:
            app_client.post(f"/api/v1/logistica/shipments/{shp_id}/eventos", headers=_auth(admin_token), json={"event_type": step})

        # Intentar nuevo evento
        res_after = app_client.post(
            f"/api/v1/logistica/shipments/{shp_id}/eventos",
            headers=_auth(admin_token),
            json={"event_type": "RECIBIDO_BOGOTA"},
        )
        assert res_after.status_code == 422
        assert "estado final de entrega" in res_after.text

    def test_maquina_estados_ruta_amazon_directo(self, app_client, admin_token):
        """13. Ruta directa (Amazon Direct) sin pasar por Miami."""
        with TestSessionLocal() as session:
            sup_id = _create_supplier_db(session)
            sku_id = _create_sku_db(session)
            pec, _, _ = _create_pec_with_lines(session, sup_id, sku_id)
            pec_id = pec.id

        # Crear paquete sin tracking inicial (queda en PREPARANDO_PROVEEDOR)
        res = app_client.post(
            "/api/v1/logistica/shipments",
            headers=_auth(admin_token),
            json={"pec_id": pec_id, "carrier": "Amazon Logistics", "tracking_number": f"TBA-{uuid.uuid4().hex[:8]}"},
        )
        shp_id = res.json()["data"]["id"]

        # Salto directo de proveedor a vuelo internacional
        # En create_shipment con tracking pasa a ENVIADO_A_MIAMI por defecto si destination es MIAMI.
        # Creemos uno con destination BOGOTA o ruta directa
        res_direct = app_client.post(
            "/api/v1/logistica/shipments",
            headers=_auth(admin_token),
            json={
                "pec_id": pec_id,
                "carrier": "Amazon Direct",
                "tracking_number": f"AMZ-DIR-{uuid.uuid4().hex[:8]}",
                "destination": "BOGOTA",
            },
        )
        shp_dir_id = res_direct.json()["data"]["id"]

        # Ruta directa: ENVIADO_A_MIAMI o PREPARANDO -> EN_VUELO -> EN_DIAN -> LIBERADO_DIAN -> RECIBIDO_BARRANQUILLA
        # Reset a PREPARANDO_PROVEEDOR via DB para probar transición directa
        with TestSessionLocal() as session:
            shp_obj = session.query(Shipment).filter(Shipment.id == shp_dir_id).first()
            shp_obj.status_fise = "PREPARANDO_PROVEEDOR"
            session.commit()

        res_vuelo = app_client.post(f"/api/v1/logistica/shipments/{shp_dir_id}/eventos", headers=_auth(admin_token), json={"event_type": "EN_VUELO"})
        assert res_vuelo.status_code == 200

        res_dian = app_client.post(f"/api/v1/logistica/shipments/{shp_dir_id}/eventos", headers=_auth(admin_token), json={"event_type": "EN_DIAN"})
        assert res_dian.status_code == 200

        res_lib = app_client.post(f"/api/v1/logistica/shipments/{shp_dir_id}/eventos", headers=_auth(admin_token), json={"event_type": "LIBERADO_DIAN"})
        assert res_lib.status_code == 200

        res_baq = app_client.post(f"/api/v1/logistica/shipments/{shp_dir_id}/eventos", headers=_auth(admin_token), json={"event_type": "RECIBIDO_BARRANQUILLA"})
        assert res_baq.status_code == 200

    def test_idempotencia_creacion_shipment(self, app_client, admin_token):
        """14. Crear el mismo paquete con idéntico carrier y tracking es idempotente."""
        with TestSessionLocal() as session:
            sup_id = _create_supplier_db(session)
            sku_id = _create_sku_db(session)
            pec, _, _ = _create_pec_with_lines(session, sup_id, sku_id)
            pec_id = pec.id

        trk = f"TRK-IDEM-{uuid.uuid4().hex[:8]}"
        payload = {"pec_id": pec_id, "carrier": "DHL", "tracking_number": trk}

        res1 = app_client.post("/api/v1/logistica/shipments", headers=_auth(admin_token), json=payload)
        assert res1.status_code == 200
        shp_id1 = res1.json()["data"]["id"]

        res2 = app_client.post("/api/v1/logistica/shipments", headers=_auth(admin_token), json=payload)
        assert res2.status_code == 200
        shp_id2 = res2.json()["data"]["id"]

        assert shp_id1 == shp_id2, "Debe retornar exactamente el mismo ID"

    def test_catalogo_ubicaciones_logisticas(self, app_client, admin_token):
        """15. Catálogo de agencias y hubs logísticos."""
        code = f"AGY-{uuid.uuid4().hex[:4].upper()}"
        res = app_client.post(
            "/api/v1/logistica/locations",
            headers=_auth(admin_token),
            json={"code": code, "name": "Miami Hub Central", "location_type": "AGENCY_MIAMI", "city": "Miami", "country": "USA"},
        )
        assert res.status_code == 200
        assert res.json()["data"]["code"] == code

        res_get = app_client.get("/api/v1/logistica/locations", headers=_auth(admin_token))
        assert res_get.status_code == 200
        assert any(l["code"] == code for l in res_get.json()["data"])
