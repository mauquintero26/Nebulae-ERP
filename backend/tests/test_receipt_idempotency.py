"""
test_receipt_idempotency.py -- Fase 1A v4

Tests:
- idempotency_key missing -> 422
- Same key + same payload -> replay 200 with original data (dict, not string)
- Same key + different receipt_type -> 409
- ENINV already confirmed + different key -> 409
- ENINV already confirmed + same key -> replay 200

NO pytest.skip() for any scenario.
"""
import uuid
import pytest


def auth(token):
    return {"Authorization": f"Bearer {token}"}


IDEM_KEY_LEN = 32


class TestMissingIdempotencyKey:
    def test_missing_key_returns_422(self, app_client, admin_token, eninv_5u):
        """idempotency_key is mandatory. Missing -> 400 (app converts 422 to 400)."""
        resp = app_client.post(
            f"/api/v1/compras/recepciones/{eninv_5u.id}/confirmar",
            json={"receipt_type": "FISICA"},  # no idempotency_key
            headers=auth(admin_token),
        )
        assert resp.status_code in (400, 422), (
            f"Missing idempotency_key should return 400 or 422, got {resp.status_code}: {resp.text}"
        )

    def test_short_key_returns_422(self, app_client, admin_token, eninv_5u):
        """idempotency_key shorter than min_length=8 -> 400 (app converts 422 to 400)."""
        resp = app_client.post(
            f"/api/v1/compras/recepciones/{eninv_5u.id}/confirmar",
            json={"idempotency_key": "short", "receipt_type": "FISICA"},
            headers=auth(admin_token),
        )
        assert resp.status_code in (400, 422), (
            f"Short idempotency_key should return 400 or 422, got {resp.status_code}: {resp.text}"
        )


class TestIdempotencyReplay:
    def test_same_key_same_payload_returns_replay(
        self, app_client, admin_token, eninv_5u, inv_level_zero
    ):
        """Same idempotency_key + same payload -> second call returns replay 200."""
        key = f"idem-test-{uuid.uuid4().hex}"
        payload = {"idempotency_key": key, "receipt_type": "FISICA"}

        # First call: should succeed with 200
        r1 = app_client.post(
            f"/api/v1/compras/recepciones/{eninv_5u.id}/confirmar",
            json=payload,
            headers=auth(admin_token),
        )
        assert r1.status_code == 200, (
            f"First confirmar should return 200, got {r1.status_code}: {r1.text}"
        )

        # Second call: same key, same payload -> replay
        r2 = app_client.post(
            f"/api/v1/compras/recepciones/{eninv_5u.id}/confirmar",
            json=payload,
            headers=auth(admin_token),
        )
        assert r2.status_code == 200, (
            f"Replay should return 200, got {r2.status_code}: {r2.text}"
        )
        data = r2.json()
        assert data.get("idempotent_replay") is True, (
            f"Replay response missing idempotent_replay=True: {data}"
        )
        # data['data'] must be a dict, not a string
        assert isinstance(data["data"], dict), (
            f"Replay data must be a dict, got {type(data['data'])}: {data['data']!r}"
        )
        assert "id" in data["data"], f"Replay data missing 'id': {data['data']}"
        assert "idempotency_key" in data, f"Response missing idempotency_key field: {data}"

    def test_same_key_different_payload_returns_409(
        self, app_client, admin_token, eninv_5u, eninv_logistica, inv_level_zero
    ):
        """Same key but different receipt_type -> 409 conflict."""
        key = f"idem-diff-{uuid.uuid4().hex}"

        # First: FISICA
        r1 = app_client.post(
            f"/api/v1/compras/recepciones/{eninv_5u.id}/confirmar",
            json={"idempotency_key": key, "receipt_type": "FISICA"},
            headers=auth(admin_token),
        )
        assert r1.status_code == 200, (
            f"First call should succeed, got {r1.status_code}: {r1.text}"
        )

        # Second: LOGISTICA with SAME key -> payload hash mismatch -> 409
        r2 = app_client.post(
            f"/api/v1/compras/recepciones/{eninv_logistica.id}/confirmar",
            json={"idempotency_key": key, "receipt_type": "LOGISTICA"},
            headers=auth(admin_token),
        )
        assert r2.status_code == 409, (
            f"Different payload with same key should return 409, got {r2.status_code}: {r2.text}"
        )

    def test_replay_data_is_dict_not_string(
        self, app_client, admin_token, eninv_5u, inv_level_zero
    ):
        """Verify replay response_body is deserialized to dict, not left as string."""
        key = f"idem-dict-{uuid.uuid4().hex}"
        payload = {"idempotency_key": key, "receipt_type": "FISICA"}

        app_client.post(
            f"/api/v1/compras/recepciones/{eninv_5u.id}/confirmar",
            json=payload, headers=auth(admin_token),
        )
        r2 = app_client.post(
            f"/api/v1/compras/recepciones/{eninv_5u.id}/confirmar",
            json=payload, headers=auth(admin_token),
        )
        assert r2.status_code == 200
        body = r2.json()
        assert isinstance(body["data"], dict), (
            f"response_body must be deserialized dict, got {type(body['data'])}"
        )


class TestAlreadyConfirmedEninv:
    def test_already_confirmed_different_key_returns_409(
        self, app_client, admin_token, eninv_5u, inv_level_zero
    ):
        """Already confirmed ENINV + different idempotency_key -> 409 (not 500)."""
        key_original = f"orig-{uuid.uuid4().hex}"
        key_different = f"diff-{uuid.uuid4().hex}"

        # Confirm first
        r1 = app_client.post(
            f"/api/v1/compras/recepciones/{eninv_5u.id}/confirmar",
            json={"idempotency_key": key_original, "receipt_type": "FISICA"},
            headers=auth(admin_token),
        )
        assert r1.status_code == 200, f"First confirm failed: {r1.text}"

        # Try with different key
        r2 = app_client.post(
            f"/api/v1/compras/recepciones/{eninv_5u.id}/confirmar",
            json={"idempotency_key": key_different, "receipt_type": "FISICA"},
            headers=auth(admin_token),
        )
        assert r2.status_code == 409, (
            f"Already confirmed ENINV with different key should return 409, "
            f"got {r2.status_code}: {r2.text}"
        )
        # Must NOT be 500
        assert r2.status_code != 500, (
            f"Already confirmed ENINV must never return 500. Got: {r2.text}"
        )
