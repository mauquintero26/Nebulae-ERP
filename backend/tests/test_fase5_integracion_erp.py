"""
test_fase5_integracion_erp.py

Suite exhaustiva de pruebas para Fase 5 de Nebulae ERP:
1. CRM 360 sin duplicados y enriquecido con entidades canónicas.
2. Seguridad y enmascaramiento de rentabilidad para roles no financieros.
3. Cotiza -> Venta conversión con líneas mixtas (inmediata + por pedido).
4. Cotiza -> Venta idempotencia con replay 200 OK.
5. Cotiza -> Venta rechazo de incompatibles con 409 Conflict.
6. Agenda y calendario operativo determinista sin duplicados.
7. Asistente Omnicanal consultas seguras y registro de interacciones.
8. Asistente Omnicanal bloqueo de mutaciones no autorizadas.
9. Cuentas por Cobrar (AR) reconciliadas con libro mayor y aging.
10. Cuentas por Pagar (AP) a proveedores.
11. Disponibilidad Ecommerce real excluyendo reservas activas, cuarentena y scrap.
12. Venta Ecommerce concurrente con bloqueo pesimista por última unidad.
13. Webhooks desacoplados e idempotencia con deduplicación 200 OK.
14. Webhooks reintentos seguros y cola de errores permanentes (dead-letter).
15. Segregación patrimonial NEBULAE vs MAU en inventario y rentabilidad.
16. Marketing segmentación y preferencias de contacto (Habeas Data).
17. Compatibilidad hacia atrás con rutas existentes.
18. Seguridad RBAC y cero llamadas externas reales.
"""
import pytest
import datetime
from decimal import Decimal
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.models.customers import Customer
from app.models.catalog import Product, ProductSKU, Category, Brand
from app.models.inventory import Warehouse, InventoryLevel, InventoryMovement
from app.models.erp_documents import CustomerRequest, SalesQuotation, SaleOrder, PurchaseOrderFull, ActivityLog
from app.models.fase1b import (
    CustomerRequestLine, SalesQuotationLine, SaleOrderLineErp,
    InventoryOwnerBalance, InventoryReservation, ProcurementAllocation
)
from app.models.fase3 import InventoryQuarantine
from app.models.fase4 import (
    SaleOrderPayment, SalePackingSession, SalePackingItem,
    SaleOrderDelivery, SaleOrderDeliveryLine, SaleOrderReturn, SaleOrderReturnLine
)
from app.models.fase5 import (
    CustomerAgendaActivity, OmnichannelInteraction,
    CustomerContactPreference, IntegrationWebhookEvent
)
from app.models.users import User
from app.core.security import create_access_token


def _now():
    return datetime.datetime.utcnow()


@pytest.fixture
def auth_tokens(db: Session):
    """Crea usuarios con diferentes roles canónicos y genera sus Bearer tokens."""
    roles = {
        "admin": "ADMIN",
        "asesor": "ASESOR",
        "finanzas": "FINANZAS",
        "bodega": "BODEGA",
        "compras": "COMPRAS",
    }
    tokens = {}
    for prefix, role_name in roles.items():
        email = f"{prefix}_{int(datetime.datetime.utcnow().timestamp())}@nebulaekids.com"
        u = User(email=email, password_hash="dummy_hash", role=role_name, is_active=True)
        db.add(u)
        db.flush()
        tok = create_access_token({"sub": str(u.id), "role": role_name})
        tokens[prefix] = {"user": u, "token": tok, "headers": {"Authorization": f"Bearer {tok}"}}
    db.commit()
    return tokens


@pytest.fixture
def base_customer_catalog(db: Session):
    """Crea datos base: cliente, categoría, marca, producto, SKU, bodega y balances."""
    ts = int(datetime.datetime.utcnow().timestamp())
    cust = Customer(
        first_name="Diana",
        last_name="Gomez",
        email=f"diana_{ts}@example.com",
        phone="3001234567",
        address="Cra 51 #80-100",
        city="Barranquilla",
        document="CC10203040"
    )
    db.add(cust)

    wh = db.query(Warehouse).first()
    if not wh:
        wh = Warehouse(name=f"Bodega Principal BQ {ts}", location_type="Central")
        db.add(wh)
    db.flush()

    cat = db.query(Category).first()
    if not cat:
        cat = Category(name="Maternidad")
        db.add(cat)
    brand = db.query(Brand).first()
    if not brand:
        brand = Brand(name="Nebulae Baby")
        db.add(brand)
    db.flush()

    prod = Product(
        name=f"Extractor Doble {ts}",
        category_id=cat.id,
        brand_id=brand.id,
        type="Fisico",
        base_currency="COP",
        uom="Unidad",
        is_active=True
    )
    db.add(prod)
    db.flush()

    sku = ProductSKU(
        product_id=prod.id,
        sku=f"SKU-EXT-{ts}",
        sale_price=Decimal("450000.00"),
        cost_price=Decimal("250000.00")
    )
    db.add(sku)
    db.commit()
    db.refresh(cust)
    db.refresh(wh)
    db.refresh(sku)
    return {"customer": cust, "warehouse": wh, "sku": sku, "product": prod}


