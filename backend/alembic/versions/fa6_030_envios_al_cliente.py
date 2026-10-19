"""Registro de los mensajes de WhatsApp al cliente (Bloque 3, T8: U16-envio, U16-entrega y C24).

Solo aditiva (R11): una tabla nueva y su indice; ninguna fila existente cambia.
- envios_al_cliente: una fila por intento de WhatsApp automatico (salga o no) con su resultado, los ids de Chatwoot
  para consultar despues si le llego, y el texto enviado SIN el enlace (el token del enlace nunca se guarda). La
  escriben enviar_documento y verificar_envio (app/core/envio_whatsapp.py); modelo en app/models/envios.py.
- ix_envios_al_cliente_documento (document_type, document_id): los envios de un documento.

Revision ID: fa6_030
Revises: fa6_029
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "fa6_030"
down_revision: Union[str, Sequence[str], None] = "fa6_029"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLA = "envios_al_cliente"
_INDICE = "ix_envios_al_cliente_documento"


def upgrade() -> None:
    op.create_table(
        _TABLA,
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("document_type", sa.String(length=10), nullable=False),
        sa.Column("document_id", sa.Integer(), nullable=False),
        sa.Column("document_numero", sa.String(length=50), nullable=False),
        sa.Column("proposito", sa.String(length=20), nullable=False, server_default="CONFIRMACION"),
        sa.Column("canal", sa.String(length=20), nullable=False),
        sa.Column("destino", sa.String(length=200), nullable=False),
        sa.Column("modo", sa.String(length=20), nullable=True),
        sa.Column("plantilla", sa.String(length=100), nullable=True),
        sa.Column("mensaje", sa.Text(), nullable=False),
        sa.Column("estado", sa.String(length=20), nullable=False),
        sa.Column("motivo", sa.String(length=40), nullable=True),
        sa.Column("detalle", sa.Text(), nullable=True),
        sa.Column("chatwoot_conversation_id", sa.String(length=50), nullable=True),
        sa.Column("chatwoot_message_id", sa.String(length=50), nullable=True),
        sa.Column("user_name", sa.String(length=150), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_envios_al_cliente_id", _TABLA, ["id"])
    op.create_index(_INDICE, _TABLA, ["document_type", "document_id"])


def downgrade() -> None:
    # Se niega ANTES de tocar nada si hay envios registrados (como fa6_024 a fa6_029): bajar de version borraria el
    # historial de los mensajes al cliente y sus ids de Chatwoot. R11: en los ambientes compartidos nunca se baja.
    con_datos = op.get_bind().execute(sa.text(f"SELECT count(*) FROM {_TABLA}")).scalar()
    if con_datos:
        raise RuntimeError(
            f"No se puede bajar de fa6_030: hay {con_datos} envios al cliente registrados. Bajar de version borraria "
            "ese historial: respaldarlo antes.")
    op.drop_index(_INDICE, table_name=_TABLA)
    op.drop_index("ix_envios_al_cliente_id", table_name=_TABLA)
    op.drop_table(_TABLA)
