"""
Webhooks e Integraciones Desacopladas (Fase 5 Hardened):
- Adaptador desacoplado para WhatsApp, Kommo, Mercado Pago, Wompi, PayU, Transportadoras, Ecommerce.
- Validacion estricta contra lista blanca de proveedores.
- Verificacion obligatoria de firma HMAC en tiempo constante (hmac.compare_digest). Firma ausente o invalida: 401.
- Sanitizacion de cabeceras antes de guardar en BD (sin almacenar tokens ni secretos).
- Ciclo de vida real: PENDING -> PROCESSING -> PROCESSED | FAILED/RETRYING -> DEAD_LETTER.
- Confirmacion real de pagos de ecommerce solo ante webhook autenticado con monto exacto.
- Reintentos seguros restringidos exclusivamente a ADMIN con ejecucion del handler real.
"""
from fastapi import APIRouter, Request, HTTPException, Depends, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.db.database import get_db
from app.models.fase5 import IntegrationWebhookEvent
from app.models.erp_documents import SaleOrder, ActivityLog
from app.models.fase4 import SaleOrderPayment
from app.models.users import User
from app.api.dependencies import require_roles, ROLE_ADMIN, get_current_user
from fastapi.responses import PlainTextResponse
from decimal import Decimal
import json, hmac, hashlib, os, datetime
from typing import Optional, Dict, Any

router = APIRouter()

ALLOWED_PROVIDERS = {
    "MERCADOPAGO", "MERCADO_PAGO", "WOMPI", "WHATSAPP", "KOMMO",
    "COORDINADORA", "SERVIENTREGA", "INTERRAPIDISIMO", "ENVIA", "ECOMMERCE", "PAYU"
}

SENSITIVE_HEADERS = {
    "authorization", "cookie", "x-signature", "x-hub-signature-256",
    "x-webhook-signature", "x-api-key", "token", "secret"
}


def _verify_webhook_signature(provider: str, raw_body: bytes, signature_header: Optional[str]) -> bool:
    """
    Verifica la firma HMAC del webhook en tiempo constante con secreto especifico del proveedor.
    Estrictamente exige {PROVIDER}_WEBHOOK_SECRET sin ningun fallback a SECRET_KEY.
    """
    if not signature_header or not raw_body:
        return False
    prov_clean = provider.upper().replace("-", "_")
    secret = os.getenv(f"{prov_clean}_WEBHOOK_SECRET")
    if not secret and prov_clean in ("MERCADOPAGO", "MERCADO_PAGO"):
        secret = os.getenv("MERCADOPAGO_WEBHOOK_SECRET") or os.getenv("MERCADO_PAGO_WEBHOOK_SECRET")
    if not secret:
        return False

    sig = signature_header.strip()
    if "v1=" in sig:
        parts = dict([p.split("=", 1) for p in sig.split(",") if "=" in p])
        sig = parts.get("v1", "").strip()
    elif sig.startswith("sha256="):
        sig = sig.replace("sha256=", "").strip()

    computed = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    if hmac.compare_digest(computed.lower(), sig.lower()):
        return True

    # Comprobar formatos canonicos de serializacion JSON (con o sin espacios)
    try:
        parsed = json.loads(raw_body.decode("utf-8"))
        cand1 = hmac.new(secret.encode("utf-8"), json.dumps(parsed).encode("utf-8"), hashlib.sha256).hexdigest()
        if hmac.compare_digest(cand1.lower(), sig.lower()):
            return True
        cand2 = hmac.new(secret.encode("utf-8"), json.dumps(parsed, separators=(",", ":")).encode("utf-8"), hashlib.sha256).hexdigest()
        if hmac.compare_digest(cand2.lower(), sig.lower()):
            return True
    except Exception:
        pass

    return False


def _sanitize_headers(headers: Dict[str, Any]) -> Dict[str, Any]:
    """Sanitiza cabeceras enmascarando tokens, cookies y secretos."""
    sanitized = {}
    for k, v in headers.items():
        if any(s in k.lower() for s in SENSITIVE_HEADERS):
            sanitized[k] = "[REDACTED]"
        else:
            sanitized[k] = v
    return sanitized


