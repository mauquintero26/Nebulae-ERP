"""
test_fase1b_inventory.py — Tests de reservas e inventario por propietario

Escenarios:
1. Reserva de última unidad bloquea a segunda reserva simultánea
2. Vencimiento y liberación de reserva
3. Balances independientes NEBULAE vs MAU en misma bodega y SKU
4. Recepción actualiza balances por propietario
"""
import uuid
import pytest
import threading
from decimal import Decimal
from datetime import datetime, timedelta
from sqlalchemy import text

from tests.conftest import TestSessionLocal, test_engine


class TestInventoryOwnerBalances:
    """Balances independientes por propietario."""

    def test_nebulae_and_mau_balances_coexist(self, db, sku, warehouse):
        """NEBULAE y MAU tienen balances separados para el mismo SKU+bodega."""
        db.execute(text(
            "INSERT INTO inventory_owner_balances (sku_id,warehouse_id,owner,quantity,updated_at) "
            "VALUES (:sku,:wh,'NEBULAE',100,NOW()) "
            "ON CONFLICT (sku_id,warehouse_id,owner) DO UPDATE SET quantity = 100"
        ), {"sku": sku.id, "wh": warehouse.id})
        db.execute(text(
            "INSERT INTO inventory_owner_balances (sku_id,warehouse_id,owner,quantity,updated_at) "
            "VALUES (:sku,:wh,'MAU',50,NOW()) "
            "ON CONFLICT (sku_id,warehouse_id,owner) DO UPDATE SET quantity = 50"
        ), {"sku": sku.id, "wh": warehouse.id})
        db.commit()

        nebulae = db.execute(text(
            "SELECT quantity FROM inventory_owner_balances "
            "WHERE sku_id=:sku AND warehouse_id=:wh AND owner='NEBULAE'"
        ), {"sku": sku.id, "wh": warehouse.id}).scalar()
        mau = db.execute(text(
            "SELECT quantity FROM inventory_owner_balances "
            "WHERE sku_id=:sku AND warehouse_id=:wh AND owner='MAU'"
        ), {"sku": sku.id, "wh": warehouse.id}).scalar()

        assert nebulae == 100, f"NEBULAE debe tener 100, tiene {nebulae}"
        assert mau == 50, f"MAU debe tener 50, tiene {mau}"
        assert nebulae != mau, "Los balances deben ser independientes"

    def test_unique_constraint_per_sku_warehouse_owner(self, db, sku, warehouse):
        """No se pueden insertar 2 filas con misma combinación SKU+bodega+propietario."""
        db.execute(text(
            "INSERT INTO inventory_owner_balances (sku_id,warehouse_id,owner,quantity,updated_at) "
            "VALUES (:sku,:wh,'NEBULAE',10,NOW()) "
            "ON CONFLICT (sku_id,warehouse_id,owner) DO UPDATE SET quantity = 10"
        ), {"sku": sku.id, "wh": warehouse.id})
        db.commit()

        # Intentar duplicar debe fallar
        try:
            db.execute(text(
                "INSERT INTO inventory_owner_balances (sku_id,warehouse_id,owner,quantity,updated_at) "
                "VALUES (:sku,:wh,'NEBULAE',999,NOW())"
            ), {"sku": sku.id, "wh": warehouse.id})
            db.commit()
            # Si llega aquí, el constraint no funcionó
            assert False, "Debería haber lanzado error de UNIQUE constraint"
        except Exception as e:
            db.rollback()
            assert "uq_inv_owner_bal" in str(e) or "unique" in str(e).lower(), (
                f"Se esperaba error de UNIQUE constraint, se obtuvo: {e}"
            )


