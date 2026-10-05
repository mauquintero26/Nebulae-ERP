"""Pruebas del propio runner de ROLLBACK (backend/tests/rollback_runner.py).

Verifican los fixtures que el runner ofrece a las pruebas de Ventas: monkeypatch, user_vendedor,
vendedor_token, sku (y sus dependencias brand/category/product), fixtures generadoras (yield) con
teardown, y el contador de consultas/commits (contador_sql).

Solo corren con el runner de ROLLBACK (contador_sql no existe en conftest.py):
    cd backend
    <python del venv> tests/rollback_runner.py test_rollback_runner_fixtures

El runner recorre las funciones en orden ALFABETICO; las pruebas que dependen de la anterior llevan
un prefijo numerico (_1_, _2_) para que el orden sea el mismo bajo cualquier recolector.
"""
import os
import sys

import pytest
from sqlalchemy import event, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

import app.db.database as dbmod

_ESTE_MODULO = sys.modules[__name__]
_CENTINELA = "original"
_BITACORA = []            # eventos de setup/teardown de las fixtures generadoras
_CONTADOR_PREVIO = {}     # contador de una prueba anterior, para comprobar que ya no cuenta


def _filas_visibles_desde_otra_conexion(tabla, id_):
    """Cuenta filas con ese id desde una conexion distinta: solo ve lo que SI se confirmo (commit real)."""
    with dbmod.engine.connect() as c:
        return c.execute(text(f"select count(*) from {tabla} where id = :i"), {"i": id_}).scalar()


# ---- monkeypatch -----------------------------------------------------------------------------------
def test_monkeypatch_1_parchea_durante_la_prueba(monkeypatch):
    monkeypatch.setattr(_ESTE_MODULO, "_CENTINELA", "parchado")
    monkeypatch.setenv("RUNNER_FIXTURES_VARIABLE", "1")
    assert _ESTE_MODULO._CENTINELA == "parchado"
    assert os.environ["RUNNER_FIXTURES_VARIABLE"] == "1"


def test_monkeypatch_2_se_deshace_al_terminar_la_prueba_anterior():
    assert _ESTE_MODULO._CENTINELA == "original"
    assert "RUNNER_FIXTURES_VARIABLE" not in os.environ


# ---- user_vendedor / vendedor_token ----------------------------------------------------------------
def test_user_vendedor_existe_solo_dentro_de_la_transaccion(db, user_vendedor):
    assert user_vendedor.id is not None
    assert user_vendedor.role == "Vendedor"
    assert user_vendedor.is_active is True
    assert user_vendedor.email.startswith("vendedor-") and user_vendedor.email.endswith("@test.nebulae")
    # visible para la sesion de la prueba...
    from app.models.users import User
    assert db.query(User).filter(User.id == user_vendedor.id).count() == 1
    # ...pero NO para otra conexion: nada se confirmo fuera de la transaccion que se revierte.
    assert _filas_visibles_desde_otra_conexion("users", user_vendedor.id) == 0


def test_vendedor_token_autentica_al_vendedor_en_un_endpoint(app_client, user_vendedor, vendedor_token):
    r = app_client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {vendedor_token}"})
    assert r.status_code == 200, r.text
    datos = r.json()["data"]
    assert datos["id"] == user_vendedor.id
    assert datos["email"] == user_vendedor.email
    assert datos["role"] == "Vendedor"


def test_vendedor_token_distinto_del_admin(admin_token, vendedor_token):
    assert admin_token != vendedor_token


# ---- sku (y brand / category / product) ------------------------------------------------------------
def test_sku_con_su_producto_marca_y_categoria(db, sku):
    from app.models.catalog import ProductSKU
    assert sku.id is not None
    assert sku.sku.startswith("TST-")
    assert float(sku.cost_price) == 10.00
    assert float(sku.sale_price) == 20.00
    assert sku.product.brand_id is not None and sku.product.category_id is not None
    assert sku.product.type == "Fisico" and sku.product.base_currency == "USD"
    assert db.query(ProductSKU).filter(ProductSKU.id == sku.id).count() == 1
    assert _filas_visibles_desde_otra_conexion("product_skus", sku.id) == 0
    assert _filas_visibles_desde_otra_conexion("products", sku.product_id) == 0


def test_sku_cuelga_del_mismo_producto_que_la_fixture_product(sku, product):
    assert sku.product_id == product.id


# ---- fixtures generadoras (yield) ------------------------------------------------------------------
@pytest.fixture()
def recurso_a():
    _BITACORA.append("setup A")
    yield "valor-A"
    _BITACORA.append("teardown A")


@pytest.fixture()
def recurso_b(recurso_a):
    _BITACORA.append("setup B")
    yield f"valor-B({recurso_a})"
    _BITACORA.append("teardown B")


@pytest.fixture()
def recurso_con_db(db):
    """Su teardown consulta la base: tiene que correr ANTES de cerrar la sesion y revertir."""
    yield "con-db"
    _BITACORA.append(f"teardown con-db vio {db.execute(text('select 1')).scalar()}")


def test_generadora_1_entrega_el_valor_del_yield_no_el_generador(recurso_b):
    _BITACORA.clear()
    assert recurso_b == "valor-B(valor-A)"
    assert isinstance(recurso_b, str)


def test_generadora_2_el_teardown_corrio_en_orden_inverso_tras_la_prueba_anterior():
    assert _BITACORA == ["teardown B", "teardown A"]


