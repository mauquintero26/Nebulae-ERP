"""
fa6_021 - Catalogo de Casilleros + columnas tipo_envio/casillero_id en PEC

Soporta el rediseno de "Mercancia en Transito": el tracking de un Pedido de
Compra (PurchaseOrderFull) pasa a tener un pipeline de etapas dinamico
(guardado como JSON en web_builder_config, ver _load_tracking_config en
erp_compras.py) en vez de las 4 etapas fijas que create_pec generaba antes.
Cada PEC necesita saber por que ruta se envia (tipo_envio: casillero|directo)
y, opcionalmente, cual casillero es el punto de recepcion por defecto.

tipo_envio y casillero ya existian como claves aceptadas en el PATCH de
update_pec, pero NUNCA fueron columnas reales -- setattr(p, k, v) sobre un
atributo no mapeado no se persiste (se pierde en el siguiente refresh/reload).
Esta migracion los convierte en columnas reales.

Revision ID: fa6_021
Revises: fa6_020
Create Date: 2026-09-24
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "fa6_021"
down_revision: Union[str, Sequence[str], None] = "fa6_020"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS casilleros (
            id              SERIAL PRIMARY KEY,
            name            VARCHAR(200) NOT NULL,
            address         VARCHAR(300),
            reception_point VARCHAR(300),
            contact_name    VARCHAR(150),
            phone           VARCHAR(50),
            email           VARCHAR(150),
            city            VARCHAR(100),
            country         VARCHAR(100) DEFAULT 'Estados Unidos',
            notes           TEXT,
            is_active       BOOLEAN DEFAULT TRUE,
            created_at      TIMESTAMP DEFAULT NOW(),
            updated_at      TIMESTAMP DEFAULT NOW()
        )
    """))
    conn.execute(sa.text(
        "ALTER TABLE purchase_orders_full ADD COLUMN IF NOT EXISTS tipo_envio VARCHAR(20) DEFAULT 'casillero'"
    ))
    conn.execute(sa.text(
        "ALTER TABLE purchase_orders_full ADD COLUMN IF NOT EXISTS casillero_id INTEGER REFERENCES casilleros(id)"
    ))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text(
        "ALTER TABLE purchase_orders_full DROP COLUMN IF EXISTS casillero_id"
    ))
    conn.execute(sa.text(
        "ALTER TABLE purchase_orders_full DROP COLUMN IF EXISTS tipo_envio"
    ))
    conn.execute(sa.text("DROP TABLE IF EXISTS casilleros"))
