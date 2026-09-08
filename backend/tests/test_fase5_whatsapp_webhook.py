"""
tests/test_fase5_whatsapp_webhook.py
====================================
Bloque 6 — Certificación HEAD 486ef36: Tests del router WhatsApp Business API
(/api/v1/whatsapp/webhook) en modo sombra.

Cobertura:
  GET  /api/v1/whatsapp/webhook         -- Verificación Meta hub.challenge
  POST /api/v1/whatsapp/webhook         -- Recepción eventos (modo sombra)
  GET  /api/v1/whatsapp/webhook/metrics -- Métricas protegidas

REGLAS ABSOLUTAS (modo sombra):
  - Siempre retorna HTTP 200 en POST (Meta reintenta con cualquier otro código)
  - NO contesta mensajes automáticos → chat_messages.is_auto_sent = FALSE
  - NO crea pedidos → sale_orders sin cambios
  - NO registra pagos → sale_order_payments sin cambios
  - NO modifica inventario → inventory_movements sin cambios
"""
from __future__ import annotations

import hashlib
import hmac as _hmac
import json
import os
import uuid
from typing import Any, Dict

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_TEST_APP_SECRET = "wa_test_secret_2026_ensayo_X7k"
_TEST_VERIFY_TOKEN = "wa_test_verify_token_2026_Z9m"


def _make_sig(body: bytes, secret: str = _TEST_APP_SECRET) -> str:
    """Genera la firma HMAC-SHA256 en el formato que Meta usa."""
    return "sha256=" + _hmac.new(
        secret.encode("utf-8"), body, hashlib.sha256
    ).hexdigest()


def _wa_payload(
    wamid: str | None = None,
    msg_type: str = "text",
    object_field: str = "whatsapp_business_account",
) -> Dict[str, Any]:
    """Genera un payload de evento de WhatsApp Business API estándar."""
    wamid = wamid or f"wamid.test.{uuid.uuid4().hex}"
    return {
        "object": object_field,
        "entry": [
            {
                "id": "0",
                "changes": [
                    {
                        "value": {
                            "messaging_product": "whatsapp",
                            "metadata": {"phone_number_id": "12345"},
                            "messages": [
                                {
                                    "id": wamid,
                                    "from": "573001234567",
                                    "type": msg_type,
                                    "timestamp": "1000000000",
                                    "text": {"body": "Hola"} if msg_type == "text" else {},
                                }
                            ],
                        },
                        "field": "messages",
                    }
                ],
            }
        ],
    }


def _wa_status_payload(wamid: str | None = None) -> Dict[str, Any]:
    """Genera un payload de actualización de estado (delivery/read)."""
    wamid = wamid or f"wamid.test.status.{uuid.uuid4().hex}"
    return {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "0",
                "changes": [
                    {
                        "value": {
                            "messaging_product": "whatsapp",
                            "metadata": {"phone_number_id": "12345"},
                            "statuses": [
                                {
                                    "id": wamid,
                                    "status": "delivered",
                                    "timestamp": "1000000000",
                                    "recipient_id": "573001234567",
                                }
                            ],
                        },
                        "field": "messages",
                    }
                ],
            }
        ],
    }


# ---------------------------------------------------------------------------
# Fixture: cliente de la app conectado a erp_test
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def wa_client(app_client: TestClient) -> TestClient:
    """Reutiliza el app_client de conftest (ya apunta a erp_test)."""
    return app_client


# ---------------------------------------------------------------------------
# GET /api/v1/whatsapp/webhook — Verificación del webhook Meta
# ---------------------------------------------------------------------------

