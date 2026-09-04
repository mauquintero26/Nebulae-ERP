"""
test_fase3_reservas_disponibilidad.py — Disponibilidad Derivada y Reservas de Inventario (Fase 3).

Escenarios cubiertos:
1. Cálculo matemático exacto de disponibilidad derivada:
   disponible = stock_fisico - reservas_activas - cuarentena_activa
2. Creación de reserva exitosa (HTTP 201 Created):
   - Bloquea stock derivado, reduciendo stock_disponible.
   - stock_fisico permanece inalterado.
3. Rechazo de reserva cuando excede disponibilidad (HTTP 409 Conflict):
   - Concurrencia o sobreventa evitada por SELECT FOR UPDATE.
4. Concurrencia pesimista:
   - Dos solicitudes concurrentes por la última unidad disponible:
     exactamente una tiene éxito (201) y la otra es rechazada (409).
5. Liberación de reserva (/reservas/{id}/liberar):
   - Restaura inmediatamente la disponibilidad para ventas posteriores.
6. Conversión de reserva en despacho (/reservas/{id}/convertir):
   - Deduce el stock físico (InventoryLevel).
   - Deduce el balance del propietario (InventoryOwnerBalance).
   - Genera movimiento de Kárdex OUT.
   - Marca la reserva como CONVERTED.
7. Rechazo de operaciones en reservas no activas (409 Conflict).
"""
import uuid
import datetime
from decimal import Decimal
from concurrent.futures import ThreadPoolExecutor
import pytest
from sqlalchemy import select

from app.models.catalog import Product, ProductSKU, Brand, Category
from app.models.inventory import Warehouse, InventoryLevel, InventoryMovement
from app.models.fase1b import InventoryOwnerBalance, InventoryReservation
from app.models.fase3 import InventoryQuarantine


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _setup_reserva_scenario(db, physical_qty=10, quarantine_qty=2):
    now = datetime.datetime.utcnow()
    br = Brand(name=f"Br-Rsv-{uuid.uuid4().hex[:6]}")
    db.add(br)
    ca = Category(name=f"Ca-Rsv-{uuid.uuid4().hex[:6]}")
    db.add(ca)
    db.flush()

    prod = Product(name=f"Prod-Rsv-{uuid.uuid4().hex[:6]}", brand_id=br.id, category_id=ca.id, type="Fisico", base_currency="USD", uom="Ud")
    db.add(prod)
    db.flush()

    sku = ProductSKU(product_id=prod.id, sku=f"SKU-RSV-{uuid.uuid4().hex[:6].upper()}", cost_price=20.0, sale_price=45.0)
    db.add(sku)

    wh = Warehouse(name=f"Bodega-Rsv-{uuid.uuid4().hex[:6]}", location_type="Central")
    db.add(wh)
    db.flush()

    # Stock físico
    lvl = InventoryLevel(sku_id=sku.id, warehouse_id=wh.id, quantity=physical_qty)
    db.add(lvl)

    # Balance Nebulae
    bal = InventoryOwnerBalance(
        sku_id=sku.id,
        warehouse_id=wh.id,
        owner="NEBULAE",
        quantity=Decimal(str(physical_qty)),
        updated_at=now
    )
    db.add(bal)

    # Cuarentena si aplica
    if quarantine_qty > 0:
        db.add(InventoryQuarantine(
            sku_id=sku.id,
            warehouse_id=wh.id,
            quantity=Decimal(str(quarantine_qty)),
            reason="Prueba cuarentena activa",
            status="ACTIVO",
            created_at=now
        ))

    db.commit()

    return {"product": prod, "sku": sku, "warehouse": wh, "lvl": lvl, "bal": bal}


