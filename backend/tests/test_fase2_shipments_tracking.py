"""
test_fase2_shipments_tracking.py — Tests de Paquetes, Envíos y Trazabilidad (Fase 2 Deep Hardening).

Escenarios cubiertos:
1. Creación de un paquete (Shipment) con tracking individual y eventos automáticos iniciales (VIA_MIAMI).
2. Un PEC dividido en múltiples paquetes (ej. FedEx + UPS con líneas separadas).
3. Rechazo si una línea de compra pertenece a otra PEC (falla 422).
4. Cantidad despachada superior a la cantidad ordenada (falla 422).
5. Exceso acumulado en dos paquetes (6 + 6 en orden de 10 falla 422).
6. Líneas duplicadas (mismo po_line_id) en el mismo paquete (falla 422).
7. Rollback completo si una de varias líneas es inválida (no se crea el Shipment).
8. Control de concurrencia al crear paquetes simultáneos con secuencias PostgreSQL (shipment_number_seq).
9. Máquina de estados: transición válida paso a paso.
10. Máquina de estados: salto inválido (ej: ENVIADO_A_MIAMI -> RECIBIDO_BARRANQUILLA falla 422).
11. Máquina de estados: retroceso (ej: EN_DIAN -> RECIBIDO_MIAMI falla 422).
12. Máquina de estados: evento duplicado es idempotente sin duplicar fila.
13. Máquina de estados: evento posterior a la entrega final RECIBIDO_BARRANQUILLA falla 422.
14. Máquina de estados: eventos concurrentes con idempotency_key retornan el evento idempotentemente.
15. Ruta DIRECT_TO_BARRANQUILLA: inicia en PREPARANDO_PROVEEDOR y rechaza eventos de escala Miami (422).
16. Ruta DIRECT_TO_BARRANQUILLA: ciclo directo completo (PREPARANDO -> EN_VUELO -> EN_DIAN -> LIBERADO -> BARRANQUILLA).
17. Identidad normalizada e idempotencia: espacios y mayúsculas/minúsculas recuperan paquete existente si compatible.
18. Conflicto de identidad (409 Conflict): mismo carrier y tracking pero diferente PEC o líneas.
19. Integridad de ubicaciones: ubicación inexistente (422), inactiva (422), o incompatible con la ruta (422).
20. Ubicación válida activa asigna logistics_location_id y agency_id.
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
        """1. Creación de un paquete individual con tracking y carrier (ruta por defecto VIA_MIAMI)."""
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
            "route_type": "VIA_MIAMI",
            "origin": "PROVEEDOR",
            "destination": "MIAMI",
            "weight_lb": 4.5,
            "weight_kg": 2.04,
            "volume_cbm": 0.015,
            "shipping_cost_usd": 18.50,
            "lines": [{"po_line_id": l1_id, "quantity": 5.0}],
        }
        res = app_client.post("/api/v1/logistica/shipments", headers=_auth(admin_token), json=payload)
        assert res.status_code == 200, f"Error: {res.text}"
        data = res.json()["data"]
        assert data["carrier"] == "UPS"
        assert data["tracking_number"] == trk
        assert data["status_fise"] == "ENVIADO_A_MIAMI"
        assert data["route_type"] == "VIA_MIAMI"

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
                "tracking_number": f"FDX-{uuid.uuid4().hex[:8]}",
                "lines": [{"po_line_id": l1_id, "quantity": 5.0}],
            },
        )
        assert res1.status_code == 200

        # Paquete 2: línea 2 por DHL
        res2 = app_client.post(
            "/api/v1/logistica/shipments",
            headers=_auth(admin_token),
            json={
                "pec_id": pec_id,
                "carrier": "DHL Express",
                "tracking_number": f"DHL-{uuid.uuid4().hex[:8]}",
                "lines": [{"po_line_id": l2_id, "quantity": 3.0}],
            },
        )
        assert res2.status_code == 200

        with TestSessionLocal() as session:
            s1 = session.query(Shipment).filter(Shipment.id == res1.json()["data"]["id"]).first()
            s2 = session.query(Shipment).filter(Shipment.id == res2.json()["data"]["id"]).first()
            assert s1.pec_id == pec_id and s2.pec_id == pec_id
            assert s1.shipment_number != s2.shipment_number

    def test_rechazo_linea_de_otra_pec_falla_422(self, app_client, admin_token):
        """3. Rechazo si se intenta incluir una línea que no pertenece a la PEC del paquete."""
        with TestSessionLocal() as session:
            sup_id = _create_supplier_db(session)
            sku_id = _create_sku_db(session)
            pec1, l1, _ = _create_pec_with_lines(session, sup_id, sku_id)
            pec2, l2, _ = _create_pec_with_lines(session, sup_id, sku_id)
            pec1_id = pec1.id
            l2_id = l2.id

        res = app_client.post(
            "/api/v1/logistica/shipments",
            headers=_auth(admin_token),
            json={
                "pec_id": pec1_id,
                "carrier": "USPS",
                "tracking_number": f"9400{uuid.uuid4().hex[:8]}",
                "lines": [{"po_line_id": l2_id, "quantity": 1.0}],
            },
        )
        assert res.status_code == 422
        assert "no pertenece a la orden PEC" in res.text

    def test_despacho_superior_a_cantidad_ordenada_falla_422(self, app_client, admin_token):
        """4. Intentar despachar 10 unidades de una línea que solo tiene 5 ordenadas."""
        with TestSessionLocal() as session:
            sup_id = _create_supplier_db(session)
            sku_id = _create_sku_db(session)
            pec, l1, _ = _create_pec_with_lines(session, sup_id, sku_id)
            pec_id = pec.id
            l1_id = l1.id

        res = app_client.post(
            "/api/v1/logistica/shipments",
            headers=_auth(admin_token),
            json={
                "pec_id": pec_id,
                "carrier": "UPS",
                "tracking_number": f"1Z-EXC-{uuid.uuid4().hex[:8]}",
                "lines": [{"po_line_id": l1_id, "quantity": 10.0}],  # Solo hay 5 ordenadas
            },
        )
        assert res.status_code == 422
        assert "Exceso de cantidad" in res.text

    def test_exceso_acumulado_en_dos_paquetes_falla_422(self, app_client, admin_token):
        """5. Despacho acumulado: 4 unidades en el primer paquete, luego 2 más sobre una orden de 5 (total 6 > 5)."""
        with TestSessionLocal() as session:
            sup_id = _create_supplier_db(session)
            sku_id = _create_sku_db(session)
            pec, l1, _ = _create_pec_with_lines(session, sup_id, sku_id)
            pec_id = pec.id
            l1_id = l1.id

        # Paquete 1: 4 de 5 (válido)
        res1 = app_client.post(
            "/api/v1/logistica/shipments",
            headers=_auth(admin_token),
            json={
                "pec_id": pec_id,
                "carrier": "FedEx",
                "tracking_number": f"FDX-P1-{uuid.uuid4().hex[:8]}",
                "lines": [{"po_line_id": l1_id, "quantity": 4.0}],
            },
        )
        assert res1.status_code == 200

        # Paquete 2: 2 de 5 restantes (4 + 2 = 6 > 5, debe fallar con 422)
        res2 = app_client.post(
            "/api/v1/logistica/shipments",
            headers=_auth(admin_token),
            json={
                "pec_id": pec_id,
                "carrier": "FedEx",
                "tracking_number": f"FDX-P2-{uuid.uuid4().hex[:8]}",
                "lines": [{"po_line_id": l1_id, "quantity": 2.0}],
            },
        )
        assert res2.status_code == 422
        assert "Exceso de cantidad" in res2.text

    def test_lineas_duplicadas_en_mismo_paquete_falla_422(self, app_client, admin_token):
        """6. Rechazar payload con líneas duplicadas (mismo po_line_id repetido)."""
        with TestSessionLocal() as session:
            sup_id = _create_supplier_db(session)
            sku_id = _create_sku_db(session)
            pec, l1, _ = _create_pec_with_lines(session, sup_id, sku_id)
            pec_id = pec.id
            l1_id = l1.id

        res = app_client.post(
            "/api/v1/logistica/shipments",
            headers=_auth(admin_token),
            json={
                "pec_id": pec_id,
                "carrier": "UPS",
                "tracking_number": f"1Z-DUP-{uuid.uuid4().hex[:8]}",
                "lines": [
                    {"po_line_id": l1_id, "quantity": 2.0},
                    {"po_line_id": l1_id, "quantity": 1.0},
                ],
            },
        )
        assert res.status_code == 422
        assert "Líneas duplicadas detectadas" in res.text

    def test_rollback_completo_si_linea_invalida(self, app_client, admin_token):
        """7. Si una de varias líneas falla, no se debe crear el Shipment en la base de datos."""
        with TestSessionLocal() as session:
            sup_id = _create_supplier_db(session)
            sku_id = _create_sku_db(session)
            pec, l1, _ = _create_pec_with_lines(session, sup_id, sku_id)
            pec_id = pec.id
            l1_id = l1.id

        trk = f"1Z-RB-{uuid.uuid4().hex[:8]}"
        res = app_client.post(
            "/api/v1/logistica/shipments",
            headers=_auth(admin_token),
            json={
                "pec_id": pec_id,
                "carrier": "UPS",
                "tracking_number": trk,
                "lines": [
                    {"po_line_id": l1_id, "quantity": 2.0},
                    {"po_line_id": 999999, "quantity": 1.0},  # No existe
                ],
            },
        )
        assert res.status_code in (404, 422)

        with TestSessionLocal() as session:
            shp = session.query(Shipment).filter(Shipment.tracking_number == trk).first()
            assert shp is None, "El paquete no debió ser creado debido al rollback"

    def test_control_concurrencia_creacion_paquetes(self, app_client, admin_token):
        """8. Creación concurrente de paquetes genera shipment_number secuenciales únicos sin colisiones."""
        with TestSessionLocal() as session:
            sup_id = _create_supplier_db(session)
            sku_id = _create_sku_db(session)
            pec, _, _ = _create_pec_with_lines(session, sup_id, sku_id)
            pec_id = pec.id

        def _make_req(idx):
            return app_client.post(
                "/api/v1/logistica/shipments",
                headers=_auth(admin_token),
                json={
                    "pec_id": pec_id,
                    "carrier": f"Carrier-{idx}",
                    "tracking_number": f"TRK-{uuid.uuid4().hex[:8]}",
                },
            )

        with ThreadPoolExecutor(max_workers=4) as ex:
            results = list(ex.map(_make_req, range(4)))

        numbers = [r.json()["data"]["shipment_number"] for r in results if r.status_code == 200]
        assert len(numbers) == 4
        assert len(numbers) == len(set(numbers)), "Todos los números de shipment generados concurrentemente deben ser únicos"

    def test_maquina_estados_transicion_valida_paso_a_paso(self, app_client, admin_token):
        """9. Máquina de estados: ciclo de vida completo vía Miami."""
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
        assert res.status_code == 200
        shp_id = res.json()["data"]["id"]

        flujo = [
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
        for step in flujo:
            r = app_client.post(
                f"/api/v1/logistica/shipments/{shp_id}/eventos",
                headers=_auth(admin_token),
                json={"event_type": step, "notes": f"Llegó a {step}"},
            )
            assert r.status_code == 200, f"Falló en paso {step}: {r.text}"
            assert r.json()["data"]["nuevo_status_fise"] == step

        with TestSessionLocal() as session:
            s = session.query(Shipment).filter(Shipment.id == shp_id).first()
            assert s.status_fise == "RECIBIDO_BARRANQUILLA"
            assert s.commercial_status == "EN_BARRANQUILLA"
            assert s.actual_delivery_date is not None

    def test_maquina_estados_salto_invalido_falla_422(self, app_client, admin_token):
        """10. Un salto no permitido (ej. ENVIADO_A_MIAMI -> RECIBIDO_BARRANQUILLA) debe fallar con 422."""
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

        res_salto = app_client.post(
            f"/api/v1/logistica/shipments/{shp_id}/eventos",
            headers=_auth(admin_token),
            json={"event_type": "RECIBIDO_BARRANQUILLA"},
        )
        assert res_salto.status_code == 422
        assert "Transición inválida" in res_salto.text

    def test_maquina_estados_retroceso_invalido_falla_422(self, app_client, admin_token):
        """11. Retroceder en el estado logístico (ej. EN_DIAN -> RECIBIDO_MIAMI) debe fallar con 422."""
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

        for step in ["RECIBIDO_MIAMI", "CONSOLIDADO", "EN_VUELO", "EN_DIAN"]:
            app_client.post(f"/api/v1/logistica/shipments/{shp_id}/eventos", headers=_auth(admin_token), json={"event_type": step})

        res_back = app_client.post(
            f"/api/v1/logistica/shipments/{shp_id}/eventos",
            headers=_auth(admin_token),
            json={"event_type": "RECIBIDO_MIAMI"},
        )
        assert res_back.status_code == 422
        assert "Transición inválida" in res_back.text

    def test_maquina_estados_evento_duplicado_es_idempotente(self, app_client, admin_token):
        """12. Repetir el mismo estado es idempotente y no crea eventos duplicados."""
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

        res_dup = app_client.post(f"/api/v1/logistica/shipments/{shp_id}/eventos", headers=_auth(admin_token), json={"event_type": "RECIBIDO_MIAMI"})
        assert res_dup.status_code == 200
        assert "idempotente" in res_dup.json()["message"]

        with TestSessionLocal() as session:
            events = session.query(ShipmentEvent).filter(ShipmentEvent.shipment_id == shp_id, ShipmentEvent.event_type == "RECIBIDO_MIAMI").all()
            assert len(events) == 1, f"Se esperaba 1 solo evento, encontrados {len(events)}"

    def test_maquina_estados_evento_despues_de_estado_final_falla_422(self, app_client, admin_token):
        """13. Intentar registrar un nuevo evento tras alcanzar RECIBIDO_BARRANQUILLA debe fallar con 422."""
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

        res_after = app_client.post(
            f"/api/v1/logistica/shipments/{shp_id}/eventos",
            headers=_auth(admin_token),
            json={"event_type": "RECIBIDO_BOGOTA"},
        )
        assert res_after.status_code == 422
        assert "estado final de entrega" in res_after.text

    def test_eventos_concurrencia_idempotency_key(self, app_client, admin_token):
        """14. Clave de idempotencia única en shipment_events para peticiones concurrentes."""
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

        idem_key = f"KEY-{uuid.uuid4().hex}"
        payload = {"event_type": "RECIBIDO_MIAMI", "idempotency_key": idem_key}

        def _send():
            return app_client.post(
                f"/api/v1/logistica/shipments/{shp_id}/eventos",
                headers=_auth(admin_token),
                json=payload,
            )

        with ThreadPoolExecutor(max_workers=2) as ex:
            futs = [ex.submit(_send), ex.submit(_send)]
            results = [f.result() for f in futs]

        for r in results:
            assert r.status_code == 200

        with TestSessionLocal() as session:
            evs = session.query(ShipmentEvent).filter(ShipmentEvent.shipment_id == shp_id, ShipmentEvent.idempotency_key == idem_key).all()
            assert len(evs) == 1

    def test_ruta_directa_rechaza_eventos_de_miami_422(self, app_client, admin_token):
        """15. Paquete con ruta DIRECT_TO_BARRANQUILLA rechaza eventos de Miami con HTTP 422."""
        with TestSessionLocal() as session:
            sup_id = _create_supplier_db(session)
            sku_id = _create_sku_db(session)
            pec, _, _ = _create_pec_with_lines(session, sup_id, sku_id)
            pec_id = pec.id

        res = app_client.post(
            "/api/v1/logistica/shipments",
            headers=_auth(admin_token),
            json={
                "pec_id": pec_id,
                "carrier": "Amazon Direct",
                "tracking_number": f"TBA-DIR-{uuid.uuid4().hex[:8]}",
                "route_type": "DIRECT_TO_BARRANQUILLA",
            },
        )
        assert res.status_code == 200
        shp_id = res.json()["data"]["id"]
        assert res.json()["data"]["status_fise"] == "PREPARANDO_PROVEEDOR"

        # Intentar registrar evento de Miami
        res_miami = app_client.post(
            f"/api/v1/logistica/shipments/{shp_id}/eventos",
            headers=_auth(admin_token),
            json={"event_type": "ENVIADO_A_MIAMI"},
        )
        assert res_miami.status_code == 422
        assert "no permite eventos de escala Miami" in res_miami.text

    def test_ruta_directa_ciclo_completo(self, app_client, admin_token):
        """16. Ciclo directo completo para DIRECT_TO_BARRANQUILLA."""
        with TestSessionLocal() as session:
            sup_id = _create_supplier_db(session)
            sku_id = _create_sku_db(session)
            pec, _, _ = _create_pec_with_lines(session, sup_id, sku_id)
            pec_id = pec.id

        res = app_client.post(
            "/api/v1/logistica/shipments",
            headers=_auth(admin_token),
            json={
                "pec_id": pec_id,
                "carrier": "Amazon Direct",
                "tracking_number": f"TBA-DIR2-{uuid.uuid4().hex[:8]}",
                "route_type": "DIRECT_TO_BARRANQUILLA",
            },
        )
        shp_id = res.json()["data"]["id"]

        flujo_directo = ["EN_VUELO", "EN_DIAN", "LIBERADO_DIAN", "RECIBIDO_BARRANQUILLA"]
        for step in flujo_directo:
            r = app_client.post(
                f"/api/v1/logistica/shipments/{shp_id}/eventos",
                headers=_auth(admin_token),
                json={"event_type": step},
            )
            assert r.status_code == 200, f"Falló en {step}: {r.text}"

        with TestSessionLocal() as session:
            shp = session.query(Shipment).filter(Shipment.id == shp_id).first()
            assert shp.status_fise == "RECIBIDO_BARRANQUILLA"

    def test_identidad_normalizada_e_idempotencia(self, app_client, admin_token):
        """17. Variaciones de espacios y mayúsculas/minúsculas se normalizan y retornan el paquete de forma idempotente."""
        with TestSessionLocal() as session:
            sup_id = _create_supplier_db(session)
            sku_id = _create_sku_db(session)
            pec, _, _ = _create_pec_with_lines(session, sup_id, sku_id)
            pec_id = pec.id

        trk = f"trk-{uuid.uuid4().hex[:8]}"
        res1 = app_client.post(
            "/api/v1/logistica/shipments",
            headers=_auth(admin_token),
            json={"pec_id": pec_id, "carrier": "  FedEx Express  ", "tracking_number": f"  {trk.lower()}  "},
        )
        assert res1.status_code == 200
        shp_id1 = res1.json()["data"]["id"]

        # Segunda llamada con diferente casing y espacios
        res2 = app_client.post(
            "/api/v1/logistica/shipments",
            headers=_auth(admin_token),
            json={"pec_id": pec_id, "carrier": "fedex express", "tracking_number": trk.upper()},
        )
        assert res2.status_code == 200
        shp_id2 = res2.json()["data"]["id"]
        assert shp_id1 == shp_id2, "Debe retornar el mismo paquete recuperado de forma idempotente"

    def test_conflicto_identidad_incompatible_falla_409(self, app_client, admin_token):
        """18. Mismo carrier y tracking pero diferente PEC debe arrojar HTTP 409 Conflict."""
        with TestSessionLocal() as session:
            sup_id = _create_supplier_db(session)
            sku_id = _create_sku_db(session)
            pec1, _, _ = _create_pec_with_lines(session, sup_id, sku_id)
            pec2, _, _ = _create_pec_with_lines(session, sup_id, sku_id)
            pec1_id, pec2_id = pec1.id, pec2.id

        trk = f"TRK-CONF-{uuid.uuid4().hex[:8]}"
        res1 = app_client.post(
            "/api/v1/logistica/shipments",
            headers=_auth(admin_token),
            json={"pec_id": pec1_id, "carrier": "DHL", "tracking_number": trk},
        )
        assert res1.status_code == 200

        # Intentar crear con la otra PEC
        res2 = app_client.post(
            "/api/v1/logistica/shipments",
            headers=_auth(admin_token),
            json={"pec_id": pec2_id, "carrier": "DHL", "tracking_number": trk},
        )
        assert res2.status_code == 409
        assert "Conflicto de identidad" in res2.text

    def test_validacion_ubicacion_logistica(self, app_client, admin_token):
        """19. Validar ubicación inexistente, inactiva y compatibilidad con ruta."""
        with TestSessionLocal() as session:
            # Asegurar MIA_AGENCY_1
            mia_loc = session.query(LogisticsLocation).filter(LogisticsLocation.code == "MIA_AGENCY_1").first()
            if not mia_loc:
                mia_loc = LogisticsLocation(
                    code="MIA_AGENCY_1",
                    name="Miami Agency 1",
                    location_type="AGENCY_MIAMI",
                    city="Miami",
                    country="USA",
                    is_active=True,
                )
                session.add(mia_loc)
            else:
                mia_loc.is_active = True

            # Crear ubicación inactiva
            loc_inactiva = LogisticsLocation(
                code=f"INACT-{uuid.uuid4().hex[:4].upper()}",
                name="Agencia Inactiva",
                location_type="AGENCY_MIAMI",
                is_active=False,
            )
            session.add(loc_inactiva)
            session.commit()
            inact_id = loc_inactiva.id

        # 1. Ubicación inexistente
        res_non = app_client.post(
            "/api/v1/logistica/shipments",
            headers=_auth(admin_token),
            json={"carrier": "UPS", "tracking_number": f"TRK-{uuid.uuid4().hex[:6]}", "logistics_location_id": 999999},
        )
        assert res_non.status_code == 422
        assert "no encontrada" in res_non.text

        # 2. Ubicación inactiva
        res_ina = app_client.post(
            "/api/v1/logistica/shipments",
            headers=_auth(admin_token),
            json={"carrier": "UPS", "tracking_number": f"TRK-{uuid.uuid4().hex[:6]}", "logistics_location_id": inact_id},
        )
        assert res_ina.status_code == 422
        assert "no está activa" in res_ina.text

        # 3. Ubicación de Miami en ruta directa
        res_inc = app_client.post(
            "/api/v1/logistica/shipments",
            headers=_auth(admin_token),
            json={
                "carrier": "UPS",
                "tracking_number": f"TRK-{uuid.uuid4().hex[:6]}",
                "agency_id": "MIA_AGENCY_1",
                "route_type": "DIRECT_TO_BARRANQUILLA",
            },
        )
        assert res_inc.status_code == 422
        assert "no es compatible con la ruta directa" in res_inc.text

    def test_ubicacion_valida_activa_asigna_correctamente(self, app_client, admin_token):
        """20. Ubicación válida y activa se asigna correctamente al paquete."""
        with TestSessionLocal() as session:
            mia_loc = session.query(LogisticsLocation).filter(LogisticsLocation.code == "MIA_AGENCY_1").first()
            if not mia_loc:
                mia_loc = LogisticsLocation(
                    code="MIA_AGENCY_1",
                    name="Miami Agency 1",
                    location_type="AGENCY_MIAMI",
                    city="Miami",
                    country="USA",
                    is_active=True,
                )
                session.add(mia_loc)
                session.commit()

        res = app_client.post(
            "/api/v1/logistica/shipments",
            headers=_auth(admin_token),
            json={
                "carrier": "UPS",
                "tracking_number": f"TRK-LOC-{uuid.uuid4().hex[:6]}",
                "agency_id": "MIA_AGENCY_1",
                "route_type": "VIA_MIAMI",
            },
        )
        assert res.status_code == 200
        shp_id = res.json()["data"]["id"]

        with TestSessionLocal() as session:
            shp = session.query(Shipment).filter(Shipment.id == shp_id).first()
            assert shp.logistics_location_id is not None
            assert shp.agency_id == "MIA_AGENCY_1"

    def test_dos_post_shipments_concurrentes_mismo_carrier_tracking_lineas_identico_200(self, app_client, admin_token):
        """21. Dos POST /shipments simultáneos con mismo carrier, tracking, PEC y líneas.
        Ambos deben responder 200, retornar mismo shipment_id, exactamente 1 Shipment,
        exactamente 1 colección de ShipmentLine, sin eventos iniciales duplicados,
        y el despacho acumulado solo se cuenta una vez."""
        with TestSessionLocal() as session:
            sup_id = _create_supplier_db(session)
            sku_id = _create_sku_db(session)
            pec, pol1, _ = _create_pec_with_lines(session, sup_id, sku_id)
            pec_id = pec.id
            pol1_id = pol1.id

        trk = f"CONC-IDEM-{uuid.uuid4().hex[:6].upper()}"
        payload = {
            "pec_id": pec_id,
            "carrier": "FedEx",
            "tracking_number": trk,
            "route_type": "VIA_MIAMI",
            "lines": [{"po_line_id": pol1_id, "quantity": 5.0}],
        }

        def _post(_):
            return app_client.post(
                "/api/v1/logistica/shipments",
                headers=_auth(admin_token),
                json=payload,
            )

        with ThreadPoolExecutor(max_workers=2) as executor:
            res1, res2 = list(executor.map(_post, [1, 2]))

        assert res1.status_code == 200, f"Req 1 failed: {res1.text}"
        assert res2.status_code == 200, f"Req 2 failed: {res2.text}"

        id1 = res1.json()["data"]["id"]
        id2 = res2.json()["data"]["id"]
        assert id1 == id2, f"Deben retornar el mismo shipment_id: {id1} vs {id2}"

        # Verificar en base de datos
        with TestSessionLocal() as session:
            # Exactamente 1 Shipment
            shps = session.query(Shipment).filter(Shipment.tracking_number == trk).all()
            assert len(shps) == 1, f"Debe quedar exactamente 1 shipment en BD, hay {len(shps)}"
            shp = shps[0]

            # Exactamente 1 colección de ShipmentLine
            lines = session.query(ShipmentLine).filter(ShipmentLine.shipment_id == shp.id).all()
            assert len(lines) == 1, f"Debe haber exactamente 1 línea, hay {len(lines)}"
            assert Decimal(str(lines[0].quantity)) == Decimal("5.0")

            # Ningún evento inicial duplicado
            events = session.query(ShipmentEvent).filter(ShipmentEvent.shipment_id == shp.id).all()
            prep_events = [e for e in events if e.event_type == "PREPARANDO_PROVEEDOR"]
            mia_events = [e for e in events if e.event_type == "ENVIADO_A_MIAMI"]
            assert len(prep_events) == 1, f"Evento PREPARANDO_PROVEEDOR no debe duplicarse: {len(prep_events)}"
            assert len(mia_events) == 1, f"Evento ENVIADO_A_MIAMI no debe duplicarse: {len(mia_events)}"

            # El despacho acumulado solo se cuenta una vez (si se intentara despachar más en otro paquete, respeta el saldo)
            res_exceso = app_client.post(
                "/api/v1/logistica/shipments",
                headers=_auth(admin_token),
                json={
                    "pec_id": pec_id,
                    "carrier": "DHL",
                    "tracking_number": f"TRK-EXC-{uuid.uuid4().hex[:6]}",
                    "lines": [{"po_line_id": pol1_id, "quantity": 6.0}],
                },
            )
            assert res_exceso.status_code == 422

    def test_dos_post_shipments_concurrentes_mismo_carrier_tracking_incompatible_409(self, app_client, admin_token):
        """22. Dos POST /shipments simultáneos con mismo carrier y tracking pero payload incompatible.
        Una solicitud crea (200), la otra devuelve 409 Conflict; solo queda un paquete."""
        with TestSessionLocal() as session:
            sup_id = _create_supplier_db(session)
            sku_id = _create_sku_db(session)
            pec, pol1, _ = _create_pec_with_lines(session, sup_id, sku_id)
            pec_id = pec.id
            pol1_id = pol1.id

        trk = f"CONC-INCOMP-{uuid.uuid4().hex[:6].upper()}"
        payload_a = {
            "pec_id": pec_id,
            "carrier": "FedEx",
            "tracking_number": trk,
            "lines": [{"po_line_id": pol1_id, "quantity": 2.0}],
        }
        payload_b = {
            "pec_id": pec_id,
            "carrier": "FedEx",
            "tracking_number": trk,
            "lines": [{"po_line_id": pol1_id, "quantity": 3.0}],  # Diferente cantidad -> incompatible
        }

        def _send(p):
            return app_client.post(
                "/api/v1/logistica/shipments",
                headers=_auth(admin_token),
                json=p,
            )

        with ThreadPoolExecutor(max_workers=2) as executor:
            res_a, res_b = list(executor.map(_send, [payload_a, payload_b]))

        codes = {res_a.status_code, res_b.status_code}
        assert codes == {200, 409}, f"Esperaba {{200, 409}}, obtuvo {codes} ({res_a.text} / {res_b.text})"

        with TestSessionLocal() as session:
            shps = session.query(Shipment).filter(Shipment.tracking_number == trk).all()
            assert len(shps) == 1, f"Solo debe existir 1 paquete en base de datos, hay {len(shps)}"

    def test_reintento_secuencial_sin_lineas_contra_paquete_con_lineas_falla_409(self, app_client, admin_token):
        """23. Reintento secuencial sin líneas contra un paquete existente con líneas debe devolver 409, no 200."""
        with TestSessionLocal() as session:
            sup_id = _create_supplier_db(session)
            sku_id = _create_sku_db(session)
            pec, pol1, _ = _create_pec_with_lines(session, sup_id, sku_id)
            pec_id = pec.id
            pol1_id = pol1.id

        trk = f"SEC-NOLINE-{uuid.uuid4().hex[:6].upper()}"
        # 1. Crear con líneas
        res1 = app_client.post(
            "/api/v1/logistica/shipments",
            headers=_auth(admin_token),
            json={
                "pec_id": pec_id,
                "carrier": "FedEx",
                "tracking_number": trk,
                "lines": [{"po_line_id": pol1_id, "quantity": 4.0}],
            },
        )
        assert res1.status_code == 200

        # 2. Reintento con mismo carrier/tracking pero sin líneas
        res2 = app_client.post(
            "/api/v1/logistica/shipments",
            headers=_auth(admin_token),
            json={
                "pec_id": pec_id,
                "carrier": "FedEx",
                "tracking_number": trk,
            },
        )
        assert res2.status_code == 409, f"Esperaba 409, obtuvo {res2.status_code}: {res2.text}"

    def test_mismo_tracking_pec_pero_atributos_incompatibles_falla_409(self, app_client, admin_token):
        """24. Mismo tracking y PEC, pero route_type, ubicación o destino diferente debe devolver 409."""
        with TestSessionLocal() as session:
            sup_id = _create_supplier_db(session)
            sku_id = _create_sku_db(session)
            pec, pol1, _ = _create_pec_with_lines(session, sup_id, sku_id)
            pec_id = pec.id
            pol1_id = pol1.id

            loc1 = session.query(LogisticsLocation).filter(LogisticsLocation.code == "MIA_AGENCY_1").first()
            loc2 = session.query(LogisticsLocation).filter(LogisticsLocation.code == "MIA_AGENCY_2").first()
            loc1_id = loc1.id if loc1 else None
            loc2_id = loc2.id if loc2 else None

        # 1. Crear con VIA_MIAMI
        trk = f"ATTR-INCOMP-{uuid.uuid4().hex[:6].upper()}"
        res1 = app_client.post(
            "/api/v1/logistica/shipments",
            headers=_auth(admin_token),
            json={
                "pec_id": pec_id,
                "carrier": "DHL",
                "tracking_number": trk,
                "route_type": "VIA_MIAMI",
                "destination": "MIAMI",
                "logistics_location_id": loc1_id,
                "lines": [{"po_line_id": pol1_id, "quantity": 2.0}],
            },
        )
        assert res1.status_code == 200

        # Discrepancia en route_type -> 409
        res_route = app_client.post(
            "/api/v1/logistica/shipments",
            headers=_auth(admin_token),
            json={
                "pec_id": pec_id,
                "carrier": "DHL",
                "tracking_number": trk,
                "route_type": "DIRECT_TO_BARRANQUILLA",
                "lines": [{"po_line_id": pol1_id, "quantity": 2.0}],
            },
        )
        assert res_route.status_code == 409

        # Discrepancia en destination -> 409
        res_dest = app_client.post(
            "/api/v1/logistica/shipments",
            headers=_auth(admin_token),
            json={
                "pec_id": pec_id,
                "carrier": "DHL",
                "tracking_number": trk,
                "route_type": "VIA_MIAMI",
                "destination": "CALI",
                "lines": [{"po_line_id": pol1_id, "quantity": 2.0}],
            },
        )
        assert res_dest.status_code == 409

        # Discrepancia en logistics_location_id -> 409
        if loc2_id:
            res_loc = app_client.post(
                "/api/v1/logistica/shipments",
                headers=_auth(admin_token),
                json={
                    "pec_id": pec_id,
                    "carrier": "DHL",
                    "tracking_number": trk,
                    "route_type": "VIA_MIAMI",
                    "destination": "MIAMI",
                    "logistics_location_id": loc2_id,
                    "lines": [{"po_line_id": pol1_id, "quantity": 2.0}],
                },
            )
            assert res_loc.status_code == 409