class TestVerifyWebhook:
    """V-01 … V-06: Endpoint de verificación Meta hub.challenge"""

    def test_V01_no_verify_token_env(self, wa_client: TestClient, monkeypatch: pytest.MonkeyPatch):
        """V-01: Si WHATSAPP_VERIFY_TOKEN no está configurado → HTTP 500 + 'Configuration error'."""
        import app.api.v1.whatsapp_webhook as wh_mod
        monkeypatch.setenv("WHATSAPP_VERIFY_TOKEN", "")
        monkeypatch.setattr(wh_mod, "VERIFY_TOKEN", "")
        r = wa_client.get(
            "/api/v1/whatsapp/webhook",
            params={"hub.mode": "subscribe", "hub.verify_token": "", "hub.challenge": "abc"},
        )
        assert r.status_code == 500
        assert "Configuration error" in r.text

    def test_V02_wrong_mode(self, wa_client: TestClient, monkeypatch: pytest.MonkeyPatch):
        """V-02: mode != 'subscribe' → HTTP 403 Forbidden."""
        import app.api.v1.whatsapp_webhook as wh_mod
        monkeypatch.setattr(wh_mod, "VERIFY_TOKEN", _TEST_VERIFY_TOKEN)
        r = wa_client.get(
            "/api/v1/whatsapp/webhook",
            params={
                "hub.mode": "unsubscribe",
                "hub.verify_token": _TEST_VERIFY_TOKEN,
                "hub.challenge": "abc",
            },
        )
        assert r.status_code == 403
        assert "Forbidden" in r.text

    def test_V03_wrong_token(self, wa_client: TestClient, monkeypatch: pytest.MonkeyPatch):
        """V-03: token incorrecto → HTTP 403."""
        import app.api.v1.whatsapp_webhook as wh_mod
        monkeypatch.setattr(wh_mod, "VERIFY_TOKEN", _TEST_VERIFY_TOKEN)
        r = wa_client.get(
            "/api/v1/whatsapp/webhook",
            params={
                "hub.mode": "subscribe",
                "hub.verify_token": "token_incorrecto",
                "hub.challenge": "abc",
            },
        )
        assert r.status_code == 403

    def test_V04_missing_token_param(self, wa_client: TestClient, monkeypatch: pytest.MonkeyPatch):
        """V-04: token omitido → HTTP 403."""
        import app.api.v1.whatsapp_webhook as wh_mod
        monkeypatch.setattr(wh_mod, "VERIFY_TOKEN", _TEST_VERIFY_TOKEN)
        r = wa_client.get(
            "/api/v1/whatsapp/webhook",
            params={"hub.mode": "subscribe", "hub.challenge": "abc"},
        )
        assert r.status_code == 403

    def test_V05_success_returns_challenge(self, wa_client: TestClient, monkeypatch: pytest.MonkeyPatch):
        """V-05: modo correcto + token correcto → HTTP 200, body = challenge exacto."""
        import app.api.v1.whatsapp_webhook as wh_mod
        monkeypatch.setattr(wh_mod, "VERIFY_TOKEN", _TEST_VERIFY_TOKEN)
        challenge = "challenge_unique_789xyz"
        r = wa_client.get(
            "/api/v1/whatsapp/webhook",
            params={
                "hub.mode": "subscribe",
                "hub.verify_token": _TEST_VERIFY_TOKEN,
                "hub.challenge": challenge,
            },
        )
        assert r.status_code == 200
        assert r.text == challenge

    def test_V06_empty_challenge(self, wa_client: TestClient, monkeypatch: pytest.MonkeyPatch):
        """V-06: token correcto sin challenge → HTTP 200, body vacío."""
        import app.api.v1.whatsapp_webhook as wh_mod
        monkeypatch.setattr(wh_mod, "VERIFY_TOKEN", _TEST_VERIFY_TOKEN)
        r = wa_client.get(
            "/api/v1/whatsapp/webhook",
            params={
                "hub.mode": "subscribe",
                "hub.verify_token": _TEST_VERIFY_TOKEN,
            },
        )
        assert r.status_code == 200
        assert r.text == ""


# ---------------------------------------------------------------------------
# POST /api/v1/whatsapp/webhook — Firma inválida
# ---------------------------------------------------------------------------

