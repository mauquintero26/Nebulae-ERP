# backend/app/models/confirmation.py
"""
Modelo para el mecanismo de confirmacion publica por link (Gate 1 y Gate 2
del plan de trazabilidad de fechas y confirmacion de cliente).

Duplica deliberadamente el patron de PasswordResetToken (backend/app/models/users.py)
en vez de reutilizarlo: mismo uso de token de un solo uso + SHA-256, pero para
documentos de venta (SC, COT) en vez de usuarios. Solo se guarda el hash del
token -- el token crudo nunca se persiste ni se loguea. Desde el Bloque 3 la misma
tabla guarda tambien el enlace de consulta del pedido (PVEN), que no confirma nada:
ver TIPOS_CONFIRMACION / TIPOS_CONSULTA en app/core/confirmation_tokens.py.

Bloque 3, T11 (U16-seguimiento, fa6_031): SeguimientoConfirmacion, el recordatorio automatico al cliente de una SC o
una COT que espera su confirmacion. Vive en su propia tabla y NO en customer_requests ni sales_quotations: esas tablas
tienen updated_at con onupdate, y guardar ahi los contadores reiniciaria la alerta de atraso en cada vuelta.
"""
from sqlalchemy import JSON, Column, DateTime, Index, Integer, String, UniqueConstraint
from app.db.database import Base
from datetime import datetime


class DocumentConfirmationToken(Base):
    __tablename__ = "document_confirmation_tokens"
    id              = Column(Integer, primary_key=True, index=True)
    document_type   = Column(String(10), nullable=False)   # 'SC' | 'COT' | 'PVEN' (PVEN: consulta del pedido, B3)
    document_id     = Column(Integer, nullable=False)
    token_hash      = Column(String(64), nullable=False, index=True)
    created_at      = Column(DateTime, default=datetime.utcnow)
    expires_at      = Column(DateTime, nullable=False)
    used_at         = Column(DateTime, nullable=True)
    # B3 T1 (fa6_026): 'CONFIRMADO' | 'CAMBIOS' | 'REVOCADO' (constantes RESULTADO_* de app/core/confirmation_tokens.py);
    # NULL = sin usar, vencido o usado antes de esta version.
    resultado       = Column(String(20), nullable=True)


class SeguimientoConfirmacion(Base):
    """Una fila por documento (UNIQUE document_type + document_id), que se reusa en cada envio (iniciar la reinicia).
    La escribe y la lee app/core/seguimiento_confirmacion.py. Fechas en UTC sin zona, como el resto.

    - document_type: 'SC' | 'COT'; document_numero: el numero del documento (para la revision y sus conteos).
    - estado: 'ACTIVO' (programado) | 'AGOTADO' (ya salieron todos y el cliente no respondio) | 'DETENIDO'.
    - canal: el canal del envio ('WhatsApp' | 'Email' | 'Otro' | NULL): el recordatorio sale por el mismo medio.
    - iniciado_at / iniciado_por: el envio (o reenvio) que lo programo; ultimo_contacto_at: ese envio, el ultimo
      contacto del Chatter que lo corrio o el ultimo recordatorio que salio; proximo_at: cuando le toca (NULL si no).
    - recordatorios_enviados: los reclamados en este ciclo; ultimo_recordatorio_at y ultimo_resultado ({canal, motivo,
      mensaje}, sin telefonos ni correos): el ultimo intento.
    - motivo_fin / terminado_at: por que y cuando se detuvo o se agoto.
    """
    __tablename__ = "seguimientos_confirmacion"
    __table_args__ = (
        UniqueConstraint("document_type", "document_id", name="uq_seguimientos_confirmacion_documento"),
        Index("ix_seguimientos_confirmacion_estado_proximo", "estado", "proximo_at"),
    )
    id                     = Column(Integer, primary_key=True)
    document_type          = Column(String(10), nullable=False)
    document_id            = Column(Integer, nullable=False)
    document_numero        = Column(String(30), nullable=True)
    estado                 = Column(String(20), nullable=False, default="ACTIVO", server_default="ACTIVO")
    canal                  = Column(String(20), nullable=True)
    iniciado_at            = Column(DateTime, nullable=False)
    iniciado_por           = Column(String(150), nullable=True)
    ultimo_contacto_at     = Column(DateTime, nullable=False)
    proximo_at             = Column(DateTime, nullable=True)
    recordatorios_enviados = Column(Integer, nullable=False, default=0, server_default="0")
    ultimo_recordatorio_at = Column(DateTime, nullable=True)
    ultimo_resultado       = Column(JSON, nullable=True)
    motivo_fin             = Column(String(30), nullable=True)
    terminado_at           = Column(DateTime, nullable=True)
    updated_at             = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
