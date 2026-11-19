"""B4.1 T1 (A5 y P33): las dos migraciones aditivas del bloque, ya aplicadas a erp_test.
Se corre SOLO con el runner de ROLLBACK (python tests/rollback_runner.py test_b41_migraciones)."""
import uuid
from sqlalchemy import text
from app.models.erp_documents import Supplier


def test_la_cabeza_es_fa6_035(db):
    assert db.execute(text("SELECT version_num FROM alembic_version")).scalar() == "fa6_035"


def test_sale_orders_tiene_indice_por_sc_id(db):
    filas = db.execute(text("SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'sale_orders'")).fetchall()
    assert any(n == "ix_sale_orders_sc_id" and d.endswith("(sc_id)") for n, d in filas), filas


def test_suppliers_tiene_moneda_y_tiempo_de_entrega_nulos(db):
    cols = {r[0]: tuple(r[1:]) for r in db.execute(text(
        "SELECT column_name, data_type, is_nullable, character_maximum_length FROM information_schema.columns "
        "WHERE table_name = 'suppliers' AND column_name IN ('currency', 'lead_time_days')"))}
    assert cols == {"currency": ("character varying", "YES", 3), "lead_time_days": ("integer", "YES", None)}, cols


def test_el_modelo_lee_y_escribe_las_columnas_nuevas(db):
    s = Supplier(name=f"Prov-B41-{uuid.uuid4().hex[:6]}", currency="USD", lead_time_days=21)
    db.add(s); db.commit(); db.refresh(s)
    assert (s.currency, s.lead_time_days) == ("USD", 21)
    nuevo = Supplier(name=f"Prov-B41-{uuid.uuid4().hex[:6]}")
    db.add(nuevo); db.commit(); db.refresh(nuevo)
    assert (nuevo.currency, nuevo.lead_time_days) == (None, None)   # sin valor por defecto: nadie recibe uno inventado