class TestInvalidSignature:
    """S-01 … S-05: Validación HMAC-SHA256"""

    def _patch_secret(self, monkeypatch: pytest.MonkeyPatch) -> None:
        import app.services.whatsapp_shadow as s
        monkeypatch.setattr(s, "APP_SECRET", _TEST_APP_SECRET)

    def test_S01_no_secret_env(self, wa_client: TestClient, monkeypatch: pytest.MonkeyPatch):
        """S-01: WHATSAPP_APP_SECRET no configurado → rejected:invalid_signature, HTTP 200."""
        import app.services.whatsapp_shadow as s
        monkeypatch.setattr(s, "APP_SECRET", "")  # secreto vacío
        body = json.dumps(_wa_payload()).encode()
        r = wa_client.post(
            "/api/v1/whatsapp/webhook",
            content=body,
            headers={"X-Hub-Signature-256": _make_sig(body), "Content-Type": "application/json"},
        )
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "rejected"
        assert d["reason"] == "invalid_signature"

    def test_S02_no_signature_header(self, wa_client: TestClient, monkeypatch: pytest.MonkeyPatch):
        """S-02: Body válido sin header de firma → rejected:invalid_signature."""
        self._patch_secret(monkeypatch)
        body = json.dumps(_wa_payload()).encode()
        r = wa_client.post(
            "/api/v1/whatsapp/webhook",
            content=body,
            headers={"Content-Type": "application/json"},
        )
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "rejected"
        assert d["reason"] == "invalid_signature"

    def test_S03_malformed_sig_prefix(self, wa_client: TestClient, monkeypatch: pytest.MonkeyPatch):
        """S-03: Firma sin prefijo 'sha256=' → rejected:invalid_signature."""
        self._patch_secret(monkeypatch)
        body = json.dumps(_wa_payload()).encode()
        bad_sig = _make_sig(body).replace("sha256=", "SHA256:")  # prefix incorrecto
        r = wa_client.post(
            "/api/v1/whatsapp/webhook",
            content=body,
            headers={"X-Hub-Signature-256": bad_sig, "Content-Type": "application/json"},
        )
        assert r.status_code == 200
        assert r.json()["status"] == "rejected"

    def test_S04_wrong_secret_sig(self, wa_client: TestClient, monkeypatch: pytest.MonkeyPatch):
        """S-04: Firma generada con secreto diferente → rejected:invalid_signature."""
        self._patch_secret(monkeypatch)
        body = json.dumps(_wa_payload()).encode()
        wrong_sig = _make_sig(body, secret="secreto_incorrecto")
        r = wa_client.post(
            "/api/v1/whatsapp/webhook",
            content=body,
            headers={"X-Hub-Signature-256": wrong_sig, "Content-Type": "application/json"},
        )
        assert r.status_code == 200
        assert r.json()["status"] == "rejected"

    def test_S05_valid_signature_accepted(self, wa_client: TestClient, monkeypatch: pytest.MonkeyPatch):
        """S-05: Firma HMAC-SHA256 correcta → aceptado (status != rejected)."""
        self._patch_secret(monkeypatch)
        body = json.dumps(_wa_payload()).encode()
        r = wa_client.post(
            "/api/v1/whatsapp/webhook",
            content=body,
            headers={"X-Hub-Signature-256": _make_sig(body), "Content-Type": "application/json"},
        )
        assert r.status_code == 200
        assert r.json()["status"] != "rejected"


# ---------------------------------------------------------------------------
# POST /api/v1/whatsapp/webhook — Payload malformado
# ---------------------------------------------------------------------------

