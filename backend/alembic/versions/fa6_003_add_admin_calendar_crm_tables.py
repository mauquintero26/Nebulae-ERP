"""fa6_003 - add admin_config, calendar_events, crm_config tables

Revision ID: fa6_003
Revises: fa6_002
Create Date: 2026-09-08

Contexto:
  Estas tres tablas existian en staging (erp_staging_20260908_132152) pero
  no estaban definidas en ninguna migracion Alembic ni en el ORM.
  Esto causaba la diferencia de 80 vs 77 tablas entre staging y erp_test.

  Solucion GO/NO-GO V2.1:
    - Creados modelos SQLAlchemy en app/models/admin_calendar_crm.py
    - Esta migracion los registra canonicamente en Alembic
    - El esquema queda canonico: staging == erp_test == 80 tablas post-upgrade

  Nota sobre idempotencia:
    Se usa CREATE TABLE IF NOT EXISTS porque estas tablas pueden existir ya
    en bases como staging (creadas por create_all() en versiones anteriores).
    El IF NOT EXISTS garantiza que upgrade() es seguro de re-ejecutar.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "fa6_003"
down_revision = "fa6_002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # admin_config — configuracion clave/valor del sistema administrativo
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS admin_config (
            key VARCHAR NOT NULL,
            value VARCHAR,
            description TEXT,
            updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
            PRIMARY KEY (key)
        )
    """)

    # ------------------------------------------------------------------
    # calendar_events — eventos con sincronizacion Google/Microsoft
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS calendar_events (
            id SERIAL NOT NULL,
            title VARCHAR NOT NULL,
            description TEXT,
            start_datetime TIMESTAMP WITHOUT TIME ZONE,
            end_datetime TIMESTAMP WITHOUT TIME ZONE,
            event_type VARCHAR,
            location VARCHAR,
            customer_id INTEGER,
            customer_name VARCHAR,
            created_by VARCHAR,
            google_event_id VARCHAR,
            microsoft_event_id VARCHAR,
            sync_source VARCHAR,
            color VARCHAR,
            created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
            updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
            PRIMARY KEY (id)
        )
    """)

    # ------------------------------------------------------------------
    # crm_config — configuracion de pipeline y alertas de CRM
    # ------------------------------------------------------------------
    op.execute("""
        CREATE TABLE IF NOT EXISTS crm_config (
            id SERIAL NOT NULL,
            pipeline_name VARCHAR,
            stage_id INTEGER,
            alert_days INTEGER,
            alert_message TEXT,
            created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
            PRIMARY KEY (id)
        )
    """)


def downgrade() -> None:
    op.drop_table("crm_config")
    op.drop_table("calendar_events")
    op.drop_table("admin_config")