class TestFase3ReservasDisponibilidad:

    def test_calculo_disponibilidad_derivada(self, app_client, admin_token, db):
        """Valida que disponible = fisico (10) - reservado (0) - cuarentena (2) = 8."""
        data = _setup_reserva_scenario(db, physical_qty=10, quarantine_qty=2)

        resp = app_client.get(
            f"/api/v1/inventory/disponibilidad/{data['sku'].id}?warehouse_id={data['warehouse'].id}",
            headers=_auth(admin_token)
        )
        assert resp.status_code == 200
        d = resp.json()["data"]
        assert d["stock_fisico"] == 10.0
        assert d["stock_cuarentena"] == 2.0
        assert d["stock_reservado"] == 0.0
        assert d["stock_disponible"] == 8.0

    def test_crear_reserva_reduce_disponible_sin_cambiar_fisico(self, app_client, admin_token, db):
        """Crear una reserva de 3 unidades reduce disponible a 5 manteniendo stock_fisico en 10."""
        data = _setup_reserva_scenario(db, physical_qty=10, quarantine_qty=2)

        res_resp = app_client.post(
            "/api/v1/inventory/reservas",
            json={
                "sku_id": data["sku"].id,
                "warehouse_id": data["warehouse"].id,
                "quantity": 3,
                "owner": "NEBULAE",
                "notes": "Reserva pedido de venta PVEN-001"
            },
            headers=_auth(admin_token)
        )
        assert res_resp.status_code == 201
        res_data = res_resp.json()["data"]
        assert res_data["quantity_reserved"] == 3.0
        assert res_data["status"] == "ACTIVE"

        # Verificar disponibilidad actualizada
        disp_resp = app_client.get(
            f"/api/v1/inventory/disponibilidad/{data['sku'].id}?warehouse_id={data['warehouse'].id}",
            headers=_auth(admin_token)
        )
        d = disp_resp.json()["data"]
        assert d["stock_fisico"] == 10.0
        assert d["stock_reservado"] == 3.0
        assert d["stock_cuarentena"] == 2.0
        assert d["stock_disponible"] == 5.0

    def test_reserva_insuficiente_falla_409(self, app_client, admin_token, db):
        """Intentar reservar más unidades que las disponibles falla con 409 Conflict."""
        data = _setup_reserva_scenario(db, physical_qty=10, quarantine_qty=2)  # disponible = 8

        res_resp = app_client.post(
            "/api/v1/inventory/reservas",
            json={
                "sku_id": data["sku"].id,
                "warehouse_id": data["warehouse"].id,
                "quantity": 9,  # Solo hay 8
                "owner": "NEBULAE",
            },
            headers=_auth(admin_token)
        )
        assert res_resp.status_code == 409
        assert "insuficiente" in res_resp.text.lower()

    def test_concurrencia_reservas_compitiendo_por_ultima_unidad(self, app_client, admin_token, db):
        """Dos hilos concurrentes intentan reservar 1 unidad cuando solo queda 1: uno 201, otro 409."""
        data = _setup_reserva_scenario(db, physical_qty=1, quarantine_qty=0)  # disponible = 1
        sku_id = int(data["sku"].id)
        warehouse_id = int(data["warehouse"].id)

        def _try_reserve():
            return app_client.post(
                "/api/v1/inventory/reservas",
                json={
                    "sku_id": sku_id,
                    "warehouse_id": warehouse_id,
                    "quantity": 1,
                    "owner": "NEBULAE",
                },
                headers=_auth(admin_token)
            )

        with ThreadPoolExecutor(max_workers=2) as executor:
            fut1 = executor.submit(_try_reserve)
            fut2 = executor.submit(_try_reserve)
            res1 = fut1.result()
            res2 = fut2.result()

        codes = [res1.status_code, res2.status_code]
        assert 201 in codes, f"Ninguna reserva tuvo éxito: {codes}"
        assert 409 in codes, f"Ambas reservas tuvieron éxito (sobreventa!): {codes}"

        # Verificar que el disponible final sea exactamente 0
        disp_resp = app_client.get(
            f"/api/v1/inventory/disponibilidad/{data['sku'].id}?warehouse_id={data['warehouse'].id}",
            headers=_auth(admin_token)
        )
        assert disp_resp.json()["data"]["stock_disponible"] == 0.0

    def test_liberar_reserva_restaura_disponibilidad(self, app_client, admin_token, db):
        """Liberar una reserva incrementa de nuevo el stock disponible."""
        data = _setup_reserva_scenario(db, physical_qty=5, quarantine_qty=0)

        # Crear reserva de 2
        res = app_client.post(
            "/api/v1/inventory/reservas",
            json={"sku_id": data["sku"].id, "warehouse_id": data["warehouse"].id, "quantity": 2, "owner": "NEBULAE"},
            headers=_auth(admin_token)
        ).json()["data"]

        # Liberar reserva
        lib_resp = app_client.post(f"/api/v1/inventory/reservas/{res['id']}/liberar", headers=_auth(admin_token))
        assert lib_resp.status_code == 200
        assert lib_resp.json()["data"]["status"] == "RELEASED"

        # Disponibilidad vuelve a ser 5
        disp_resp = app_client.get(
            f"/api/v1/inventory/disponibilidad/{data['sku'].id}?warehouse_id={data['warehouse'].id}",
            headers=_auth(admin_token)
        )
        assert disp_resp.json()["data"]["stock_disponible"] == 5.0

    def test_convertir_reserva_a_entrega_deduce_fisico_y_crea_kardex_out(self, app_client, admin_token, db):
        """Convertir la reserva deduce stock físico, actualiza balance de propietario y genera Kárdex OUT."""
        data = _setup_reserva_scenario(db, physical_qty=5, quarantine_qty=0)

        res = app_client.post(
            "/api/v1/inventory/reservas",
            json={"sku_id": data["sku"].id, "warehouse_id": data["warehouse"].id, "quantity": 2, "owner": "NEBULAE"},
            headers=_auth(admin_token)
        ).json()["data"]

        conv_resp = app_client.post(f"/api/v1/inventory/reservas/{res['id']}/convertir", headers=_auth(admin_token))
        assert conv_resp.status_code == 200
        assert conv_resp.json()["data"]["status"] == "CONVERTED"

        db.expire_all()

        # Stock físico disminuyó de 5 a 3
        lvl = db.execute(
            select(InventoryLevel)
            .where(InventoryLevel.sku_id == data["sku"].id, InventoryLevel.warehouse_id == data["warehouse"].id)
        ).scalar_one()
        assert lvl.quantity == 3

        # Balance Nebulae disminuyó a 3
        bal = db.execute(
            select(InventoryOwnerBalance)
            .where(InventoryOwnerBalance.sku_id == data["sku"].id, InventoryOwnerBalance.owner == "NEBULAE")
        ).scalar_one()
        assert int(bal.quantity) == 3

        # Kárdex registra salida OUT
        mv_out = db.execute(
            select(InventoryMovement)
            .where(InventoryMovement.sku_id == data["sku"].id, InventoryMovement.direction == "OUT")
        ).scalar_one()
        assert mv_out.quantity == 2
        assert mv_out.owner == "NEBULAE"

    def test_operar_reserva_no_activa_falla_409(self, app_client, admin_token, db):
        """Rechazar liberar o convertir una reserva que ya no está activa."""
        data = _setup_reserva_scenario(db, physical_qty=5, quarantine_qty=0)
        res = app_client.post(
            "/api/v1/inventory/reservas",
            json={"sku_id": data["sku"].id, "warehouse_id": data["warehouse"].id, "quantity": 1, "owner": "NEBULAE"},
            headers=_auth(admin_token)
        ).json()["data"]

        # Liberar una primera vez
        app_client.post(f"/api/v1/inventory/reservas/{res['id']}/liberar", headers=_auth(admin_token))

        # Intentar liberar de nuevo
        resp_lib2 = app_client.post(f"/api/v1/inventory/reservas/{res['id']}/liberar", headers=_auth(admin_token))
        assert resp_lib2.status_code == 409

        # Intentar convertir una reserva liberada
        resp_conv = app_client.post(f"/api/v1/inventory/reservas/{res['id']}/convertir", headers=_auth(admin_token))
        assert resp_conv.status_code == 409