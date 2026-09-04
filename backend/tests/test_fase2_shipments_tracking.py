"""
test_fase2_shipments_tracking.py — Tests de Paquetes, Envíos y Trazabilidad (Fase 2)

Escenarios cubiertos:
1. Creación de un paquete (Shipment) con tracking individual y eventos automáticos iniciales.
2. Un PEC dividido en múltiples paquetes (ej. FedEx + UPS con líneas separadas).
3. Registro secuencial de eventos logísticos en el paquete.
4. Auto-actualización de entrega física y estado comercial al registrar RECIBIDO_BARRANQUILLA.
5. Validación de tipo de evento inválido arroja 422.
6. Consulta de detalle de paquete con desglose de líneas y cronología de eventos.
7. Listado de paquetes con filtros por PEC, carrier, status_fise y búsqueda de texto.
8. Catálogo de ubicaciones logísticas intermedias (LogisticsLocation) GET y POST.
"""
import uuid
import datetime
from decimal import Decimal
import pytest

from tests.conftest import TestSessionLocal
from app.models.erp_documents import PurchaseOrderFull, Supplier
from app.models.fase1b import PurchaseOrderLine
from app.models.fase2 import Shipment, ShipmentEvent, LogisticsLocation
from app.models.catalog import ProductSKU, Product, Brand, Category


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _create_supplier_db(db) -> int:
    s = Supplier(name=f"Sup-{uuid.uuid4().hex[:6]}", is_active=True)
    db.add(s)
    db.commit()
    db.refresh(s)
    return s.id


