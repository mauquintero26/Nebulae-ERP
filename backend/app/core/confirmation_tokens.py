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
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    row = db.query(DocumentConfirmationToken).filter(
        DocumentConfirmationToken.token_hash == token_hash
    ).first()
    if not row or row.used_at is not None or row.expires_at < datetime.utcnow():
        return None
    row.used_at = datetime.utcnow()
    db.commit()
    return (row.document_type, row.document_id)


def peek_token(db: Session, token: str) -> tuple[str, int] | None:
    """Como verify_and_consume_token pero NO marca usado -- para el GET de solo lectura."""
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    row = db.query(DocumentConfirmationToken).filter(
        DocumentConfirmationToken.token_hash == token_hash
    ).first()
    if not row or row.used_at is not None or row.expires_at < datetime.utcnow():
        return None
    return (row.document_type, row.document_id)