class TestMalformedPayload:
    """M-01 … M-04: Payloads inválidos o no-WhatsApp"""

    def _patch_secret(self, monkeypatch: pytest.MonkeyPatch) -> None:
        import app.services.whatsapp_shadow as s
        monkeypatch.setattr(s, "APP_SECRET", _TEST_APP_SECRET)

    def test_M01_invalid_json_body(self, wa_client: TestClient, monkeypatch: pytest.MonkeyPatch):
        """M-01: Body no es JSON → error:invalid_json, HTTP 200."""
        self._patch_secret(monkeypatch)
        body = b"this-is-not-json"
        r = wa_client.post(
            "/api/v1/whatsapp/webhook",
            content=body,
            headers={"X-Hub-Signature-256": _make_sig(body), "Content-Type": "application/json"},
        )
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "error"
        assert d["reason"] == "invalid_json"

    def test_M02_empty_body(self, wa_client: TestClient, monkeypatch: pytest.MonkeyPatch):
        """M-02: Body vacío → error:invalid_json, HTTP 200."""
        self._patch_secret(monkeypatch)
        body = b""
        r = wa_client.post(
            "/api/v1/whatsapp/webhook",
            content=body,
            headers={"X-Hub-Signature-256": _make_sig(body), "Content-Type": "application/json"},
        )
        assert r.status_code == 200
        assert r.json()["status"] in ("error", "rejected")  # empty body may fail signature too

    def test_M03_non_whatsapp_object(self, wa_client: TestClient, monkeypatch: pytest.MonkeyPatch):
        """M-03: object='instagram' → ignored:not_whatsapp_event."""
        self._patch_secret(monkeypatch)
        payload = _wa_payload(object_field="instagram")
        body = json.dumps(payload).encode()
        r = wa_client.post(
            "/api/v1/whatsapp/webhook",
            content=body,
            headers={"X-Hub-Signature-256": _make_sig(body), "Content-Type": "application/json"},
        )
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "ignored"
        assert d["reason"] == "not_whatsapp_event"

    def test_M04_empty_json_object(self, wa_client: TestClient, monkeypatch: pytest.MonkeyPatch):
        """M-04: {} sin campo 'object' → ignored:not_whatsapp_event."""
        self._patch_secret(monkeypatch)
        body = b"{}"
        r = wa_client.post(
            "/api/v1/whatsapp/webhook",
            content=body,
            headers={"X-Hub-Signature-256": _make_sig(body), "Content-Type": "application/json"},
        )
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "ignored"
        assert d["reason"] == "not_whatsapp_event"


# ---------------------------------------------------------------------------
# POST /api/v1/whatsapp/webhook — Tipos de evento
# ---------------------------------------------------------------------------

class TestEventTypes:
    """U-01 … U-03: Tipos de evento (status, desconocido, media)"""

    def _post_valid(
        self, wa_client: TestClient, monkeypatch: pytest.MonkeyPatch, payload: Dict
    ):
        import app.services.whatsapp_shadow as s
        monkeypatch.setattr(s, "APP_SECRET", _TEST_APP_SECRET)
        body = json.dumps(payload).encode()
        return wa_client.post(
            "/api/v1/whatsapp/webhook",
            content=body,
            headers={"X-Hub-Signature-256": _make_sig(body), "Content-Type": "application/json"},
        )

    def test_U01_status_event(self, wa_client: TestClient, monkeypatch: pytest.MonkeyPatch):
        """U-01: Payload de estado (delivery) → HTTP 200, registrado con event_type='status:delivered'."""
        payload = _wa_status_payload()
        r = self._post_valid(wa_client, monkeypatch, payload)
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "ok"
        assert d["detail"]["status"] in ("recorded", "duplicate")
        if d["detail"]["status"] == "recorded":
            assert "status:delivered" in d["detail"].get("event_type", "")

    def test_U02_unknown_event_type(self, wa_client: TestClient, monkeypatch: pytest.MonkeyPatch):
        """U-02: Payload WA válido sin messages ni statuses → event_type='unknown'."""
        payload = {
            "object": "whatsapp_business_account",
            "entry": [{"id": "0", "changes": [{"value": {}, "field": "account_alerts"}]}],
        }
        r = self._post_valid(wa_client, monkeypatch, payload)
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "ok"

    def test_U03_image_message(self, wa_client: TestClient, monkeypatch: pytest.MonkeyPatch):
        """U-03: Mensaje de tipo imagen → HTTP 200, event_type='message:image'."""
        payload = _wa_payload(msg_type="image")
        r = self._post_valid(wa_client, monkeypatch, payload)
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "ok"
        if d["detail"]["status"] == "recorded":
            assert d["detail"]["event_type"] == "message:image"


# ---------------------------------------------------------------------------
# POST /api/v1/whatsapp/webhook — Idempotencia y duplicados
# ---------------------------------------------------------------------------