def _process_payment_webhook(provider: str, payload: dict, idem_key: str, db: Session) -> dict:
    """
    Confirma pago de orden de venta ecommerce si el estado es aprobado, la moneda es estrictamente COP y el monto es exacto.
    Utiliza bloqueo pesimista with_for_update para garantizar idempotencia concurrente y exactamente un solo pago.
    """
    data = payload.get("data") or payload
    ref = (
        data.get("external_reference") or
        data.get("reference") or
        payload.get("external_reference") or
        payload.get("order_id") or
        data.get("order_id")
    )
    order = None
    if ref:
        if str(ref).isdigit():
            order = db.query(SaleOrder).filter(SaleOrder.id == int(ref)).with_for_update().first()
        if not order:
            order = db.query(SaleOrder).filter(
                (SaleOrder.pweb_numero == str(ref)) | (SaleOrder.numero == str(ref))
            ).with_for_update().first()
    else:
        return {"action": "NO_ORDER_REFERENCE", "message": "Evento informativo o sin referencia de orden vinculada."}

    if not order:
        raise ValueError(f"No se encontro Pedido de Venta asociado a la referencia '{ref}'.")

    status_val = str(data.get("status") or payload.get("status") or "").upper()
    if status_val not in ("APPROVED", "APROBADO", "PAID", "PAGADO", "COMPLETED", "SUCCESS"):
        return {"action": "PAYMENT_NOT_APPROVED", "order_id": order.id, "payment_status": status_val}

    # Validacion de moneda: estrictamente COP
    currency = str(
        data.get("currency_id") or
        data.get("currency") or
        payload.get("currency") or
        payload.get("currency_id") or
        "COP"
    ).upper()
    if currency != "COP":
        raise ValueError(f"Moneda '{currency}' no admitida para confirmacion de pago. Se requiere estrictamente 'COP'.")

    # Extraer y verificar monto
    raw_amount = data.get("transaction_amount") or data.get("amount") or payload.get("amount") or 0
    if "amount_in_cents" in data:
        raw_amount = data["amount_in_cents"] / 100
    amount_paid = Decimal(str(raw_amount))

    if abs(amount_paid - (order.total_cop or Decimal("0.00"))) > Decimal("0.01"):
        raise ValueError(f"Discrepancia en monto de pago: Recibido ${amount_paid}, Esperado ${order.total_cop}.")

    # Registrar SaleOrderPayment confirmado con bloqueo estricto de idempotencia
    pay_key = f"PAY_WEBHOOK_{provider}_{idem_key}"
    existing_payment = db.query(SaleOrderPayment).filter(SaleOrderPayment.idempotency_key == pay_key).first()
    if not existing_payment:
        # Tambien verificar si la orden ya esta pagada en su totalidad por webhook para evitar duplicados concurrentes
        if order.saldo_cop == Decimal("0.00") and order.anticipo_cop == order.total_cop:
            return {"action": "PAYMENT_ALREADY_CONFIRMED", "order_id": order.id, "amount": float(amount_paid)}

        payment = SaleOrderPayment(
            sale_order_id=order.id,
            customer_id=order.customer_id,
            tipo="PAGO_TOTAL",
            monto=amount_paid,
            moneda="COP",
            metodo_pago=provider,
            fecha=datetime.datetime.utcnow().date(),
            referencia_bancaria=str(data.get("id") or payload.get("id") or idem_key),
            usuario="WEBHOOK",
            idempotency_key=pay_key,
            estado="CONFIRMADO",
            notes=f"Pago confirmado automaticamente via webhook {provider} (Evento: {idem_key})"
        )
        db.add(payment)

        order.anticipo_cop = order.total_cop
        order.saldo_cop = Decimal("0.00")
        has_reservations = any(l.estado == "RESERVADA" for l in order.order_lines) if order.order_lines else False
        order.estado = "LISTO_ENTREGA" if has_reservations else "PAGADO"

        log = ActivityLog(
            entity_type="VEN",
            entity_id=order.id,
            entity_numero=order.pweb_numero or order.numero,
            action="PAYMENT_RECEIVED",
            description=f"Pago de ${float(amount_paid):,.0f} COP confirmado por webhook {provider}.",
            new_estado=order.estado,
            user_name="WEBHOOK"
        )
        db.add(log)
        db.flush()

    return {"action": "PAYMENT_CONFIRMED", "order_id": order.id, "amount": float(amount_paid)}


@router.get("/whatsapp")
def verify_whatsapp(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
    hub_verify_token: str = Query(None, alias="hub.verify_token")
):
    """Verificacion de webhook de Meta WhatsApp Cloud API sin token por defecto."""
    verify_token = os.getenv("WHATSAPP_VERIFY_TOKEN")
    if not verify_token:
        raise HTTPException(status_code=403, detail="WHATSAPP_VERIFY_TOKEN no configurado en el servidor.")

    if hub_mode == "subscribe" and hub_verify_token == verify_token:
        return PlainTextResponse(content=hub_challenge or "")
    raise HTTPException(status_code=403, detail="Fallo de verificacion del token de WhatsApp.")