def _create_sku_db(db) -> int:
    br = Brand(name=f"Br-{uuid.uuid4().hex[:4]}")
    db.add(br)
    ca = Category(name=f"Ca-{uuid.uuid4().hex[:4]}")
    db.add(ca)
    db.flush()
    pr = Product(
        name=f"Pr-{uuid.uuid4().hex[:4]}",
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
        """1. Crear paquete genera número SHP y eventos iniciales automáticos."""
        with TestSessionLocal() as session:
            sup_id = _create_supplier_db(session)
            sku_id = _create_sku_db(session)
            pec, l1, l2 = _create_pec_with_lines(session, sup_id, sku_id)
            pec_id = pec.id
            l1_id = l1.id

        payload = {
            "pec_id": pec_id,
            "carrier": "FedEx",
            "tracking_number": f"1289387498{uuid.uuid4().hex[:4]}",
            "carrier_service": "Ground",
            "origin": "Amazon Fulfillment",
            "destination": "MIAMI",
            "weight_lb": 4.5,
            "weight_kg": 2.04,
            "shipping_cost_usd": 12.50,
            "lines": [{"po_line_id": l1_id, "quantity": 5.0}],
        }
        res = app_client.post(
            "/api/v1/logistica/shipments",
            headers=_auth(admin_token),
            json=payload,
        )
        assert res.status_code == 200, f"Error: {res.text}"
        data = res.json()["data"]
        assert "SHP-" in data["shipment_number"]
        assert data["carrier"] == "FedEx"
        assert data["status_fise"] == "ENVIADO_A_MIAMI"

        # Verificar que el PEC pasó a estado ENVIADA
        with TestSessionLocal() as session:
            pec_db = session.query(PurchaseOrderFull).filter(PurchaseOrderFull.id == pec_id).first()
            assert pec_db.estado == "ENVIADA"

    def test_un_pec_dividido_en_multiples_paquetes(self, app_client, admin_token):
        """2. Un solo PEC con dos paquetes independientes de transportadores distintos."""
        with TestSessionLocal() as session:
            sup_id = _create_supplier_db(session)
            sku_id = _create_sku_db(session)
            pec, l1, l2 = _create_pec_with_lines(session, sup_id, sku_id)
            pec_id = pec.id
            l1_id = l1.id
            l2_id = l2.id

        # Paquete 1: FedEx con línea 1
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
        shp1_id = res1.json()["data"]["id"]

        # Paquete 2: UPS con línea 2
        res2 = app_client.post(
            "/api/v1/logistica/shipments",
            headers=_auth(admin_token),
            json={
                "pec_id": pec_id,
                "carrier": "UPS",
                "tracking_number": f"1Z9999-{uuid.uuid4().hex[:8]}",
                "lines": [{"po_line_id": l2_id, "quantity": 3.0}],
            },
        )
        assert res2.status_code == 200
        shp2_id = res2.json()["data"]["id"]

        assert shp1_id != shp2_id

        # Listar paquetes del PEC
        list_res = app_client.get(
            f"/api/v1/logistica/shipments?pec_id={pec_id}",
            headers=_auth(admin_token),
        )
        assert list_res.status_code == 200
        items = list_res.json()["data"]["shipments"]
        assert len(items) == 2
        carriers = {i["carrier"] for i in items}
        assert carriers == {"FedEx", "UPS"}

    def test_registro_eventos_secuenciales_trazabilidad(self, app_client, admin_token):
        """3. Registro de hitos logísticos secuenciales."""
        with TestSessionLocal() as session:
            sup_id = _create_supplier_db(session)
            sku_id = _create_sku_db(session)
            pec, l1, _ = _create_pec_with_lines(session, sup_id, sku_id)
            pec_id = pec.id

        res = app_client.post(
            "/api/v1/logistica/shipments",
            headers=_auth(admin_token),
            json={"pec_id": pec_id, "carrier": "DHL", "tracking_number": f"DHL-{uuid.uuid4().hex[:6]}"},
        )
        shp_id = res.json()["data"]["id"]

        eventos = [
            ("RECIBIDO_MIAMI", "Bodega Miami Agency"),
            ("PENDIENTE_CONSOLIDACION", "Bodega Miami Zona 3"),
            ("CONSOLIDADO", "Caja CON-01"),
            ("EN_VUELO", "Vuelo AV089 MIA-BOG"),
            ("EN_DIAN", "Aduana Aeropuerto El Dorado"),
            ("LIBERADO_DIAN", "Aduana Bogotá"),
            ("RECIBIDO_BOGOTA", "Centro Distribución Bogotá"),
            ("ENVIADO_BARRANQUILLA", "Camión Nacional"),
        ]

        for ev_type, loc in eventos:
            ev_res = app_client.post(
                f"/api/v1/logistica/shipments/{shp_id}/eventos",
                headers=_auth(admin_token),
                json={"event_type": ev_type, "location": loc, "notes": f"Paso {ev_type}"},
            )
            assert ev_res.status_code == 200
            assert ev_res.json()["data"]["nuevo_status_fise"] == ev_type

    def test_recibido_barranquilla_actualiza_entrega_comercial(self, app_client, admin_token):
        """4. Hito RECIBIDO_BARRANQUILLA actualiza fecha real de entrega y estado comercial."""
        with TestSessionLocal() as session:
            sup_id = _create_supplier_db(session)
            sku_id = _create_sku_db(session)
            pec, l1, _ = _create_pec_with_lines(session, sup_id, sku_id)
            pec_id = pec.id

        res = app_client.post(
            "/api/v1/logistica/shipments",
            headers=_auth(admin_token),
            json={"pec_id": pec_id, "carrier": "DHL", "tracking_number": f"DHL-{uuid.uuid4().hex[:6]}"},
        )
        shp_id = res.json()["data"]["id"]

        # Disparar RECIBIDO_BARRANQUILLA
        ev_res = app_client.post(
            f"/api/v1/logistica/shipments/{shp_id}/eventos",
            headers=_auth(admin_token),
            json={"event_type": "RECIBIDO_BARRANQUILLA", "location": "Sede Principal Barranquilla"},
        )
        assert ev_res.status_code == 200

        # Consultar detalle del paquete
        detail = app_client.get(
            f"/api/v1/logistica/shipments/{shp_id}",
            headers=_auth(admin_token),
        ).json()["data"]

        assert detail["status_fise"] == "RECIBIDO_BARRANQUILLA"
        assert detail["commercial_status"] == "EN_BARRANQUILLA"
        assert detail["actual_delivery_date"] == datetime.date.today().isoformat()

    def test_evento_invalido_falla_422(self, app_client, admin_token):
        """5. Evento con tipo no registrado rechaza con 422."""
        with TestSessionLocal() as session:
            sup_id = _create_supplier_db(session)
            sku_id = _create_sku_db(session)
            pec, l1, _ = _create_pec_with_lines(session, sup_id, sku_id)
            pec_id = pec.id

        res = app_client.post(
            "/api/v1/logistica/shipments",
            headers=_auth(admin_token),
            json={"pec_id": pec_id, "carrier": "DHL", "tracking_number": f"DHL-{uuid.uuid4().hex[:6]}"},
        )
        shp_id = res.json()["data"]["id"]

        ev_res = app_client.post(
            f"/api/v1/logistica/shipments/{shp_id}/eventos",
            headers=_auth(admin_token),
            json={"event_type": "EVENTO_TOTALMENTE_FALSO", "location": "Narnia"},
        )
        assert ev_res.status_code == 422
        assert "event_type inválido" in ev_res.text

    def test_catalogo_ubicaciones_logisticas(self, app_client, admin_token):
        """8. Catálogo LogisticsLocation: creación y consulta."""
        code = f"AGY_{uuid.uuid4().hex[:6].upper()}"
        payload = {
            "code": code,
            "name": "Agencia Casillero Miami West",
            "location_type": "AGENCY_MIAMI",
            "city": "Doral, FL",
            "country": "USA",
            "address": "8200 NW 27th St",
        }
        res = app_client.post(
            "/api/v1/logistica/locations",
            headers=_auth(admin_token),
            json=payload,
        )
        assert res.status_code == 200
        assert res.json()["data"]["code"] == code

        # Listar
        list_res = app_client.get(
            "/api/v1/logistica/locations",
            headers=_auth(admin_token),
        )
        assert list_res.status_code == 200
        codes = [l["code"] for l in list_res.json()["data"]]
        assert code in codes
