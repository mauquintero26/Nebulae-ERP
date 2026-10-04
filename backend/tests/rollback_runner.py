"""Corre un modulo de tests SIN dejar rastro en la base compartida erp_test.

Cada test va dentro de UNA transaccion que se revierte al final. Todas las sesiones del test (fixture `db`)
y de la API (get_db y SessionLocal parchados, igual que conftest.py) comparten esa conexion con
join_transaction_mode="create_savepoint": sus commit() solo liberan savepoints. No borra nada: solo revierte.
Al final compara max(id) de las tablas de documentos para detectar si algo se escapo de la transaccion
(o si el usuario creo filas mientras tanto).

Vive en el repo (backend/tests/rollback_runner.py): las rutas salen de __file__, asi que corre el codigo del
arbol donde esta (por ejemplo un worktree) y carga <backend>/.env.

Uso (desde <backend>, con el python del venv):
    python tests/rollback_runner.py <modulo_de_tests_sin_.py>
NUNCA correr pytest completo: su conftest trunca tablas de erp_test, que es compartida.

Fixtures que resuelve (ademas de las que defina el propio modulo de tests, que tienen prioridad):
    app_client, db, admin_token, user_admin   usuario QA admin@nebulae-qa.com y sesion de la transaccion
    monkeypatch                               un pytest.MonkeyPatch por prueba; .undo() al terminar
    user_vendedor, vendedor_token             usuario VENDEDOR creado dentro de la transaccion revertida
    brand, category, product, sku             igual que conftest.py (dentro de la transaccion revertida)
    contador_sql                              cuenta consultas SQL y commits (ver ContadorSQL)
    clave_de_prueba, hash_clave_de_prueba     la clave de prueba CLAVE_DE_PRUEBA y su hash bcrypt (el de user_vendedor)
Las fixtures generadoras (yield) entregan el valor del yield y su teardown corre despues de la prueba,
en orden inverso, ANTES de cerrar la sesion y revertir la transaccion.

Variable de entorno PARCHE: codigo Python que se ejecuta antes de cargar el modulo (para pruebas "rojas").
"""
import sys, os, re, importlib, inspect, traceback, contextlib, uuid
from datetime import timedelta
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(BACKEND / "tests"))
from dotenv import load_dotenv
load_dotenv(BACKEND / ".env")


def _bloquear_correo_real():
    """Ninguna prueba puede mandar un correo real, sea cual sea el .env compartido.

    1) Quita SMTP_USER y SMTP_PASSWORD del entorno (sin leerlos ni mostrarlos): smtp_configurado() da False y
       send_email sale antes de abrir conexion para cualquiera que lo llame (auth.py lo importa por nombre).
    2) Red de seguridad: smtplib.SMTP y smtplib.SMTP_SSL pasan a ser una clase que lanza RuntimeError.
    Se llama otra vez despues de importar la app: app/db/database.py vuelve a cargar el .env y reponeria las claves."""
    import smtplib
    os.environ.pop("SMTP_USER", None)
    os.environ.pop("SMTP_PASSWORD", None)

    class _SMTPBloqueado:
        def __init__(self, *args, **kwargs):
            raise RuntimeError("SMTP real bloqueado en pruebas")

    smtplib.SMTP = _SMTPBloqueado
    smtplib.SMTP_SSL = _SMTPBloqueado


_bloquear_correo_real()

import pytest
from sqlalchemy import event, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker
from fastapi.testclient import TestClient
from main import app
import app.db.database as dbmod
import app.api.v1.erp_compras as m_compras
import app.api.v1.erp_inventario as m_inv
import app.api.v1.erp_ventas_fase4 as m_f4
from app.models.users import User
from app.core.security import create_access_token

_bloquear_correo_real()  # database.py recargo el .env al importarse: se quitan de nuevo las credenciales SMTP

