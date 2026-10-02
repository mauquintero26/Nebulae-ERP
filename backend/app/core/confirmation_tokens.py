# backend/app/core/confirmation_tokens.py
"""
Tokens de confirmacion publica de documentos (SC, COT) por link de un solo
uso. Duplica deliberadamente el patron de reset de contraseña
(backend/app/api/v1/auth.py: forgot_password/reset_password) en vez de
refactorizar ese modulo ya probado y comiteado: mismo secrets.token_urlsafe(32)
+ hashlib.sha256 para el token, misma idea de solo persistir el hash.

El token crudo (`raw_token`) SOLO vive en memoria durante el request y en el
link enviado por correo -- nunca se persiste ni se loguea.
"""
import secrets, hashlib
from datetime import datetime, timedelta
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.models.confirmation import DocumentConfirmationToken

TOKEN_TTL_DAYS = 2  # mismo umbral que la alerta de 2 dias ya configurable


def create_confirmation_token(db: Session, document_type: str, document_id: int) -> str:
    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    row = DocumentConfirmationToken(
        document_type=document_type, document_id=document_id, token_hash=token_hash,
        created_at=datetime.utcnow(), expires_at=datetime.utcnow() + timedelta(days=TOKEN_TTL_DAYS),
    )
    db.add(row); db.commit()
    return raw_token


def verify_and_consume_token(db: Session, token: str) -> tuple[str, int] | None:
    """Reclama el token de forma atomica: un UPDATE condicional (no un SELECT seguido
    de un UPDATE separado) para que dos POST concurrentes con el mismo token nunca
    puedan pasar ambos la validacion -- el segundo UPDATE, al re-evaluar su propio
    WHERE despues de que el primero ya committeo used_at, simplemente no afecta
    ninguna fila. Mismo patron de UPDATE parametrizado que ya usa restaurar_solicitud
    en erp_ventas.py (db.execute(text(...), {...}), nunca interpolacion de string)."""
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    now = datetime.utcnow()
    result = db.execute(
        text("""
            UPDATE document_confirmation_tokens
            SET used_at = :now
            WHERE token_hash = :token_hash AND used_at IS NULL AND expires_at > :now
            RETURNING document_type, document_id
        """),
        {"token_hash": token_hash, "now": now},
    )
    row = result.first()
    db.commit()
    if not row:
        return None
    return (row[0], row[1])


def revoke_pending_tokens(db: Session, document_type: str, document_id: int) -> None:
    """Invalida cualquier token sin usar de este documento -- se llama en cada punto
    donde una SC sale del ciclo vigente de Gate 1: cancelar_solicitud, cualquier
    transicion real de estado via update_solicitud (no solo el reset a BORRADOR),
    restaurar_solicitud, y siempre antes de emitir un token nuevo en
    enviar_solicitud_para_confirmacion (ver erp_ventas.py) -- para que un link ya
    enviado por correo nunca pueda confirmar un documento que ya cambio de curso por
    otra via, cualquiera que sea. Reutiliza used_at como marca de invalidacion
    (consistente con el modelo existente, sin agregar columnas nuevas): un token
    revocado es, para todo efecto practico, identico a uno ya usado."""
    now = datetime.utcnow()
    db.execute(
        text("""
            UPDATE document_confirmation_tokens
            SET used_at = :now
            WHERE document_type = :document_type AND document_id = :document_id AND used_at IS NULL
        """),
        {"document_type": document_type, "document_id": document_id, "now": now},
    )
    db.commit()


def peek_token(db: Session, token: str) -> tuple[str, int] | None:
    """Como verify_and_consume_token pero NO marca usado -- para el GET de solo lectura."""
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    row = db.query(DocumentConfirmationToken).filter(
        DocumentConfirmationToken.token_hash == token_hash
    ).first()
    if not row or row.used_at is not None or row.expires_at < datetime.utcnow():
        return None
    return (row.document_type, row.document_id)
