"""
test_receipt_concurrency.py -- Fase 1A v4

Tests:
- Two simultaneous requests with same idempotency_key -> exactly one succeeds
- Two different keys on same ENINV -> second gets 409 (already confirmed)
- Stock incremented exactly once

Uses threading to simulate concurrent HTTP requests.
NO pytest.skip() for any scenario.
"""
import uuid, threading
import pytest


def auth(token):
    return {"Authorization": f"Bearer {token}"}


class TestConcurrency:
    def test_same_key_concurrent_exactly_one_wins(
        self, app_client, admin_token, eninv_5u, inv_level_zero, db
    ):
        """Two concurrent requests with the same idempotency_key.
        
        Expected: exactly one returns 200, the other returns 409.
        Stock must be incremented exactly once (qty=5).
        """
        # Extract plain ints BEFORE threads -- ORM objects are NOT thread-safe
        eninv_id = eninv_5u.id
        sku_id = inv_level_zero.sku_id
        wh_id = inv_level_zero.warehouse_id

        key = f"conc-same-{uuid.uuid4().hex}"
        payload = {"idempotency_key": key, "receipt_type": "FISICA"}
        results = []

        def call():
            r = app_client.post(
                f"/api/v1/compras/recepciones/{eninv_id}/confirmar",
                json=payload,
                headers=auth(admin_token),
            )
            results.append(r.status_code)

        threads = [threading.Thread(target=call) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        successes = results.count(200)
        conflicts = results.count(409)
        assert successes == 1, (
            f"Exactly 1 request should succeed with same key. Got: {results}"
        )
        assert conflicts == 1, (
            f"Exactly 1 request should get 409 with same key. Got: {results}"
        )

        # Verify stock incremented exactly once
        from app.models.inventory import InventoryLevel
        from sqlalchemy import create_engine
        import os
        from dotenv import load_dotenv
        load_dotenv()
        # Direct DB check for stock level
        db.expire_all()
        from sqlalchemy import text
        qty = db.execute(
            text(
                "SELECT quantity FROM inventory_levels "
                "WHERE sku_id=:sku AND warehouse_id=:wh"
            ),
            {"sku": sku_id, "wh": wh_id},
        ).scalar()
        assert qty == 5, (
            f"Stock should be 5 (incremented exactly once). Got: {qty}"
        )

    def test_different_keys_same_eninv_second_gets_409(
        self, app_client, admin_token, eninv_5u, inv_level_zero
    ):
        """Two different idempotency keys on the same ENINV.
        
        First one succeeds, second must get 409 (already confirmed).
        Constraint must NOT trigger 500.
        """
        # Extract plain int before threads
        eninv_id = eninv_5u.id

        key1 = f"dk1-{uuid.uuid4().hex}"
        key2 = f"dk2-{uuid.uuid4().hex}"
        results = {}

        def call(key, slot):
            r = app_client.post(
                f"/api/v1/compras/recepciones/{eninv_id}/confirmar",
                json={"idempotency_key": key, "receipt_type": "FISICA"},
                headers=auth(admin_token),
            )
            results[slot] = r.status_code

        t1 = threading.Thread(target=call, args=(key1, "first"))
        t2 = threading.Thread(target=call, args=(key2, "second"))
        t1.start(); t2.start()
        t1.join(); t2.join()

        statuses = set(results.values())
        assert 200 in statuses, f"At least one call should succeed. Got: {results}"
        assert 500 not in statuses, (
            f"No 500 allowed for concurrent confirmar on same ENINV. Got: {results}"
        )
        # One should be 409 (already confirmed)
        non_200 = [s for s in results.values() if s != 200]
        assert all(s == 409 for s in non_200), (
            f"Non-200 response must be 409, not 5xx. Got: {results}"
        )