TABLAS = ["customer_requests", "sales_quotations", "sale_orders", "purchase_orders_full", "activity_logs",
          "document_confirmation_tokens", "customers", "sales_orders",
          "users", "brands", "categories", "products", "product_skus"]
MODULOS_CON_SESSIONLOCAL = (dbmod, m_compras, m_inv, m_f4)

# Salvaguarda como la de conftest.py: jamas correr contra una base que no se identifique como de pruebas.
_nombre_base = (dbmod.engine.url.database or "").lower()
if not any(k in _nombre_base for k in ("test", "staging", "dev", "qa")):
    sys.exit(f"[ABORT] La base '{_nombre_base}' no contiene test/staging/dev/qa. No se corre el runner.")


def maximos():
    with dbmod.engine.connect() as c:
        return {t: c.execute(text(f"select coalesce(max(id), 0) from {t}")).scalar() for t in TABLAS}


# ---- contador de consultas y commits ----------------------------------------------------------------
_SENTENCIA_DE_SAVEPOINT = re.compile(r"^\s*(SAVEPOINT|RELEASE\s+SAVEPOINT|ROLLBACK\s+TO\s+SAVEPOINT)\b", re.I)


class _Cuenta:
    """Consultas SQL (`sentencias`, `consultas`) y commits de Session (`commits`) acumulados."""

    def __init__(self):
        self.sentencias = []
        self.commits = 0

    @property
    def consultas(self):
        return len(self.sentencias)

    def reset(self):
        self.sentencias = []
        self.commits = 0


class ContadorSQL(_Cuenta):
    """Cuenta las consultas que llegan al cursor y los commits de CUALQUIER Session mientras esta instalado.

    Escucha a nivel de CLASE: `before_cursor_execute` en sqlalchemy.engine.Engine (todas las conexiones, tambien
    las ya abiertas) y `after_commit` en sqlalchemy.orm.Session (la sesion de la prueba y las del API).
    Los SAVEPOINT / RELEASE / ROLLBACK TO SAVEPOINT que el runner usa para aislar la prueba NO se cuentan como
    consultas, para que los numeros sean los mismos que veria el codigo bajo pytest normal. Un commit() de
    sesion SI se cuenta aunque aqui solo libere un savepoint.

        contador_sql.reset()                 # empieza a contar desde cero
        ...codigo bajo prueba...
        assert contador_sql.consultas <= 6 and contador_sql.commits == 1

        with contador_sql.ventana() as v:    # mide solo lo que pasa dentro; v se puede leer dentro y despues
            ...codigo bajo prueba...
        assert v.consultas == 3 and v.commits == 1 and v.sentencias[0].startswith("SELECT")
    """

    def __init__(self):
        super().__init__()
        self._ventanas = []

    def _al_ejecutar(self, conn, cursor, statement, parameters, context, executemany):
        if _SENTENCIA_DE_SAVEPOINT.match(statement):
            return
        self.sentencias.append(statement)
        for v in self._ventanas:
            v.sentencias.append(statement)

    def _al_confirmar(self, session):
        self.commits += 1
        for v in self._ventanas:
            v.commits += 1

    @contextlib.contextmanager
    def ventana(self):
        v = _Cuenta()
        self._ventanas.append(v)
        try:
            yield v
        finally:
            self._ventanas.remove(v)

    def instalar(self):
        event.listen(Engine, "before_cursor_execute", self._al_ejecutar)
        event.listen(Session, "after_commit", self._al_confirmar)

    def desinstalar(self):
        event.remove(Engine, "before_cursor_execute", self._al_ejecutar)
        event.remove(Session, "after_commit", self._al_confirmar)


# ---- fixtures propias del runner ---------------------------------------------------------------------
# Se resuelven por nombre (como pytest) y reciben otras fixtures por nombre de parametro. Pueden ser
# generadoras (yield): el valor es el del yield y el resto corre como teardown despues de la prueba.
# Un modulo de tests que defina una fixture con el mismo nombre tiene prioridad (igual que en pytest).
FIXTURES_DEL_RUNNER = {}


