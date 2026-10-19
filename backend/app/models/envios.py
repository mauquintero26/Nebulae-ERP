"""Registro de los mensajes que el ERP le manda al cliente (Bloque 3, T8: U16-envio y U16-entrega).

Una fila por intento de WhatsApp automatico (salga o no): el resultado, los ids de Chatwoot para consultar despues si
le llego y el texto enviado SIN el enlace (el token del enlace nunca se guarda: ver envio_whatsapp.ocultar_enlace).
La escribe app/core/envio_whatsapp.enviar_documento y la actualiza verificar_envio. Migracion fa6_030.

- document_type: 'SC' | 'COT' | 'PVEN'; document_id y document_numero: el documento enviado.
- proposito: 'CONFIRMACION' | 'CONSULTA' (enlace de consulta del pedido) | 'SEGUIMIENTO' (recordatorio, T11).
- canal: 'WhatsApp' (el unico que escribe este bloque); destino: el numero en e164 (o lo que habia, si no era valido).
- modo: 'TEXTO' (dentro de las 24 h) | 'PLANTILLA' | NULL (no salio); plantilla: el nombre de la de Meta usada.
- estado: 'ENVIADO' | 'NO_ENVIADO' y, al verificar, 'ENTREGADO' | 'LEIDO' | 'FALLIDO'; motivo: por que no salio;
  detalle: el error de Chatwoot o de WhatsApp (sin el token de Chatwoot).
- created_at / updated_at: UTC sin zona (como utcnow); se serializan con 'Z' (fechas.iso_z).
"""
from datetime import datetime

from sqlalchemy import Column, DateTime, Index, Integer, String, Text

from app.db.database import Base

# El nombre de una plantilla de Meta cabe en plantilla VARCHAR(100) (fa6_030): el PUT de la configuracion no acepta uno
# mas largo (envio_whatsapp.validar_cambios), asi el registro de un envio nunca falla despues de mandarlo (r1, L4/R8).
PLANTILLA_MAX = 100


class EnvioAlCliente(Base):
    __tablename__ = "envios_al_cliente"
    __table_args__ = (Index("ix_envios_al_cliente_documento", "document_type", "document_id"),)

    id                       = Column(Integer, primary_key=True, index=True)
    document_type            = Column(String(10), nullable=False)
    document_id              = Column(Integer, nullable=False)
    document_numero          = Column(String(50), nullable=False)
    proposito                = Column(String(20), nullable=False, default="CONFIRMACION", server_default="CONFIRMACION")
    canal                    = Column(String(20), nullable=False)
    destino                  = Column(String(200), nullable=False)
    modo                     = Column(String(20), nullable=True)
    plantilla                = Column(String(PLANTILLA_MAX), nullable=True)
    mensaje                  = Column(Text, nullable=False)
    estado                   = Column(String(20), nullable=False)
    motivo                   = Column(String(40), nullable=True)
    detalle                  = Column(Text, nullable=True)
    chatwoot_conversation_id = Column(String(50), nullable=True)
    chatwoot_message_id      = Column(String(50), nullable=True)
    user_name                = Column(String(150), nullable=True)
    created_at               = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at               = Column(DateTime, nullable=False, default=datetime.utcnow)