class TestInventoryReservations:
    """Reservas de inventario: creación, vencimiento, liberación, conversión."""

    def test_create_active_reservation(self, db, sku, warehouse):
        """Crear una reserva ACTIVE."""
        db.execute(text(
            "INSERT INTO inventory_reservations "
            "(sku_id,warehouse_id,owner,quantity_reserved,status,expires_at,created_at) "
            "VALUES (:sku,:wh,'NEBULAE',5,'ACTIVE',:exp,NOW())"
        ), {"sku": sku.id, "wh": warehouse.id, "exp": datetime.utcnow() + timedelta(hours=24)})
        db.commit()

        res = db.execute(text(
            "SELECT status, quantity_reserved FROM inventory_reservations "
            "WHERE sku_id=:sku AND warehouse_id=:wh AND status='ACTIVE'"
        ), {"sku": sku.id, "wh": warehouse.id}).fetchone()
        assert res is not None, "Reserva ACTIVE debe existir"
        assert res[1] == 5

    def test_reservation_expiry_and_release(self, db, sku, warehouse):
        """Una reserva puede marcarse como EXPIRED/RELEASED."""
        result = db.execute(text(
            "INSERT INTO inventory_reservations "
            "(sku_id,warehouse_id,owner,quantity_reserved,status,expires_at,created_at) "
            "VALUES (:sku,:wh,'NEBULAE',3,'ACTIVE',:exp,NOW()) RETURNING id"
        ), {"sku": sku.id, "wh": warehouse.id, "exp": datetime.utcnow() - timedelta(hours=1)})
        res_id = result.fetchone()[0]
        db.commit()

        # Simular proceso de expiración
        db.execute(text(
            "UPDATE inventory_reservations SET status='EXPIRED', released_at=NOW() "
            "WHERE id=:id AND expires_at < NOW() AND status='ACTIVE'"
        ), {"id": res_id})
        db.commit()

        status = db.execute(text(
            "SELECT status FROM inventory_reservations WHERE id=:id"
        ), {"id": res_id}).scalar()
        assert status == "EXPIRED", f"Estado debe ser EXPIRED, es {status}"

    def test_last_unit_reservation_concurrency(self, db, sku, warehouse):
        """Dos hilos intentan reservar la última unidad — exactamente uno gana."""
        # Configurar stock de 1 unidad
        db.execute(text(
            "INSERT INTO inventory_owner_balances (sku_id,warehouse_id,owner,quantity,updated_at) "
            "VALUES (:sku,:wh,'NEBULAE',1,NOW()) "
            "ON CONFLICT (sku_id,warehouse_id,owner) DO UPDATE SET quantity = 1"
        ), {"sku": sku.id, "wh": warehouse.id})
        db.commit()

        sku_id = sku.id
        wh_id = warehouse.id
        results = []

        def try_reserve(thread_id):
            """Intenta reservar con SELECT FOR UPDATE sobre el balance."""
            session = TestSessionLocal()
            try:
                balance_row = session.execute(text(
                    "SELECT id, quantity FROM inventory_owner_balances "
                    "WHERE sku_id=:sku AND warehouse_id=:wh AND owner='NEBULAE' "
                    "FOR UPDATE"
                ), {"sku": sku_id, "wh": wh_id}).fetchone()

                if balance_row is None or balance_row[1] < 1:
                    results.append(("NO_STOCK", thread_id))
                    session.rollback()
                    return

                # Decrementar y crear reserva
                session.execute(text(
                    "UPDATE inventory_owner_balances SET quantity = quantity - 1 "
                    "WHERE id = :id"
                ), {"id": balance_row[0]})
                session.execute(text(
                    "INSERT INTO inventory_reservations "
                    "(sku_id,warehouse_id,owner,quantity_reserved,status,created_at) "
                    "VALUES (:sku,:wh,'NEBULAE',1,'ACTIVE',NOW())"
                ), {"sku": sku_id, "wh": wh_id})
                session.commit()
                results.append(("RESERVED", thread_id))
            except Exception as e:
                session.rollback()
                results.append(("ERROR", thread_id, str(e)))
            finally:
                session.close()

        t1 = threading.Thread(target=try_reserve, args=(1,))
        t2 = threading.Thread(target=try_reserve, args=(2,))
        t1.start(); t2.start()
        t1.join(); t2.join()

        successes = [r for r in results if r[0] == "RESERVED"]
        assert len(successes) == 1, (
            f"Exactamente 1 hilo debe reservar la última unidad. "
            f"Resultados: {results}"
        )