def _fixture_del_runner(f):
    FIXTURES_DEL_RUNNER[f.__name__.lstrip("_")] = f
    return f


@_fixture_del_runner
def _monkeypatch():
    mp = pytest.MonkeyPatch()
    try:
        yield mp
    finally:
        mp.undo()


@_fixture_del_runner
def _contador_sql():
    contador = ContadorSQL()
    contador.instalar()
    try:
        yield contador
    finally:
        contador.desinstalar()


CLAVE_DE_PRUEBA = "Test123!"  # clave de las cuentas de prueba (la misma TEST_PASSWORD de conftest.py)
_HASH_DE_PRUEBA = []  # cache: el hash bcrypt de la clave de prueba se calcula una sola vez por corrida


def _hash_de_prueba():
    if not _HASH_DE_PRUEBA:
        try:
            import bcrypt
            _HASH_DE_PRUEBA.append(bcrypt.hashpw(CLAVE_DE_PRUEBA.encode(), bcrypt.gensalt()).decode())
        except Exception:
            from app.core.security import get_password_hash
            _HASH_DE_PRUEBA.append(get_password_hash(CLAVE_DE_PRUEBA))
    return _HASH_DE_PRUEBA[0]


@_fixture_del_runner
def _clave_de_prueba():
    """La clave de prueba (CLAVE_DE_PRUEBA). El runner no se puede importar desde un modulo de tests (volveria a
    correrlo), asi que se entrega como fixture."""
    return CLAVE_DE_PRUEBA


@_fixture_del_runner
def _hash_clave_de_prueba():
    """Hash bcrypt de CLAVE_DE_PRUEBA, el mismo que llevan las cuentas que crea el runner (user_vendedor)."""
    return _hash_de_prueba()


@_fixture_del_runner
def _user_vendedor(db):
    u = User(email=f"vendedor-{uuid.uuid4().hex[:6]}@test.nebulae", password_hash=_hash_de_prueba(),
             role="Vendedor", is_active=True)
    db.add(u)
    db.commit()  # solo libera un savepoint: la transaccion del runner sigue abierta y se revierte al final
    return u


@_fixture_del_runner
def _vendedor_token(user_vendedor):
    return create_access_token({"sub": str(user_vendedor.id), "role": user_vendedor.role},
                               expires_delta=timedelta(minutes=60))


@_fixture_del_runner
def _brand(db):
    from app.models.catalog import Brand
    b = Brand(name=f"TestBrand-{uuid.uuid4().hex[:6]}")
    db.add(b)
    db.commit()
    return b


@_fixture_del_runner
def _category(db):
    from app.models.catalog import Category
    c = Category(name=f"TestCategory-{uuid.uuid4().hex[:6]}")
    db.add(c)
    db.commit()
    return c


@_fixture_del_runner
def _product(db, brand, category):
    from app.models.catalog import Product
    p = Product(brand_id=brand.id, category_id=category.id, name=f"TestProduct-{uuid.uuid4().hex[:6]}",
                type="Fisico", base_currency="USD", uom="Ud")
    db.add(p)
    db.commit()
    return p


@_fixture_del_runner
def _sku(db, product):
    from app.models.catalog import ProductSKU
    s = ProductSKU(product_id=product.id, sku=f"TST-{uuid.uuid4().hex[:8]}", cost_price=10.00, sale_price=20.00)
    db.add(s)
    db.commit()
    return s


if os.environ.get("PARCHE"):  # prueba "roja": codigo que anula la regla bajo prueba, para ver que los tests lo notan
    exec(os.environ["PARCHE"])

mod = importlib.import_module(sys.argv[1])
client = TestClient(app, raise_server_exceptions=False)
sessionlocal_original = dbmod.SessionLocal
print(f"[rollback_runner] codigo: {BACKEND}  base: {_nombre_base}", flush=True)
antes = maximos()