def test_generadora_3_con_db_1(recurso_con_db):
    _BITACORA.clear()
    assert recurso_con_db == "con-db"


def test_generadora_3_con_db_2_teardown_uso_la_sesion_abierta():
    assert _BITACORA == ["teardown con-db vio 1"]


# ---- contador de consultas / commits ---------------------------------------------------------------
def test_contador_1_cuenta_consultas_y_commits_y_se_reinicia(db, contador_sql):
    _CONTADOR_PREVIO["contador"] = contador_sql
    contador_sql.reset()
    db.execute(text("select 1"))
    db.execute(text("select 2"))
    assert contador_sql.consultas == 2          # los SAVEPOINT del runner no cuentan como consultas
    assert contador_sql.commits == 0
    db.commit()
    assert contador_sql.commits == 1
    db.execute(text("select 3"))
    db.commit()
    assert contador_sql.commits == 2
    assert contador_sql.consultas == 3
    assert [s for s in contador_sql.sentencias if "select" in s.lower()] == ["select 1", "select 2", "select 3"]
    contador_sql.reset()
    assert (contador_sql.consultas, contador_sql.commits, contador_sql.sentencias) == (0, 0, [])


def test_contador_2_dejo_de_contar_al_terminar_la_prueba_anterior(db):
    previo = _CONTADOR_PREVIO["contador"]
    assert not event.contains(Engine, "before_cursor_execute", previo._al_ejecutar)
    assert not event.contains(Session, "after_commit", previo._al_confirmar)
    antes = (previo.consultas, previo.commits)
    db.execute(text("select 42"))
    db.commit()
    assert (previo.consultas, previo.commits) == antes


def test_contador_ventana_mide_solo_lo_que_pasa_dentro(db, contador_sql):
    db.execute(text("select 'fuera antes'"))
    with contador_sql.ventana() as v:
        db.execute(text("select 'dentro 1'"))
        db.execute(text("select 'dentro 2'"))
        db.commit()
        assert (v.consultas, v.commits) == (2, 1)   # se puede leer mientras la ventana sigue abierta
    db.execute(text("select 'fuera despues'"))
    db.commit()
    assert (v.consultas, v.commits) == (2, 1)       # al cerrar queda congelada
    assert v.sentencias == ["select 'dentro 1'", "select 'dentro 2'"]


def test_contador_cuenta_las_consultas_y_commits_de_una_llamada_al_api(app_client, vendedor_token, contador_sql):
    contador_sql.reset()
    r = app_client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {vendedor_token}"})
    assert r.status_code == 200, r.text
    assert contador_sql.consultas >= 1               # get_current_user consulta al usuario
    assert contador_sql.commits == 0                 # un GET no confirma nada


def test_contador_escucha_en_las_clases_engine_y_session(contador_sql):
    assert event.contains(Engine, "before_cursor_execute", contador_sql._al_ejecutar)
    assert event.contains(Session, "after_commit", contador_sql._al_confirmar)


# ---- correo real bloqueado -------------------------------------------------------------------------
def test_correo_real_esta_bloqueado_bajo_el_runner():
    """Ninguna prueba puede mandar un correo real, aunque el .env compartido tenga SMTP configurado: el runner
    quita SMTP_USER/SMTP_PASSWORD del entorno (tambien tras importar la app, que recarga el .env) y deja
    smtplib.SMTP / SMTP_SSL como una clase que lanza. No se imprime ningun valor."""
    import smtplib
    from app.core.email import smtp_configurado

    assert "SMTP_USER" not in os.environ
    assert "SMTP_PASSWORD" not in os.environ
    assert smtp_configurado() is False
    for clase in (smtplib.SMTP, smtplib.SMTP_SSL):
        with pytest.raises(RuntimeError, match="SMTP real bloqueado en pruebas"):
            clase("localhost", 25, timeout=1)


def test_conftest_tambien_bloquea_smtplib():
    """B8 (revision final): conftest.py (pytest) hace lo mismo que el runner: ademas de quitar las credenciales,
    smtplib.SMTP / SMTP_SSL lanzan. Se prueba la funcion de conftest.py sin importar el modulo (sus lineas de nivel
    de modulo abren el motor de erp_test): se compila solo esa funcion y se corre sobre un smtplib de mentira."""
    import ast
    import smtplib
    from pathlib import Path

    arbol = ast.parse((Path(__file__).parent / "conftest.py").read_text(encoding="utf-8"))
    funcion = next(n for n in arbol.body if isinstance(n, ast.FunctionDef) and n.name == "_sin_credenciales_smtp")
    espacio = {"os": os}
    exec(compile(ast.Module(body=[funcion], type_ignores=[]), "conftest.py", "exec"), espacio)

    class _Real:  # hace de smtplib.SMTP sin bloquear (el runner ya bloqueo el de verdad)
        def __init__(self, *args, **kwargs):
            pass

    guardados = (smtplib.SMTP, smtplib.SMTP_SSL)
    try:
        smtplib.SMTP = smtplib.SMTP_SSL = _Real
        espacio["_sin_credenciales_smtp"]()
        assert "SMTP_USER" not in os.environ and "SMTP_PASSWORD" not in os.environ
        for clase in (smtplib.SMTP, smtplib.SMTP_SSL):
            assert clase is not _Real
            with pytest.raises(RuntimeError, match="SMTP real bloqueado en pruebas"):
                clase("localhost", 25, timeout=1)
    finally:
        smtplib.SMTP, smtplib.SMTP_SSL = guardados