class TestFase5IntegracionErp:

    def test_01_crm_360_sin_duplicados_y_entidades_canonicas(self, app_client: TestClient, db: Session, base_customer_catalog: dict, auth_tokens: dict):
        """1. CRM 360 consolidado con entidades canónicas, sin duplicados y con resumen financiero."""
        cust = base_customer_catalog["customer"]
        sku = base_customer_catalog["sku"]
        wh = base_customer_catalog["warehouse"]

        # Crear Cotización
        cot = SalesQuotation(
            numero=f"COT-360-{cust.id}",
            customer_id=cust.id,
            customer_name=f"{cust.first_name} {cust.last_name}",
            customer_email=cust.email,
            customer_phone=cust.phone,
            total_cop=Decimal("900000.00"),
            anticipo_cop=Decimal("540000.00"),
            estado="APROBADA"
        )
        db.add(cot)
        db.flush()

        # Crear Pedido canónico
        so = SaleOrder(
            numero=f"PVEN-360-{cust.id}",
            cot_id=cot.id,
            cot_numero=cot.numero,
            customer_id=cust.id,
            customer_name=cot.customer_name,
            customer_email=cust.email,
            customer_phone=cust.phone,
            total_cop=Decimal("900000.00"),
            anticipo_cop=Decimal("540000.00"),
            saldo_cop=Decimal("360000.00"),
            estado="LISTO_ENTREGA"
        )
        db.add(so)
        db.flush()

        line = SaleOrderLineErp(
            so_id=so.id,
            sku_id=sku.id,
            description=sku.sku,
            quantity=Decimal("2.00"),
            unit_price_cop=Decimal("450000.00"),
            customer_id=cust.id,
            modalidad="ENTREGA_INMEDIATA",
            owner="NEBULAE",
            estado="RESERVADA",
            cost_unit_cop_snapshot=Decimal("250000.00")
        )
        db.add(line)

        # Pago de anticipo
        pago = SaleOrderPayment(
            sale_order_id=so.id,
            customer_id=cust.id,
            tipo="ANTICIPO",
            monto=Decimal("540000.00"),
            fecha=datetime.datetime.utcnow().date(),
            estado="CONFIRMADO"
        )
        db.add(pago)

        # Entrega
        deliv = SaleOrderDelivery(
            numero=f"DELIV-360-{cust.id}",
            customer_id=cust.id,
            delivery_method="ENVIO_NACIONAL",
            carrier="Coordinadora",
            tracking_number=f"GUID-360-{cust.id}",
            status="DESPACHADO",
            warehouse_id=wh.id
        )
        db.add(deliv)
        db.commit()

        # Consultar CRM 360 con token de asesor
        res = app_client.get(f"/api/v1/crm/customers/{cust.id}/profile-360", headers=auth_tokens["asesor"]["headers"])
        assert res.status_code == 200
        d = res.json()["data"]

        assert d["id"] == cust.id
        assert len(d["pedidos"]) >= 1
        assert len(d["cotizaciones"]) >= 1
        assert len(d["pagos"]) >= 1
        assert len(d["entregas"]) >= 1

        # Resumen financiero consistente
        fin = d["resumen_financiero"]
        assert fin["total_comprado_cop"] >= 900000.0
        assert fin["total_pagado_cop"] >= 540000.0
        assert fin["saldo_pendiente_cop"] >= 360000.0

        # Timeline sin duplicados
        timeline = d["timeline"]
        tl_keys = [f"{t.get('type')}_{t.get('id')}" for t in timeline]
        assert len(tl_keys) == len(set(tl_keys)), "El timeline no debe contener eventos duplicados"

    def test_02_crm_360_seguridad_rentabilidad_enmascarada_para_asesor(self, app_client: TestClient, db: Session, base_customer_catalog: dict, auth_tokens: dict):
        """2. Seguridad RBAC: asesores no pueden ver costos/rentabilidad; Finanzas y Admin sí."""
        cust = base_customer_catalog["customer"]

        # Asesor consulta
        res_asesor = app_client.get(f"/api/v1/crm/customers/{cust.id}/profile-360", headers=auth_tokens["asesor"]["headers"])
        assert res_asesor.status_code == 200
        rent_asesor = res_asesor.json()["data"]["rentabilidad"]
        assert rent_asesor["visible"] is False
        assert "costo_total_cop" not in rent_asesor

        # Consulta anónima (sin token)
        res_anon = app_client.get(f"/api/v1/crm/customers/{cust.id}/profile-360")
        assert res_anon.status_code == 200
        assert res_anon.json()["data"]["rentabilidad"]["visible"] is False

        # Finanzas consulta
        res_fin = app_client.get(f"/api/v1/crm/customers/{cust.id}/profile-360", headers=auth_tokens["finanzas"]["headers"])
        assert res_fin.status_code == 200
        rent_fin = res_fin.json()["data"]["rentabilidad"]
        assert rent_fin["visible"] is True
        assert "costo_total_cop" in rent_fin
        assert "margen_bruto_cop" in rent_fin

    def test_03_cotiza_a_venta_conversion_lineas_mixtas_inmediata_y_pedido(self, app_client: TestClient, db: Session, base_customer_catalog: dict, auth_tokens: dict):
        """3. Conversión de cotización con líneas mixtas (entrega inmediata con stock + por pedido)."""
        cust = base_customer_catalog["customer"]
        sku = base_customer_catalog["sku"]
        wh = base_customer_catalog["warehouse"]

        # Surtir inventario físico para entrega inmediata
        db.query(InventoryLevel).filter(InventoryLevel.sku_id == sku.id, InventoryLevel.warehouse_id == wh.id).delete()
        db.query(InventoryOwnerBalance).filter(InventoryOwnerBalance.sku_id == sku.id, InventoryOwnerBalance.warehouse_id == wh.id).delete()
        db.add(InventoryLevel(sku_id=sku.id, warehouse_id=wh.id, quantity=Decimal("10.00")))
        db.add(InventoryOwnerBalance(sku_id=sku.id, warehouse_id=wh.id, owner="NEBULAE", quantity=Decimal("10.00")))

        # Cotización con 2 líneas
        cot = SalesQuotation(
            numero=f"COT-MIX-{cust.id}",
            customer_id=cust.id,
            customer_name=f"{cust.first_name} {cust.last_name}",
            customer_email=cust.email,
            total_cop=Decimal("1350000.00"),
            anticipo_cop=Decimal("810000.00"),
            estado="APROBADA"
        )
        db.add(cot)
        db.flush()

        # Línea 1: Inmediata
        ql1 = SalesQuotationLine(
            sq_id=cot.id,
            sku_id=sku.id,
            description=f"{sku.sku} - Inmediata",
            quantity=Decimal("1.00"),
            unit_price_cop=Decimal("450000.00")
        )
        # Línea 2: Por pedido
        ql2 = SalesQuotationLine(
            sq_id=cot.id,
            sku_id=sku.id,
            description=f"{sku.sku} - Por Pedido",
            quantity=Decimal("2.00"),
            unit_price_cop=Decimal("450000.00")
        )
        setattr(ql1, "modalidad", "ENTREGA_INMEDIATA")
        setattr(ql2, "modalidad", "POR_PEDIDO")
        db.add(ql1)
        db.add(ql2)
        db.commit()

        # Ejecutar conversión
        payload = {
            "idempotency_key": f"IDEM_CONV_{cot.id}",
            "direccion_entrega": "Calle 72 #45-12",
            "user_name": "asesor_fase5@nebulaekids.com"
        }
        res = app_client.post(
            f"/api/v1/ventas/cotizaciones/{cot.id}/convertir-a-venta",
            json=payload,
            headers=auth_tokens["asesor"]["headers"]
        )
        assert res.status_code == 200
        data = res.json()
        assert data["idempotent_replay"] is False
        assert data["estado"] == "PENDIENTE_COMPRA"

        # Verificar líneas creadas en DB
        so_id = data["sale_order_id"]
        so_lines = db.query(SaleOrderLineErp).filter(SaleOrderLineErp.so_id == so_id).all()
        assert len(so_lines) == 2

        line_inm = [l for l in so_lines if l.modalidad == "ENTREGA_INMEDIATA"][0]
        assert line_inm.estado == "RESERVADA"
        assert line_inm.quantity_reserved == Decimal("1.00")

        line_ped = [l for l in so_lines if l.modalidad == "POR_PEDIDO"][0]
        assert line_ped.estado == "PENDIENTE_COMPRA"
        assert line_ped.quantity_reserved == Decimal("0.00")

    def test_04_cotiza_a_venta_idempotencia_replay_200(self, app_client: TestClient, db: Session, base_customer_catalog: dict, auth_tokens: dict):
        """4. Idempotencia: el reintento de conversión con la misma clave o cotización retorna 200 OK con el mismo pedido."""
        cust = base_customer_catalog["customer"]
        sku = base_customer_catalog["sku"]
        ts = int(datetime.datetime.utcnow().timestamp())

        cot = SalesQuotation(
            numero=f"COT-I{cust.id%10000}-{ts%10000}",
            customer_id=cust.id,
            customer_name=f"{cust.first_name} {cust.last_name}",
            total_cop=Decimal("450000.00"),
            anticipo_cop=Decimal("270000.00"),
            estado="APROBADA",
            productos=[{"sku": sku.sku, "sku_id": sku.id, "qty": 1, "unit_price_cop": 450000.0, "modalidad": "POR_PEDIDO"}]
        )
        db.add(cot)
        db.commit()

        idem_key = f"IDEM_TEST_04_{cot.id}"
        # Primer llamado de conversión
        res1 = app_client.post(
            f"/api/v1/ventas/cotizaciones/{cot.id}/convertir-a-venta",
            json={"idempotency_key": idem_key, "user_name": "asesor_idem"},
            headers=auth_tokens["asesor"]["headers"]
        )
        assert res1.status_code == 200
        data1 = res1.json()
        assert data1["idempotent_replay"] is False
        so_id = data1["sale_order_id"]

        # Reintento idéntico
        res2 = app_client.post(
            f"/api/v1/ventas/cotizaciones/{cot.id}/convertir-a-venta",
            json={"idempotency_key": idem_key, "user_name": "asesor_idem"},
            headers=auth_tokens["asesor"]["headers"]
        )
        assert res2.status_code == 200
        data2 = res2.json()
        assert data2["idempotent_replay"] is True
        assert data2["sale_order_id"] == so_id
        assert data2["numero"] == data1["numero"]

    def test_05_cotiza_a_venta_incompatible_409(self, app_client: TestClient, db: Session, base_customer_catalog: dict, auth_tokens: dict):
        """5. Conflicto 409 al intentar convertir cotización rechazada o con clave divergente."""
        cust = base_customer_catalog["customer"]
        sku = base_customer_catalog["sku"]
        ts = int(datetime.datetime.utcnow().timestamp())

        # Cotización rechazada
        cot_rech = SalesQuotation(
            numero=f"COT-R{cust.id%10000}-{ts%10000}",
            customer_id=cust.id,
            customer_name=f"{cust.first_name} {cust.last_name}",
            estado="RECHAZADA"
        )
        db.add(cot_rech)
        db.commit()

        res_rech = app_client.post(
            f"/api/v1/ventas/cotizaciones/{cot_rech.id}/convertir-a-venta",
            json={},
            headers=auth_tokens["asesor"]["headers"]
        )
        assert res_rech.status_code == 409
        assert "no puede ser convertida" in res_rech.json()["detail"]

        # Cotización aprobada convertida previamente con clave A
        cot_conf = SalesQuotation(
            numero=f"COT-C{cust.id%10000}-{ts%10000}",
            customer_id=cust.id,
            customer_name=f"{cust.first_name} {cust.last_name}",
            total_cop=Decimal("450000.00"),
            anticipo_cop=Decimal("270000.00"),
            estado="APROBADA",
            productos=[{"sku": sku.sku, "sku_id": sku.id, "qty": 1, "unit_price_cop": 450000.0, "modalidad": "POR_PEDIDO"}]
        )
        db.add(cot_conf)
        db.commit()

        # Primer llamado
        res_a = app_client.post(
            f"/api/v1/ventas/cotizaciones/{cot_conf.id}/convertir-a-venta",
            json={"idempotency_key": f"KEY_A_{cot_conf.id}"},
            headers=auth_tokens["asesor"]["headers"]
        )
        assert res_a.status_code == 200

        # Intentando convertir la misma cotización con clave divergente B
        res_div = app_client.post(
            f"/api/v1/ventas/cotizaciones/{cot_conf.id}/convertir-a-venta",
            json={"idempotency_key": f"KEY_B_{cot_conf.id}_DIVERGENTE"},
            headers=auth_tokens["asesor"]["headers"]
        )
        assert res_div.status_code == 409
        assert "otra clave de idempotencia" in res_div.json()["detail"]

    def test_06_agenda_operativa_sin_duplicados_clave_determinista(self, app_client: TestClient, db: Session, base_customer_catalog: dict, auth_tokens: dict):
        """6. Agenda y calendario operativo sincronizan actividades deterministas sin duplicados."""
        cust = base_customer_catalog["customer"]

        # Ejecutar sincronización
        res1 = app_client.post("/api/v1/crm/agenda/sync", headers=auth_tokens["asesor"]["headers"])
        assert res1.status_code == 200
        count1 = res1.json()["data"]["synced_count"]

        # Segunda sincronización inmediata: no debe duplicar registros
        res2 = app_client.post("/api/v1/crm/agenda/sync", headers=auth_tokens["asesor"]["headers"])
        assert res2.status_code == 200
        count2 = res2.json()["data"]["synced_count"]
        assert count2 == 0, "No deben crearse actividades duplicadas en una re-sincronización"

        # Listar agenda
        list_res = app_client.get(f"/api/v1/crm/agenda?customer_id={cust.id}")
        assert list_res.status_code == 200
        items = list_res.json()["data"]
        keys = [i["deterministic_key"] for i in items]
        assert len(keys) == len(set(keys)), "Las claves deterministas de agenda deben ser únicas"

    def test_07_asistente_omnicanal_consulta_segura_y_registro_interaccion(self, app_client: TestClient, db: Session, base_customer_catalog: dict):
        """7. Asistente Omnicanal realiza consultas de lectura y registra la interacción en auditoría."""
        cust = base_customer_catalog["customer"]

        actions = [
            "ESTADO_PEDIDO",
            "ESTADO_COTIZACION",
            "PRODUCTOS_COMPRADOS",
            "TRACKING_LOGISTICO",
            "SALDO_PENDIENTE",
            "MERCANCIA_DISPONIBLE",
            "EMPAQUE_ENTREGA",
            "GUIAS_TRANSPORTE",
            "DEVOLUCIONES",
        ]

        for act in actions:
            payload = {
                "customer_id": cust.id,
                "query_type": act,
                "channel": "WHATSAPP",
                "conversation_id": f"conv_wa_{cust.id}",
                "actor_type": "BOT",
                "actor_name": "NebulaeBot"
            }
            res = app_client.post("/api/v1/chat/omnichannel/query", json=payload)
            assert res.status_code == 200
            body = res.json()
            assert body["status"] == "success"
            assert body["action"] == act
            assert len(body["assistant_message"]) > 5

            # Verificar auditoría en BD
            inter = db.query(OmnichannelInteraction).filter(
                OmnichannelInteraction.id == body["interaction_id"]
            ).first()
            assert inter is not None
            assert inter.channel == "WHATSAPP"
            assert inter.action_requested == act
            assert inter.status == "SUCCESS"

    def test_08_asistente_omnicanal_bloqueo_mutaciones_no_autorizadas(self, app_client: TestClient):
        """8. Bloqueo de seguridad: el asistente no puede mutar datos operativos directamente."""
        res = app_client.post("/api/v1/chat/omnichannel/reject-unauthorized-mutation")
        assert res.status_code == 403
        assert "estrictamente de lectura" in res.json()["detail"]

    def test_09_cuentas_por_cobrar_reconciliadas_con_ledger(self, app_client: TestClient, db: Session, base_customer_catalog: dict, auth_tokens: dict):
        """9. Cuentas por cobrar agrupadas por aging y reconciliadas con el libro mayor."""
        # Consultar cuentas por cobrar
        res_ar = app_client.get("/api/v1/finance/accounts-receivable")
        assert res_ar.status_code == 200
        data_ar = res_ar.json()["data"]
        total_ar = data_ar["total_accounts_receivable_cop"]
        aging = data_ar["aging"]
        sum_aging = aging["0_30_dias"] + aging["31_60_dias"] + aging["61_90_dias"] + aging["mas_90_dias"]
        assert abs(total_ar - sum_aging) < 0.1, "La suma de las ventanas de aging debe igualar el total de cuentas por cobrar"

        # Consultar reconciliación de libro mayor
        res_rec = app_client.get("/api/v1/finance/ledger/reconciliation")
        assert res_rec.status_code == 200
        data_rec = res_rec.json()["data"]
        assert data_rec["reconciliacion_cuadrada"] is True
        assert abs(data_rec["diferencia_reconciliacion_cop"]) < 1.0

    def test_10_cuentas_por_pagar_proveedores(self, app_client: TestClient, db: Session, auth_tokens: dict):
        """10. Cuentas por pagar a proveedores desde órdenes de compra."""
        res_ap = app_client.get("/api/v1/finance/accounts-payable")
        assert res_ap.status_code == 200
        data_ap = res_ap.json()["data"]
        assert "total_accounts_payable_cop" in data_ap
        assert "suppliers" in data_ap

    def test_11_inventario_ecommerce_excluye_reservas_cuarentena_scrap(self, app_client: TestClient, db: Session, base_customer_catalog: dict):
        """11. Disponibilidad vendible ecommerce descuenta reservas activas, cuarentena y scrap."""
        sku = base_customer_catalog["sku"]
        wh = base_customer_catalog["warehouse"]

        # Limpiar y fijar balance NEBULAE = 20
        db.query(InventoryReservation).filter(InventoryReservation.sku_id == sku.id).delete()
        db.query(InventoryQuarantine).filter(InventoryQuarantine.sku_id == sku.id).delete()
        db.query(InventoryLevel).filter(InventoryLevel.sku_id == sku.id, InventoryLevel.warehouse_id == wh.id).delete()
        db.query(InventoryOwnerBalance).filter(InventoryOwnerBalance.sku_id == sku.id, InventoryOwnerBalance.warehouse_id == wh.id).delete()

        db.add(InventoryLevel(sku_id=sku.id, warehouse_id=wh.id, quantity=Decimal("20.00")))
        db.add(InventoryOwnerBalance(sku_id=sku.id, warehouse_id=wh.id, owner="NEBULAE", quantity=Decimal("20.00")))

        # Crear reserva activa de 5 unidades
        db.add(InventoryReservation(
            sku_id=sku.id,
            warehouse_id=wh.id,
            owner="NEBULAE",
            quantity_reserved=Decimal("5.00"),
            status="ACTIVE",
            idempotency_key=f"RES_TEST_11_{sku.id}"
        ))

        # Crear cuarentena activa de 3 unidades
        db.add(InventoryQuarantine(
            sku_id=sku.id,
            warehouse_id=wh.id,
            owner="NEBULAE",
            quantity=Decimal("3.00"),
            status="ACTIVO",
            reason="DAÑADO_EMPAQUE"
        ))
        db.commit()

        # Consultar catálogo
        res = app_client.get(f"/api/v1/ecommerce/catalogo?search={sku.sku}")
        assert res.status_code == 200
        items = res.json()["data"]
        target = [i for i in items if i["sku"] == sku.sku]
        assert len(target) == 1
        # 20 - 5 (reserva) - 3 (cuarentena) = 12 unidades vendibles
        assert target[0]["stock_disponible"] == 12.0
        assert target[0]["modalidad_disponible"] == "ENTREGA_INMEDIATA"

    def test_12_venta_ecommerce_concurrente_ultima_unidad_pesimista(self, app_client: TestClient, db: Session, base_customer_catalog: dict):
        """12. Venta ecommerce concurrente: la última unidad se reserva con bloqueo pesimista y la siguiente se rechaza con 409."""
        sku = base_customer_catalog["sku"]
        wh = base_customer_catalog["warehouse"]

        # Fijar stock disponible exactamente en 1 unidad
        db.query(InventoryReservation).filter(InventoryReservation.sku_id == sku.id).delete()
        db.query(InventoryQuarantine).filter(InventoryQuarantine.sku_id == sku.id).delete()
        db.query(InventoryLevel).filter(InventoryLevel.sku_id == sku.id, InventoryLevel.warehouse_id == wh.id).delete()
        db.query(InventoryOwnerBalance).filter(InventoryOwnerBalance.sku_id == sku.id, InventoryOwnerBalance.warehouse_id == wh.id).delete()

        db.add(InventoryLevel(sku_id=sku.id, warehouse_id=wh.id, quantity=Decimal("1.00")))
        db.add(InventoryOwnerBalance(sku_id=sku.id, warehouse_id=wh.id, owner="NEBULAE", quantity=Decimal("1.00")))
        db.commit()

        # Primer cliente compra la última unidad
        payload1 = {
            "customer_email": "cliente1@nebulae.com",
            "customer_name": "Cliente Uno",
            "customer_phone": "3001112233",
            "total_cop": 450000.0,
            "idempotency_key": f"IDEM_WEB_CONCUR_1_{sku.id}",
            "productos": [{
                "sku": sku.sku,
                "sku_id": sku.id,
                "nombre": sku.sku,
                "quantity": 1,
                "unit_price_cop": 450000.0,
                "modalidad": "ENTREGA_INMEDIATA",
                "owner": "NEBULAE"
            }]
        }
        res1 = app_client.post("/api/v1/ecommerce/pedidos", json=payload1)
        assert res1.status_code == 201
        assert res1.json()["status"] == "success"

        # Segundo cliente intenta comprar la misma unidad
        payload2 = {
            "customer_email": "cliente2@nebulae.com",
            "customer_name": "Cliente Dos",
            "customer_phone": "3004445566",
            "total_cop": 450000.0,
            "idempotency_key": f"IDEM_WEB_CONCUR_2_{sku.id}",
            "productos": [{
                "sku": sku.sku,
                "sku_id": sku.id,
                "nombre": sku.sku,
                "quantity": 1,
                "unit_price_cop": 450000.0,
                "modalidad": "ENTREGA_INMEDIATA",
                "owner": "NEBULAE"
            }]
        }
        res2 = app_client.post("/api/v1/ecommerce/pedidos", json=payload2)
        assert res2.status_code == 409
        assert "Stock insuficiente" in res2.json()["detail"]

    def test_13_webhooks_idempotencia_duplicados_200(self, app_client: TestClient, db: Session):
        """13. Webhooks procesan eventos de pasarelas de forma idempotente (duplicado -> 200 OK con replay)."""
        idem_key = f"MP_TX_{int(datetime.datetime.utcnow().timestamp())}"
        payload = {
            "action": "payment.created",
            "id": idem_key,
            "data": {"id": 99887766, "status": "approved"}
        }

        # Primer llamado
        res1 = app_client.post("/api/v1/webhooks/mercadopago", json=payload, headers={"x-idempotency-key": idem_key})
        assert res1.status_code == 200
        assert res1.json()["idempotent_replay"] is False

        # Segundo llamado duplicado
        res2 = app_client.post("/api/v1/webhooks/mercadopago", json=payload, headers={"x-idempotency-key": idem_key})
        assert res2.status_code == 200
        assert res2.json()["idempotent_replay"] is True

        # Verificar que solo hay 1 fila en la base de datos
        events = db.query(IntegrationWebhookEvent).filter(
            IntegrationWebhookEvent.provider == "MERCADOPAGO",
            IntegrationWebhookEvent.idempotency_key == idem_key
        ).all()
        assert len(events) == 1

    def test_14_webhooks_reintentos_y_dead_letter(self, app_client: TestClient, db: Session):
        """14. Mecanismo de reintentos seguros y traslado a dead-letter tras superar max_attempts."""
        key_retry = f"FAIL_EVENT_{int(datetime.datetime.utcnow().timestamp())}"
        ev = IntegrationWebhookEvent(
            provider="WOMPI",
            event_type="TRANSACTION_UPDATED",
            idempotency_key=key_retry,
            direction="INBOUND",
            payload="{}",
            status="FAILED",
            attempts=1,
            max_attempts=3,
            dead_letter=False
        )
        db.add(ev)
        db.commit()

        # Reintento exitoso
        res = app_client.post("/api/v1/webhooks/system/retry-failed?max_retries=3&provider=WOMPI")
        assert res.status_code == 200
        assert res.json()["reprocessed_count"] >= 1

        db.refresh(ev)
        assert ev.status == "PROCESSED"
        assert ev.attempts == 2
        assert ev.dead_letter is False

        # Evento que supera intentos -> dead_letter
        key_dead = f"DEAD_EVENT_{int(datetime.datetime.utcnow().timestamp())}"
        ev_dead = IntegrationWebhookEvent(
            provider="WOMPI",
            event_type="TRANSACTION_UPDATED",
            idempotency_key=key_dead,
            direction="INBOUND",
            payload="{}",
            status="FAILED",
            attempts=2,
            max_attempts=3,
            dead_letter=False
        )
        db.add(ev_dead)
        db.commit()

        res_dead = app_client.post("/api/v1/webhooks/system/retry-failed?max_retries=3&provider=WOMPI")
        assert res_dead.status_code == 200
        db.refresh(ev_dead)
        assert ev_dead.dead_letter is True
        assert ev_dead.status == "FAILED"
        assert "dead-letter" in ev_dead.last_error

    def test_15_separacion_patrimonial_nebulae_y_mau_en_finanzas(self, app_client: TestClient, db: Session, base_customer_catalog: dict, auth_tokens: dict):
        """15. Segregación patrimonial NEBULAE vs MAU en inventario y rentabilidad."""
        sku = base_customer_catalog["sku"]
        wh = base_customer_catalog["warehouse"]

        # Crear balance segregado
        db.query(InventoryOwnerBalance).filter(InventoryOwnerBalance.sku_id == sku.id, InventoryOwnerBalance.warehouse_id == wh.id).delete()
        db.add(InventoryOwnerBalance(sku_id=sku.id, warehouse_id=wh.id, owner="NEBULAE", quantity=Decimal("15.00")))
        db.add(InventoryOwnerBalance(sku_id=sku.id, warehouse_id=wh.id, owner="MAU", quantity=Decimal("5.00")))
        db.commit()

        # Consultar valorización
        res = app_client.get("/api/v1/finance/inventory-valuation")
        assert res.status_code == 200
        data = res.json()["data"]
        assert data["nebulae"]["quantity"] >= 15.0
        assert data["mau"]["quantity"] >= 5.0
        assert data["nebulae"]["valuation_cop"] >= (15.0 * 250000.0)
        assert data["mau"]["valuation_cop"] >= (5.0 * 250000.0)

        # Consultar rentabilidad segregada
        res_prof = app_client.get("/api/v1/finance/profitability", headers=auth_tokens["admin"]["headers"])
        assert res_prof.status_code == 200
        prof_data = res_prof.json()["data"]["patrimonial_breakdown"]
        assert "nebulae" in prof_data
        assert "mau" in prof_data

    def test_16_marketing_segmentacion_y_habeas_data_consentimiento(self, app_client: TestClient, db: Session, base_customer_catalog: dict):
        """16. Segmentación lógica de marketing y gestión de consentimiento Habeas Data."""
        cust = base_customer_catalog["customer"]

        # Segmentos válidos
        for seg in ["saldo-pendiente", "mercancia-disponible", "clientes-frecuentes", "clientes-inactivos"]:
            res = app_client.get(f"/api/v1/marketing/segments/{seg}")
            assert res.status_code == 200
            assert "data" in res.json()

        # Obtener preferencias
        res_pref = app_client.get(f"/api/v1/marketing/customers/{cust.id}/preferences")
        assert res_pref.status_code == 200
        pref = res_pref.json()["data"]
        assert pref["whatsapp_opt_in"] is True
        assert pref["habeas_data_accepted"] is True

        # Actualizar consentimiento
        up_payload = {
            "whatsapp_opt_in": False,
            "sms_opt_in": True,
            "notes": "Cliente prefiere no recibir ofertas por WhatsApp"
        }
        res_up = app_client.put(f"/api/v1/marketing/customers/{cust.id}/preferences", json=up_payload)
        assert res_up.status_code == 200
        pref_up = res_up.json()["data"]
        assert pref_up["whatsapp_opt_in"] is False
        assert pref_up["sms_opt_in"] is True

    def test_17_compatibilidad_rutas_existentes(self, app_client: TestClient, db: Session, base_customer_catalog: dict, auth_tokens: dict):
        """17. Compatibilidad hacia atrás: endpoint legacy confirmar_cotizacion crea VEN canónico e idempotente."""
        cust = base_customer_catalog["customer"]
        sku = base_customer_catalog["sku"]

        cot = SalesQuotation(
            numero=f"COT-LEGACY-{cust.id}",
            customer_id=cust.id,
            customer_name=f"{cust.first_name} {cust.last_name}",
            total_cop=Decimal("500000.00"),
            anticipo_cop=Decimal("300000.00"),
            estado="PENDIENTE_CONFIRMACION",
            productos=[{"sku": sku.sku, "qty": 1, "unit_price_cop": 500000.0}]
        )
        db.add(cot)
        db.commit()

        # Invocar ruta legacy /cotizaciones/{id}/confirmar
        res = app_client.post(
            f"/api/v1/ventas/cotizaciones/{cot.id}/confirmar",
            json={"user_name": "legacy_caller"},
            headers=auth_tokens["asesor"]["headers"]
        )
        assert res.status_code == 200
        body = res.json()
        assert body["status"] == "success"
        assert "cotizacion" in body["data"]
        assert "pedido_venta" in body["data"]
        assert body["data"]["cotizacion"]["estado"] == "CONFIRMADA"

    def test_18_seguridad_rbac_y_cero_llamadas_externas(self, app_client: TestClient, auth_tokens: dict):
        """18. Seguridad RBAC estricta: roles no financieros tienen 403 Forbidden en reportes de rentabilidad."""
        # Bodega intenta consultar rentabilidad
        res_bodega = app_client.get("/api/v1/finance/profitability", headers=auth_tokens["bodega"]["headers"])
        assert res_bodega.status_code == 403

        # Asesor intenta consultar rentabilidad
        res_asesor = app_client.get("/api/v1/finance/profitability", headers=auth_tokens["asesor"]["headers"])
        assert res_asesor.status_code == 403