def recolectar():
    for nombre, f in inspect.getmembers(mod, inspect.isfunction):
        if nombre.startswith("test_"):
            yield nombre, f
    for cnombre, cls in inspect.getmembers(mod, inspect.isclass):
        if cnombre.startswith("Test") and cls.__module__ == mod.__name__:
            for mnombre, _ in inspect.getmembers(cls, inspect.isfunction):
                if mnombre.startswith("test_"):
                    yield f"{cnombre}.{mnombre}", getattr(cls(), mnombre)


passed = failed = 0
for nombre, fn in recolectar():
    conn = dbmod.engine.connect()
    trans = conn.begin()
    Sesion = sessionmaker(bind=conn, autocommit=False, autoflush=False, join_transaction_mode="create_savepoint")

    def get_db_de_prueba():
        s = Sesion()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[dbmod.get_db] = get_db_de_prueba
    for m in MODULOS_CON_SESSIONLOCAL:
        if hasattr(m, "SessionLocal"):
            m.SessionLocal = Sesion
    session = Sesion()
    generadoras = []  # (nombre, generador) de las fixtures con yield, en el orden en que se armaron
    ok, detalles = True, []
    try:
        admin = session.query(User).filter(User.email == "admin@nebulae-qa.com").first()
        assert admin is not None, "falta el usuario QA admin@nebulae-qa.com"
        token = create_access_token(data={"sub": str(admin.id), "role": admin.role}, expires_delta=timedelta(minutes=30))
        base = {"app_client": client, "db": session, "admin_token": token, "user_admin": admin}

        def resolver(n):
            if n in base:
                return base[n]
            definido = getattr(mod, n, None)
            envuelto = getattr(definido, "_get_wrapped_function", lambda: getattr(definido, "__wrapped__", None))()
            if envuelto is None:
                envuelto = FIXTURES_DEL_RUNNER.get(n)
            if envuelto is None:
                raise KeyError(n)
            valor = envuelto(**{p: resolver(p) for p in inspect.signature(envuelto).parameters})
            if inspect.isgenerator(valor):
                generadoras.append((n, valor))
                valor = next(valor)
            base[n] = valor
            return valor

        fn(**{p: resolver(p) for p in inspect.signature(fn).parameters})
    except KeyboardInterrupt:
        raise
    except BaseException:  # pytest.fail / pytest.skip derivan de BaseException
        ok = False
        detalles.append(traceback.format_exc())
    try:
        if generadoras and not ok:
            try:
                session.rollback()  # un error de BD en la prueba deja la transaccion abortada; los teardown la necesitan viva
            except Exception:
                pass
        for n, gen in reversed(generadoras):  # teardown en orden inverso, aun dentro de la transaccion
            try:
                next(gen)
            except StopIteration:
                continue
            except Exception:
                ok = False
                detalles.append(f"[teardown de la fixture '{n}']\n{traceback.format_exc()}")
                continue
            ok = False
            detalles.append(f"[teardown de la fixture '{n}'] hizo yield mas de una vez\n")
    finally:
        session.close()
        trans.rollback()
        conn.close()
        for m in MODULOS_CON_SESSIONLOCAL:
            if hasattr(m, "SessionLocal"):
                m.SessionLocal = sessionlocal_original
        app.dependency_overrides.clear()
    print(f"{'PASS' if ok else 'FAIL'} {nombre}", flush=True)
    for d in detalles:
        sys.stderr.write(d)
    sys.stderr.flush()
    passed, failed = passed + ok, failed + (not ok)

despues = maximos()
cambios = {t: (antes[t], despues[t]) for t in TABLAS if despues[t] != antes[t]}
print(f"\n{passed} passed, {failed} failed")
print("Base intacta (max(id) sin cambios)." if not cambios else f"OJO, max(id) cambio en: {cambios}")
sys.exit(1 if failed else 0)
