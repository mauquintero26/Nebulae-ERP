from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool, text
from alembic import context
import os
from dotenv import load_dotenv

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

load_dotenv()

# TEST_DATABASE_URL takes priority when set (via conftest.py create_test_schema fixture)
# Ordinary runs use DATABASE_URL from .env
_db_url = os.getenv("DATABASE_URL", "sqlite:///./nebulae_local.db")
config.set_main_option("sqlalchemy.url", _db_url)

from app.db.database import Base
import app.models
target_metadata = Base.metadata

# Optional: run migrations into a specific schema (used by tests)
_alembic_schema = os.getenv("ALEMBIC_SCHEMA", None)


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        if _alembic_schema:
            connection.execute(text(f"CREATE SCHEMA IF NOT EXISTS {_alembic_schema}"))
            connection.execute(text(f"SET search_path TO {_alembic_schema}, public"))
            connection.commit()

        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
