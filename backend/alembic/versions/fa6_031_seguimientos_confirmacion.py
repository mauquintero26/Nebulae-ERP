"""Recordatorio automatico al cliente (Bloque 3, T11: U16-seguimiento y C24).

Solo aditiva (R11): una tabla nueva, su UNIQUE y su indice; ninguna fila existente cambia.
- seguimientos_confirmacion: una fila por SC o COT enviada al cliente (UNIQUE document_type + document_id, se reusa en
  cada envio) con el estado del recordatorio (ACTIVO | AGOTADO | DETENIDO), cuando le toca, cuantos salieron y por que
  termino. Vive aparte de customer_requests y sales_quotations: su updated_at (onupdate) reiniciaria la alerta de
  atraso en cada vuelta. La escribe app/core/seguimiento_confirmacion.py; modelo en app/models/confirmation.py.
- ix_seguimientos_confirmacion_estado_proximo (estado, proximo_at): la consulta de la revision automatica (los ACTIVO
  vencidos, ORDER BY proximo_at LIMIT 50).

Revision ID: fa6_031
Revises: fa6_030
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "fa6_031"
down_revision: Union[str, Sequence[str], None] = "fa6_030"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLA = "seguimientos_confirmacion"
_UNICO = "uq_seguimientos_confirmacion_documento"
_INDICE = "ix_seguimientos_confirmacion_estado_proximo"


def upgrade() -> None:
    op.create_table(
        _TABLA,
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("document_type", sa.String(length=10), nullable=False),
        sa.Column("document_id", sa.Integer(), nullable=False),
        sa.Column("document_numero", sa.String(length=30), nullable=True),
        sa.Column("estado", sa.String(length=20), nullable=False, server_default="ACTIVO"),
        sa.Column("canal", sa.String(length=20), nullable=True),
        sa.Column("iniciado_at", sa.DateTime(), nullable=False),
        sa.Column("iniciado_por", sa.String(length=150), nullable=True),
        sa.Column("ultimo_contacto_at", sa.DateTime(), nullable=False),
        sa.Column("proximo_at", sa.DateTime(), nullable=True),
        sa.Column("recordatorios_enviados", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("ultimo_recordatorio_at", sa.DateTime(), nullable=True),
        sa.Column("ultimo_resultado", sa.JSON(), nullable=True),
        sa.Column("motivo_fin", sa.String(length=30), nullable=True),
        sa.Column("terminado_at", sa.DateTime(), nullable=True),
        # UTC sin zona, como el resto de las fechas (el modelo la pone con utcnow; esto solo cubre un INSERT a mano).
        sa.Column("updated_at", sa.DateTime(), nullable=True, server_default=sa.text("(now() AT TIME ZONE 'utc')")),
        sa.UniqueConstraint("document_type", "document_id", name=_UNICO),
    )
    op.create_index(_INDICE, _TABLA, ["estado", "proximo_at"])


def downgrade() -> None:
    # Se niega ANTES de tocar nada si hay seguimientos (como fa6_024 a fa6_030): bajar de version borraria el estado de
    # los recordatorios programados. R11: en los ambientes compartidos nunca se baja.
    con_datos = op.get_bind().execute(sa.text(f"SELECT count(*) FROM {_TABLA}")).scalar()
    if con_datos:
        raise RuntimeError(
            f"No se puede bajar de fa6_031: hay {con_datos} seguimientos de confirmacion registrados. Bajar de version "
            "borraria los recordatorios programados: respaldarlos antes.")
    op.drop_index(_INDICE, table_name=_TABLA)
    op.drop_table(_TABLA)
