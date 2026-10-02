# backend/app/models/confirmation.py
"""
Modelo para el mecanismo de confirmacion publica por link (Gate 1 y Gate 2
del plan de trazabilidad de fechas y confirmacion de cliente).

Duplica deliberadamente el patron de PasswordResetToken (backend/app/models/users.py)
en vez de reutilizarlo: mismo uso de token de un solo uso + SHA-256, pero para
documentos de venta (SC, COT) en vez de usuarios. Solo se guarda el hash del
token -- el token crudo nunca se persiste ni se loguea.
"""
from sqlalchemy import Column, Integer, String, DateTime
from app.db.database import Base
from datetime import datetime


class DocumentConfirmationToken(Base):
    __tablename__ = "document_confirmation_tokens"
    id              = Column(Integer, primary_key=True, index=True)
    document_type   = Column(String(10), nullable=False)   # 'SC' | 'COT'
    document_id     = Column(Integer, nullable=False)
    token_hash      = Column(String(64), nullable=False, index=True)
    created_at      = Column(DateTime, default=datetime.utcnow)
    expires_at      = Column(DateTime, nullable=False)
    used_at         = Column(DateTime, nullable=True)