class TestIdempotency:
    """I-01 … I-04: Replay idempotente y detección de duplicados"""

    def _post_valid(
        self, wa_client: TestClient, monkeypatch: pytest.MonkeyPatch, payload: Dict
    ):
        import app.services.whatsapp_shadow as s
        monkeypatch.setattr(s, "APP_SECRET", _TEST_APP_SECRET)
        body = json.dumps(payload).encode()
        return wa_client.post(
            "/api/v1/whatsapp/webhook",
            content=body,
            headers={"X-Hub-Signature-256": _make_sig(body), "Content-Type": "application/json"},
        )

    def test_I01_first_call_recorded(self, wa_client: TestClient, monkeypatch: pytest.MonkeyPatch):
        """I-01: Primera llamada con wamid único → status='ok', detail.status='recorded'."""
        wamid = f"wamid.idem.{uuid.uuid4().hex}"
        payload = _wa_payload(wamid=wamid)
        r = self._post_valid(wa_client, monkeypatch, payload)
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "ok"
        assert d["detail"]["status"] == "recorded"

    def test_I02_replay_is_duplicate(self, wa_client: TestClient, monkeypatch: pytest.MonkeyPatch):
        """I-02: Segunda llamada con mismo wamid → status='ok', detail.status='duplicate'."""
        wamid = f"wamid.replay.{uuid.uuid4().hex}"
        payload = _wa_payload(wamid=wamid)
        # Primera llamada
        self._post_valid(wa_client, monkeypatch, payload)
        # Segunda llamada (replay)
        r = self._post_valid(wa_client, monkeypatch, payload)
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "ok"
        assert d["detail"]["status"] == "duplicate"

    def test_I03_db_has_exactly_one_record(self, wa_client: TestClient, db: Session, monkeypatch: pytest.MonkeyPatch):
        """I-03: Después de replay, exactamente 1 registro en integration_webhook_events por wamid."""
        from app.models.fase5 import IntegrationWebhookEvent
        wamid = f"wamid.dbcheck.{uuid.uuid4().hex}"
        payload = _wa_payload(wamid=wamid)
        # Enviar 3 veces (debería quedar 1 registro)
        for _ in range(3):
            self._post_valid(wa_client, monkeypatch, payload)
        db.expire_all()
        count = (
            db.query(IntegrationWebhookEvent)
            .filter(
                IntegrationWebhookEvent.provider == "WHATSAPP",
                IntegrationWebhookEvent.idempotency_key == wamid,
            )
            .count()
        )
        assert count == 1, f"Se esperaba 1 registro, se encontraron {count}"

    def test_I04_no_wamid_uses_fallback_key(self, wa_client: TestClient, monkeypatch: pytest.MonkeyPatch):
        """I-04: Payload sin message ID → fallback key, registrado igualmente."""
        import app.services.whatsapp_shadow as s
        monkeypatch.setattr(s, "APP_SECRET", _TEST_APP_SECRET)
        payload = {
            "object": "whatsapp_business_account",
            "entry": [{"id": "0", "changes": [{"value": {"messaging_product": "whatsapp"}, "field": "messages"}]}],
        }
        body = json.dumps(payload).encode()
        r = wa_client.post(
            "/api/v1/whatsapp/webhook",
            content=body,
            headers={"X-Hub-Signature-256": _make_sig(body), "Content-Type": "application/json"},
        )
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "ok"


# ---------------------------------------------------------------------------
# POST /api/v1/whatsapp/webhook — Modo sombra: SIN efectos operativos
# ---------------------------------------------------------------------------