@router.post("/whatsapp")
async def receive_whatsapp(request: Request, db: Session = Depends(get_db)):
    """Recepcion WhatsApp con verificacion HMAC y registro auditable."""
    raw_body = await request.body()
    sig_header = request.headers.get("X-Hub-Signature-256")
    if not _verify_webhook_signature("WHATSAPP", raw_body, sig_header):
        raise HTTPException(status_code=401, detail="Firma de WhatsApp ausente o invalida.")

    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except Exception:
        payload = {}

    body_sha = hashlib.sha256(raw_body).hexdigest()[:32]
    idem_key = sig_header or f"WA_{body_sha}"
    existing = db.query(IntegrationWebhookEvent).filter(
        IntegrationWebhookEvent.provider == "WHATSAPP",
        IntegrationWebhookEvent.idempotency_key == idem_key
    ).first()
    if existing:
        return {"status": "success", "idempotent_replay": True}

    sanitized_headers = _sanitize_headers(dict(request.headers))
    event = IntegrationWebhookEvent(
        provider="WHATSAPP",
        event_type="MESSAGE_RECEIVED",
        idempotency_key=idem_key,
        direction="INBOUND",
        payload=json.dumps(payload),
        headers=json.dumps(sanitized_headers),
        status="PROCESSED",
        processed_at=datetime.datetime.utcnow()
    )
    db.add(event)
    db.commit()
    return {"status": "success", "event_id": event.id}


@router.post("/system/retry-failed", response_model=dict)
def retry_failed_webhooks(
    max_retries: int = 3,
    provider: Optional[str] = None,
    user: User = Depends(require_roles(*ROLE_ADMIN)),
    db: Session = Depends(get_db)
):
    """
    Reintenta eventos en estado FAILED o RETRYING ejecutando su logica real.
    Restringido exclusivamente a rol ADMIN (403 para otros).
    Si supera max_retries, se traslada a DEAD_LETTER.
    """
    q = db.query(IntegrationWebhookEvent).filter(
        IntegrationWebhookEvent.status.in_(["FAILED", "RETRYING"]),
        IntegrationWebhookEvent.dead_letter == False
    )
    if provider:
        q = q.filter(IntegrationWebhookEvent.provider == provider.upper())

    failed_events = q.all()
    reprocessed = 0
    moved_to_dead_letter = 0

    for ev in failed_events:
        ev.attempts += 1
        limit = max_retries if max_retries is not None else (ev.max_attempts or 3)
        if ev.attempts >= limit:
            ev.dead_letter = True
            ev.status = "DEAD_LETTER"
            ev.last_error = f"Supero el limite maximo de {limit} intentos. Movido a cola de errores permanentes (dead-letter)."
            moved_to_dead_letter += 1
        else:
            try:
                payload = json.loads(ev.payload) if ev.payload else {}
                if ev.provider in ("MERCADOPAGO", "MERCADO_PAGO", "WOMPI", "PAYU"):
                    _process_payment_webhook(ev.provider, payload, ev.idempotency_key, db)
                ev.status = "PROCESSED"
                ev.processed_at = datetime.datetime.utcnow()
                ev.last_error = None
                reprocessed += 1
            except Exception as ex:
                ev.last_error = str(ex)
                if ev.attempts >= limit:
                    ev.dead_letter = True
                    ev.status = "DEAD_LETTER"
                    moved_to_dead_letter += 1
                else:
                    ev.status = "RETRYING"
        ev.updated_at = datetime.datetime.utcnow()

    db.commit()
    return {
        "status": "success",
        "total_evaluated": len(failed_events),
        "reprocessed_count": reprocessed,
        "dead_letter_count": moved_to_dead_letter
    }


@router.get("/system/events", response_model=dict)
def list_webhook_events(
    provider: Optional[str] = None,
    status: Optional[str] = None,
    dead_letter: Optional[bool] = None,
    limit: int = 50,
    user: User = Depends(require_roles(*ROLE_ADMIN)),
    db: Session = Depends(get_db)
):
    """Lista eventos de integracion y webhooks auditables (solo ADMIN)."""
    q = db.query(IntegrationWebhookEvent)
    if provider:
        q = q.filter(IntegrationWebhookEvent.provider == provider.upper())
    if status:
        q = q.filter(IntegrationWebhookEvent.status == status)
    if dead_letter is not None:
        q = q.filter(IntegrationWebhookEvent.dead_letter == dead_letter)

    events = q.order_by(IntegrationWebhookEvent.created_at.desc()).limit(limit).all()
    return {
        "status": "success",
        "data": [{
            "id": e.id,
            "provider": e.provider,
            "event_type": e.event_type,
            "idempotency_key": e.idempotency_key,
            "direction": e.direction,
            "status": e.status,
            "attempts": e.attempts,
            "dead_letter": e.dead_letter,
            "last_error": e.last_error,
            "created_at": e.created_at.isoformat() if e.created_at else None,
            "processed_at": e.processed_at.isoformat() if e.processed_at else None,
        } for e in events]
    }


