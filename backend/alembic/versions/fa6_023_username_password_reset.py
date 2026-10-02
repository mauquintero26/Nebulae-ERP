"""
fa6_023 - username de login + reset de contraseña por correo

Agrega users.username (nullable, unique) para permitir login con username
O email. Crea password_reset_tokens para el flujo de "olvidé mi contraseña":
guarda solo el SHA-256 del token de un solo uso (nunca el token crudo),
con expiracion e indicador de uso.

Revision ID: fa6_023
Revises: fa6_022
Create Date: 2026-10-01
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "fa6_023"
down_revision: Union[str, Sequence[str], None] = "fa6_022"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(32)"
    ))
    conn.execute(sa.text(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_username ON users (username)"
    ))
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id          SERIAL PRIMARY KEY,
            user_id     INTEGER NOT NULL REFERENCES users(id),
            token_hash  VARCHAR(64) NOT NULL,
            created_at  TIMESTAMP DEFAULT NOW(),
            expires_at  TIMESTAMP NOT NULL,
            used_at     TIMESTAMP
        )
    """))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_password_reset_tokens_token_hash "
        "ON password_reset_tokens (token_hash)"
    ))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_password_reset_tokens_user_id "
        "ON password_reset_tokens (user_id)"
    ))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DROP TABLE IF EXISTS password_reset_tokens"))
    conn.execute(sa.text("DROP INDEX IF EXISTS ix_users_username"))
    conn.execute(sa.text("ALTER TABLE users DROP COLUMN IF EXISTS username"))