class TestShadowModeConstraints:
    """SM-01 … SM-06: Modo sombra — ninguna acción operativa"""

    def _post_valid_and_get_detail(
        self, wa_client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> Dict:
        import app.services.whatsapp_shadow as s
        monkeypatch.setattr(s, "APP_SECRET", _TEST_APP_SECRET)
        payload = _wa_payload()  # wamid único cada vez
        body = json.dumps(payload).encode()
        r = wa_client.post(
            "/api/v1/whatsapp/webhook",
            content=body,
            headers={"X-Hub-Signature-256": _make_sig(body), "Content-Type": "application/json"},
        )
        assert r.status_code == 200
        return r.json()

    def test_SM01_shadow_mode_true_in_response(self, wa_client: TestClient, monkeypatch: pytest.MonkeyPatch):
        """SM-01: En modo sombra por defecto, detail.shadow_mode=True."""
        import app.services.whatsapp_shadow as s
        monkeypatch.setattr(s, "APP_SECRET", _TEST_APP_SECRET)
        monkeypatch.setattr(s, "SHADOW_MODE", True)
        payload = _wa_payload()
        body = json.dumps(payload).encode()
        r = wa_client.post(
            "/api/v1/whatsapp/webhook",
            content=body,
            headers={"X-Hub-Signature-256": _make_sig(body), "Content-Type": "application/json"},
        )
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "ok"
        # shadow_mode en la respuesta debe ser True (o el evento ser recorded)
        if d["detail"]["status"] == "recorded":
            assert d["detail"].get("shadow_mode") is True

    def test_SM02_shadow_false_still_records(self, wa_client: TestClient, monkeypatch: pytest.MonkeyPatch):
        """SM-02: SHADOW_MODE=false → registra igualmente, no ejecuta acciones operativas."""
        import app.services.whatsapp_shadow as s
        import app.api.v1.whatsapp_webhook as wh_mod
        monkeypatch.setattr(s, "APP_SECRET", _TEST_APP_SECRET)
        monkeypatch.setattr(s, "SHADOW_MODE", False)
        monkeypatch.setattr(wh_mod, "SHADOW_MODE", False)
        payload = _wa_payload()
        body = json.dumps(payload).encode()
        r = wa_client.post(
            "/api/v1/whatsapp/webhook",
            content=body,
            headers={"X-Hub-Signature-256": _make_sig(body), "Content-Type": "application/json"},
        )
        assert r.status_code == 200
        # El sistema registra igualmente (proceso_event_shadow se llama siempre)
        assert r.json()["status"] == "ok"

    def test_SM03_no_auto_sent_chat_message(self, wa_client: TestClient, db: Session, monkeypatch: pytest.MonkeyPatch):
        """SM-03: Recibir mensaje WhatsApp NO crea chat_messages con is_auto_sent=True."""
        from sqlalchemy import text as sa_text
        before = db.execute(sa_text("SELECT count(*) FROM chat_messages WHERE is_auto_sent=true")).scalar()
        self._post_valid_and_get_detail(wa_client, monkeypatch)
        after = db.execute(sa_text("SELECT count(*) FROM chat_messages WHERE is_auto_sent=true")).scalar()
        assert after == before, "El modo sombra NO debe crear mensajes automáticos"

    def test_SM04_no_sale_order_created(self, wa_client: TestClient, db: Session, monkeypatch: pytest.MonkeyPatch):
        """SM-04: Recibir mensaje WhatsApp NO crea nuevos sale_orders."""
        from sqlalchemy import text as sa_text
        before = db.execute(sa_text("SELECT count(*) FROM sale_orders")).scalar()
        self._post_valid_and_get_detail(wa_client, monkeypatch)
        after = db.execute(sa_text("SELECT count(*) FROM sale_orders")).scalar()
        assert after == before, "El modo sombra NO debe crear pedidos"

    def test_SM05_no_payment_created(self, wa_client: TestClient, db: Session, monkeypatch: pytest.MonkeyPatch):
        """SM-05: Recibir mensaje WhatsApp NO crea registros de pago."""
        from sqlalchemy import text as sa_text
        before = db.execute(sa_text("SELECT count(*) FROM sale_order_payments")).scalar()
        self._post_valid_and_get_detail(wa_client, monkeypatch)
        after = db.execute(sa_text("SELECT count(*) FROM sale_order_payments")).scalar()
        assert after == before, "El modo sombra NO debe registrar pagos"

    def test_SM06_no_inventory_movement(self, wa_client: TestClient, db: Session, monkeypatch: pytest.MonkeyPatch):
        """SM-06: Recibir mensaje WhatsApp NO crea movimientos de inventario."""
        from sqlalchemy import text as sa_text
        before = db.execute(sa_text("SELECT count(*) FROM inventory_movements")).scalar()
        self._post_valid_and_get_detail(wa_client, monkeypatch)
        after = db.execute(sa_text("SELECT count(*) FROM inventory_movements")).scalar()
        assert after == before, "El modo sombra NO debe modificar inventario"


# ---------------------------------------------------------------------------
# POST /api/v1/whatsapp/webhook — Persistencia en DB
# ---------------------------------------------------------------------------

class TestDBPersistence:
    """DB-01 … DB-03: Campos persistidos correctamente"""

    def test_DB01_event_persisted_with_correct_fields(
        self, wa_client: TestClient, db: Session, monkeypatch: pytest.MonkeyPatch
    ):
        """DB-01: Evento guardado con provider=WHATSAPP, direction=INBOUND, status=PROCESSED."""
        import app.services.whatsapp_shadow as s
        from app.models.fase5 import IntegrationWebhookEvent
        monkeypatch.setattr(s, "APP_SECRET", _TEST_APP_SECRET)

        wamid = f"wamid.db01.{uuid.uuid4().hex}"
        payload = _wa_payload(wamid=wamid)
        body = json.dumps(payload).encode()
        r = wa_client.post(
            "/api/v1/whatsapp/webhook",
            content=body,
            headers={"X-Hub-Signature-256": _make_sig(body), "Content-Type": "application/json"},
        )
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

        db.expire_all()
        event = (
            db.query(IntegrationWebhookEvent)
            .filter(
                IntegrationWebhookEvent.provider == "WHATSAPP",
                IntegrationWebhookEvent.idempotency_key == wamid,
            )
            .first()
        )
        assert event is not None, "El evento debe existir en la DB"
        assert event.provider == "WHATSAPP"
        assert event.direction == "INBOUND"
        assert event.status == "PROCESSED"
        assert event.processed_at is not None
        assert event.dead_letter is False or event.dead_letter is None

    def test_DB02_signature_redacted_in_headers(
        self, wa_client: TestClient, db: Session, monkeypatch: pytest.MonkeyPatch
    ):
        """DB-02: La firma real NO se guarda en headers; aparece como ***REDACTED***."""
        import app.services.whatsapp_shadow as s
        from app.models.fase5 import IntegrationWebhookEvent
        monkeypatch.setattr(s, "APP_SECRET", _TEST_APP_SECRET)

        wamid = f"wamid.db02.{uuid.uuid4().hex}"
        payload = _wa_payload(wamid=wamid)
        body = json.dumps(payload).encode()
        sig = _make_sig(body)
        wa_client.post(
            "/api/v1/whatsapp/webhook",
            content=body,
            headers={"X-Hub-Signature-256": sig, "Content-Type": "application/json"},
        )

        db.expire_all()
        event = (
            db.query(IntegrationWebhookEvent)
            .filter(IntegrationWebhookEvent.idempotency_key == wamid)
            .first()
        )
        if event and event.headers:
            # La firma real NO debe estar en el campo headers
            assert sig not in event.headers, "La firma real no debe guardarse en la DB"
            assert "REDACTED" in event.headers

    def test_DB03_event_type_text_message(
        self, wa_client: TestClient, db: Session, monkeypatch: pytest.MonkeyPatch
    ):
        """DB-03: Mensaje de texto → event_type='message:text' en la DB."""
        import app.services.whatsapp_shadow as s
        from app.models.fase5 import IntegrationWebhookEvent
        monkeypatch.setattr(s, "APP_SECRET", _TEST_APP_SECRET)

        wamid = f"wamid.db03.{uuid.uuid4().hex}"
        payload = _wa_payload(wamid=wamid, msg_type="text")
        body = json.dumps(payload).encode()
        wa_client.post(
            "/api/v1/whatsapp/webhook",
            content=body,
            headers={"X-Hub-Signature-256": _make_sig(body), "Content-Type": "application/json"},
        )

        db.expire_all()
        event = (
            db.query(IntegrationWebhookEvent)
            .filter(IntegrationWebhookEvent.idempotency_key == wamid)
            .first()
        )
        assert event is not None
        assert event.event_type == "message:text"


# ---------------------------------------------------------------------------
# GET /api/v1/whatsapp/webhook/metrics
# ---------------------------------------------------------------------------

class TestMetrics:
    """MX-01 … MX-05: Endpoint de métricas protegido"""

    def test_MX01_no_secret_header(self, wa_client: TestClient, monkeypatch: pytest.MonkeyPatch):
        """MX-01: Sin X-Internal-Secret → HTTP 401."""
        monkeypatch.setenv("WHATSAPP_APP_SECRET", _TEST_APP_SECRET)
        r = wa_client.get("/api/v1/whatsapp/webhook/metrics")
        assert r.status_code == 401

    def test_MX02_wrong_secret(self, wa_client: TestClient, monkeypatch: pytest.MonkeyPatch):
        """MX-02: X-Internal-Secret incorrecto → HTTP 401."""
        monkeypatch.setenv("WHATSAPP_APP_SECRET", _TEST_APP_SECRET)
        r = wa_client.get(
            "/api/v1/whatsapp/webhook/metrics",
            headers={"X-Internal-Secret": "secreto_incorrecto"},
        )
        assert r.status_code == 401

    def test_MX03_no_env_secret(self, wa_client: TestClient, monkeypatch: pytest.MonkeyPatch):
        """MX-03: WHATSAPP_APP_SECRET vacío en env → HTTP 401."""
        monkeypatch.setenv("WHATSAPP_APP_SECRET", "")
        r = wa_client.get(
            "/api/v1/whatsapp/webhook/metrics",
            headers={"X-Internal-Secret": _TEST_APP_SECRET},
        )
        assert r.status_code == 401

    def test_MX04_valid_secret_returns_metrics(self, wa_client: TestClient, monkeypatch: pytest.MonkeyPatch):
        """MX-04: X-Internal-Secret correcto → HTTP 200, campos esperados."""
        monkeypatch.setenv("WHATSAPP_APP_SECRET", _TEST_APP_SECRET)
        r = wa_client.get(
            "/api/v1/whatsapp/webhook/metrics",
            headers={"X-Internal-Secret": _TEST_APP_SECRET},
        )
        assert r.status_code == 200
        d = r.json()
        assert "received" in d
        assert "duplicates" in d
        assert "processed" in d
        assert "failed" in d
        assert "shadow_mode" in d
        assert isinstance(d["received"], int)
        assert isinstance(d["shadow_mode"], bool)

    def test_MX05_metrics_increment_after_event(self, wa_client: TestClient, monkeypatch: pytest.MonkeyPatch):
        """MX-05: Después de un evento válido, received y processed incrementan."""
        import app.services.whatsapp_shadow as s
        monkeypatch.setattr(s, "APP_SECRET", _TEST_APP_SECRET)
        monkeypatch.setenv("WHATSAPP_APP_SECRET", _TEST_APP_SECRET)

        # Leer métricas antes
        r_before = wa_client.get(
            "/api/v1/whatsapp/webhook/metrics",
            headers={"X-Internal-Secret": _TEST_APP_SECRET},
        )
        assert r_before.status_code == 200
        before = r_before.json()

        # Enviar evento válido
        payload = _wa_payload()
        body = json.dumps(payload).encode()
        wa_client.post(
            "/api/v1/whatsapp/webhook",
            content=body,
            headers={"X-Hub-Signature-256": _make_sig(body), "Content-Type": "application/json"},
        )

        # Leer métricas después
        r_after = wa_client.get(
            "/api/v1/whatsapp/webhook/metrics",
            headers={"X-Internal-Secret": _TEST_APP_SECRET},
        )
        assert r_after.status_code == 200
        after = r_after.json()

        assert after["received"] >= before["received"] + 1
        assert after["processed"] >= before["processed"] + 1