@router.post("/{provider}")
async def receive_generic_webhook(
    provider: str,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Adaptador seguro de webhooks para pasarelas, CRM y transportadoras:
    - Verificacion estricta de proveedor contra lista permitida.
    - Verificacion HMAC obligatoria para pasarelas (401 si falta o es invalida).
    - Sanitizacion de cabeceras antes de persistir.
    - Ciclo de vida real: PENDING -> PROCESSING -> PROCESSED o FAILED -> DEAD_LETTER.
    - Confirmacion de pagos de venta real ante estado aprobado y monto exacto.
    """
    provider_canon = provider.upper().replace("-", "_")
    if provider_canon not in ALLOWED_PROVIDERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Proveedor de webhook '{provider}' no soportado o no permitido."
        )

    raw_body = await request.body()
    sig_header = (
        request.headers.get("x-signature") or
        request.headers.get("x-hub-signature-256") or
        request.headers.get("x-webhook-signature")
    )

    # Firma HMAC obligatoria para TODOS los proveedores sin excepcion
    if not _verify_webhook_signature(provider_canon, raw_body, sig_header):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Firma de webhook ausente o invalida para el proveedor '{provider_canon}'."
        )

    try:
        payload = json.loads(raw_body.decode("utf-8")) if raw_body else {}
    except Exception:
        payload = {"raw_text": raw_body.decode("utf-8", errors="ignore")}

    idem_key = (
        request.headers.get("x-idempotency-key") or
        request.headers.get("x-event-id") or
        request.headers.get("idempotency-key") or
        str(payload.get("id") or payload.get("event_id") or payload.get("idempotency_key") or "")
    )
    if not idem_key:
        body_sha = hashlib.sha256(raw_body).hexdigest()[:32]
        idem_key = f"{provider_canon}_{body_sha}"

    # Deduplicacion estricta por proveedor y clave
    existing = db.query(IntegrationWebhookEvent).filter(
        IntegrationWebhookEvent.provider == provider_canon,
        IntegrationWebhookEvent.idempotency_key == idem_key
    ).first()

    if existing:
        return {
            "status": "success",
            "idempotent_replay": True,
            "event_id": existing.id,
            "provider": provider_canon,
            "message": "Evento ya procesado previamente (Idempotent Replay)."
        }

    # Registro transaccional en PROCESSING con manejo de concurrencia
    sanitized_headers = _sanitize_headers(dict(request.headers))
    event_type = str(payload.get("type") or payload.get("event") or payload.get("action") or "NOTIFICATION")

    event = IntegrationWebhookEvent(
        provider=provider_canon,
        event_type=event_type,
        idempotency_key=idem_key,
        direction="INBOUND",
        payload=json.dumps(payload),
        headers=json.dumps(sanitized_headers),
        status="PROCESSING",
        attempts=1,
        dead_letter=False
    )
    try:
        db.add(event)
        db.flush()
    except Exception:
        db.rollback()
        existing = db.query(IntegrationWebhookEvent).filter(
            IntegrationWebhookEvent.provider == provider_canon,
            IntegrationWebhookEvent.idempotency_key == idem_key
        ).first()
        if existing:
            return {
                "status": "success",
                "idempotent_replay": True,
                "event_id": existing.id,
                "provider": provider_canon,
                "message": "Evento ya procesado previamente (Idempotent Replay)."
            }
        raise

    is_payment_gateway = provider_canon in ("MERCADOPAGO", "MERCADO_PAGO", "WOMPI", "PAYU")
    try:
        if is_payment_gateway:
            _process_payment_webhook(provider_canon, payload, idem_key, db)
        event.status = "PROCESSED"
        event.processed_at = datetime.datetime.utcnow()
        event.last_error = None
        db.commit()
        db.refresh(event)
        return {
            "status": "success",
            "idempotent_replay": False,
            "event_id": event.id,
            "provider": provider_canon,
            "event_status": "PROCESSED"
        }
    except Exception as ex:
        event.status = "FAILED"
        event.last_error = str(ex)
        if event.attempts >= event.max_attempts:
            event.status = "DEAD_LETTER"
            event.dead_letter = True
        db.commit()
        return {
            "status": "failed",
            "idempotent_replay": False,
            "event_id": event.id,
            "provider": provider_canon,
            "event_status": event.status,
            "error": str(ex)
        }
