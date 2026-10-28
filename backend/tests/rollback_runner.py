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
    warehouse, inv_level_zero, supplier,      igual que conftest.py (B4 T1B, D13): bodega, existencia en 0, proveedor,
    pec_10u, eninv_5u, eninv_5u_b,            PEC de 10 unidades y sus ENINV en BORRADOR. Todas sobre la MISMA sesion
    eninv_10u, eninv_logistica                `db` de la prueba: sus commit() solo liberan savepoints y se revierten
    tmp_path                                  un directorio temporal nuevo por prueba (pathlib.Path); se borra al final
    contador_sql                              cuenta consultas SQL y commits (ver ContadorSQL)
    clave_de_prueba                           la clave de prueba CLAVE_DE_PRUEBA (la de user_vendedor)
Las fixtures generadoras (yield) entregan el valor del yield y su teardown corre despues de la prueba,
en orden inverso, ANTES de cerrar la sesion y revertir la transaccion.

SessionLocal se desvia en app.db.database, erp_inventario, erp_ventas_fase4 y, si lo capturo al importarse con
`from app.db.database import SessionLocal`, en el propio modulo de pruebas (erp_compras lo importa dentro de cada funcion
y recibe el de app.db.database): dentro de cada prueba es la sesion de su transaccion y fuera de una prueba (antes de la
primera, entre pruebas y despues de la ultima) es un centinela que lanza RuntimeError('SessionLocal fuera de una prueba
del runner'); el real no se repone (B4 T1B r1 y r2). Si al terminar una prueba
quedan hilos vivos que nacieron en ella, la prueba es FAIL («[hilos vivos al terminar la prueba]»), la conexion se
descarta y la corrida aborta. Si no se puede revertir la transaccion, la prueba es FAIL («[revertir la transaccion de la
prueba]») y la conexion se descarta: Postgres revierte lo que estuviera abierto.

Variable de entorno PARCHE: codigo Python que se ejecuta antes de cargar el modulo (para pruebas "rojas").

Ningun servicio externo real, sea cual sea el .env compartido:
- SMTP: _bloquear_correo_real (smtplib y las credenciales SMTP_*).
- Chatwoot: _bloquear_chatwoot_real (B3 T8 r1 y r2). Bloquea las credenciales CHATWOOT_*, el transporte de
  app.core.chatwoot (_ABRIDOR) y urllib.request.urlopen, que es lo que usa el cliente propio de chat.py (y cualquier
  otro urlopen).
Las dos guardas se aplican al arrancar, despues de importar la app, despues de importar el modulo de pruebas y al
empezar cada prueba (r2). Un modulo que vuelva a cargar el .env no las abre.
Cada intento de salir a Chatwoot o por urlopen se cuenta. Al final se imprime «Chatwoot real bloqueado N veces», y con
N > 0 la corrida falla aunque todas las pruebas pasen: una prueba llego al transporte real y la guarda la paro.
"""
import sys, os, re, importlib, inspect, traceback, contextlib, uuid, shutil, tempfile, threading, time
from datetime import datetime, timedelta, timezone
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


class _ChatwootBloqueado:
    """Reemplaza app.core.chatwoot._ABRIDOR: cualquier peticion real a Chatwoot lanza RuntimeError. abridor_real guarda el
    abridor de produccion para que las pruebas revisen como esta armado (sin redirecciones), sin usarlo.
    r2 (guarda 2): `veces` cuenta los intentos bloqueados (de este abridor y de urlopen). Una prueba que dispare el
    bloqueo a proposito lo deja como lo encontro."""

    veces = 0

    def __init__(self, abridor_real):
        self.abridor_real = abridor_real

    def open(self, *args, **kwargs):
        _ChatwootBloqueado.veces += 1
        raise RuntimeError("Chatwoot real bloqueado en pruebas")


def _urlopen_bloqueado(*args, **kwargs):
    """Reemplaza urllib.request.urlopen (r2, guarda 4): el cliente propio de chat.py (_send_to_chatwoot, sync-chatwoot y
    la consulta a Gemini) sale a la red con urlopen y lee sus credenciales al importarse, asi que quitar CHATWOOT_* del
    entorno no lo frena. Cuenta el intento igual que _ChatwootBloqueado."""
    _ChatwootBloqueado.veces += 1
    raise RuntimeError("Chatwoot real bloqueado en pruebas")


_urlopen_bloqueado.contador = _ChatwootBloqueado  # para que una prueba lea (y deje como estaba) el contador


def _bloquear_chatwoot_real():
    """B3 T8 r1 y r2 (como _bloquear_correo_real): ninguna prueba puede llegar a Chatwoot real (ni mandar un WhatsApp
    por Meta), sea cual sea el .env compartido o lo que diga admin_config de erp_test.

    1) Quita CHATWOOT_BASE_URL, CHATWOOT_API_TOKEN y CHATWOOT_ACCOUNT_ID del entorno (sin leerlos ni mostrarlos):
       chatwoot.configurado() da False y el envio automatico se detiene en CHATWOOT_NO_CONFIGURADO.
    2) Red de seguridad: app.core.chatwoot._ABRIDOR (el transporte de app.core.chatwoot, lo usa _peticion) pasa a ser un
       abridor que lanza RuntimeError. Las pruebas que necesitan Chatwoot ponen valores ficticios con
       monkeypatch.setenv y reemplazan _peticion o _ABRIDOR con monkeypatch.
    3) urllib.request.urlopen (el transporte del cliente propio de chat.py, que guarda sus credenciales al importarse)
       tambien lanza RuntimeError (r2).
    Idempotente: se vuelve a aplicar despues de importar la app y el modulo de pruebas, y al empezar cada prueba."""
    import urllib.request
    import app.core.chatwoot as chatwoot
    for clave in ("CHATWOOT_BASE_URL", "CHATWOOT_API_TOKEN", "CHATWOOT_ACCOUNT_ID"):
        os.environ.pop(clave, None)
    if not isinstance(chatwoot._ABRIDOR, _ChatwootBloqueado):
        chatwoot._ABRIDOR = _ChatwootBloqueado(chatwoot._ABRIDOR)
    urllib.request.urlopen = _urlopen_bloqueado


_bloquear_chatwoot_real()

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
_bloquear_chatwoot_real()  # y las de Chatwoot (B3 T8 r1)


def _bloquear_servicios_externos():
    """B3 T8 r2 (guarda 1): las dos guardas otra vez. Un modulo de pruebas que llama a load_dotenv al importarse o durante
    una prueba (test_fase6_concurrency, test_receipt_concurrency) repondria las credenciales."""
    _bloquear_correo_real()
    _bloquear_chatwoot_real()

TABLAS = ["customer_requests", "sales_quotations", "sale_orders", "purchase_orders_full", "activity_logs",
          "document_confirmation_tokens", "customers", "sales_orders",
          "users", "brands", "categories", "products", "product_skus",
          "envios_al_cliente",  # B3 T8 (fa6_030): los mensajes de WhatsApp al cliente tampoco pueden escaparse
          "seguimientos_confirmacion",  # B3 T11 (fa6_031): ni los recordatorios programados
          "preferencias_usuario",  # B4 T1B (fa6_033): ni las preferencias de pantalla
          # B4 T1B (RP72, D13/D15): Compras e Inventario (las pruebas de T1C, T12 y T13 y las fixtures de D13)
          "goods_receipts", "purchase_order_lines", "suppliers", "warehouses", "inventory_levels",
          "inventory_movements", "inventory_operations", "inventory_reservations", "inventory_quarantine",
          "product_web_listings",
          # B4 T1B r1: lo que escribe confirmar una recepcion (erp_compras.py:1811ss), que D13 dejo correr
          "idempotency_requests", "goods_receipt_lines", "goods_receipt_line_allocations", "procurement_allocations",
          "inventory_owner_balances"]
MODULOS_CON_SESSIONLOCAL = (dbmod, m_compras, m_inv, m_f4)


class _SessionLocalFueraDePrueba:
    """B4 T1B r1: lo que vale SessionLocal (en MODULOS_CON_SESSIONLOCAL) ANTES de la primera prueba, ENTRE pruebas y
    despues de la ultima. Usarlo lanza RuntimeError: un hilo que sobreviva a su prueba y haga
    `from app.db.database import SessionLocal` (el COMMIT INDEPENDIENTE de idempotency_requests, erp_compras.py:1902, o
    :2727 y :2804) no puede abrir una sesion real ni confirmar nada en erp_test. El SessionLocal real no se repone: despues
    de la ultima prueba el runner solo usa dbmod.engine (maximos)."""

    MENSAJE = "SessionLocal fuera de una prueba del runner"

    def __call__(self, *args, **kwargs):
        raise RuntimeError(self.MENSAJE)

    def __getattr__(self, nombre):
        if nombre.startswith("__") and nombre.endswith("__"):
            raise AttributeError(nombre)
        raise RuntimeError(self.MENSAJE)

    def __repr__(self):
        return "<SessionLocal centinela del rollback_runner>"


CENTINELA_SESSIONLOCAL = _SessionLocalFueraDePrueba()
_ESPERA_HILOS_SEG = 1.0  # lo que se espera a que terminen los hilos de una prueba (los de anyio se apagan solos)


def _desviar_sessionlocal(destino):
    for m in MODULOS_CON_SESSIONLOCAL:
        if hasattr(m, "SessionLocal"):
            m.SessionLocal = destino


def _hilos_que_quedaron(al_empezar):
    """Hilos que nacieron durante la prueba y siguen vivos. Les da hasta _ESPERA_HILOS_SEG para terminar: los hilos de
    trabajo de anyio de cada peticion del TestClient se apagan un instante despues de responder."""
    limite = time.monotonic() + _ESPERA_HILOS_SEG
    for h in threading.enumerate():
        if h not in al_empezar:
            h.join(max(0.0, limite - time.monotonic()))
    return [h for h in threading.enumerate() if h not in al_empezar and h.is_alive()]

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


# ---- B4 T1B (D13/D15): las fixtures de Compras e Inventario de conftest.py -----------------------------------------
# Las mismas filas que conftest.py (warehouse :496, inv_level_zero :503, supplier :511, pec_10u :522, _make_eninv :538 y
# las eninv_* :553-570), sobre la sesion `db` de la prueba: todo queda en la transaccion que se revierte. sku es la de
# arriba (_sku, D15: no se registra dos veces). Sus tablas estan en TABLAS para que «Base intacta» las vigile.
@_fixture_del_runner
def _warehouse(db):
    from app.models.inventory import Warehouse
    w = Warehouse(name=f"BodegaTest-{uuid.uuid4().hex[:6]}", location_type="Central")
    db.add(w)
    db.commit()
    return w


@_fixture_del_runner
def _inv_level_zero(db, sku, warehouse):
    from app.models.inventory import InventoryLevel
    lvl = InventoryLevel(sku_id=sku.id, warehouse_id=warehouse.id, quantity=0)
    db.add(lvl)
    db.commit()
    return lvl


@_fixture_del_runner
def _supplier(db):
    from app.models.erp_documents import Supplier
    s = Supplier(name=f"TestSupplier-{uuid.uuid4().hex[:6]}", country="Colombia", is_active=True)
    db.add(s)
    db.commit()
    return s


@_fixture_del_runner
def _pec_10u(db, sku, warehouse, supplier):
    from app.models.erp_documents import PurchaseOrderFull
    p = PurchaseOrderFull(
        numero=f"PEC-TEST-{uuid.uuid4().hex[:8].upper()}",
        supplier_id=supplier.id, supplier_name=supplier.name,
        warehouse_id=warehouse.id, estado="EMITIDO",
        fecha_entrega_estimada=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=15),
        productos=[{"sku_id": sku.id, "sku": sku.sku, "nombre": "Test Product",
                    "qty": 10, "qty_recibida": 0, "precio_usd": 10.0}],
    )
    db.add(p)
    db.commit()
    return p


def _crear_eninv(db, pec, sku, warehouse, qty, receipt_type="FISICA", suffix=""):
    """La ENINV en BORRADOR de _make_eninv de conftest.py."""
    from app.models.erp_documents import GoodsReceipt
    g = GoodsReceipt(
        numero=f"ENINV-T-{uuid.uuid4().hex[:8].upper()}{suffix}",
        pec_id=pec.id, pec_numero=pec.numero,
        supplier_id=pec.supplier_id, supplier_name=pec.supplier_name,
        warehouse_id=warehouse.id, warehouse_name=warehouse.name,
        estado="BORRADOR", stock_actualizado=False, receipt_type=receipt_type,
        productos=[{"sku_id": sku.id, "sku": sku.sku, "nombre": "Test Product",
                    "qty_esperada": qty, "qty_recibida": qty}],
    )
    db.add(g)
    db.commit()
    return g


@_fixture_del_runner
def _eninv_5u(db, pec_10u, sku, warehouse):
    return _crear_eninv(db, pec_10u, sku, warehouse, qty=5)


@_fixture_del_runner
def _eninv_5u_b(db, pec_10u, sku, warehouse):
    return _crear_eninv(db, pec_10u, sku, warehouse, qty=5, suffix="B")


@_fixture_del_runner
def _eninv_10u(db, pec_10u, sku, warehouse):
    return _crear_eninv(db, pec_10u, sku, warehouse, qty=10)


@_fixture_del_runner
def _eninv_logistica(db, pec_10u, sku, warehouse):
    return _crear_eninv(db, pec_10u, sku, warehouse, qty=10, receipt_type="LOGISTICA")


@_fixture_del_runner
def _tmp_path():
    """Como tmp_path de pytest (D13, para test_startup_health): un directorio nuevo por prueba, como pathlib.Path. Se
    borra al terminar (pytest guarda los ultimos tres; aqui no queda nada). Las pruebas nuevas no lo usan (R22)."""
    carpeta = Path(tempfile.mkdtemp(prefix="rollback_runner_"))
    try:
        yield carpeta
    finally:
        shutil.rmtree(carpeta, ignore_errors=True)


if os.environ.get("PARCHE"):  # prueba "roja": codigo que anula la regla bajo prueba, para ver que los tests lo notan
    exec(os.environ["PARCHE"])

mod = importlib.import_module(sys.argv[1])
# B4 T1B r2: un modulo de pruebas que hace `from app.db.database import SessionLocal` al importarse
# (test_fase4_hardening.py:46, test_fase4_final_hardening.py:76) se quedo con el real. Si ese nombre es el mismo objeto
# que dbmod.SessionLocal (todavia el real: el centinela se instala abajo), el modulo se desvia igual que los demas:
# dentro de cada prueba vale Sesion y fuera, el centinela. Sus funciones y sus hilos lo leen como global al llamarlo.
if getattr(mod, "SessionLocal", None) is dbmod.SessionLocal:
    MODULOS_CON_SESSIONLOCAL += (mod,)
_bloquear_servicios_externos()  # B3 T8 r2: por si el modulo de pruebas recargo el .env al importarse
client = TestClient(app, raise_server_exceptions=False)
# B4 T1B r1 y r2: desde aqui, fuera de una prueba, el atributo SessionLocal de cada modulo de MODULOS_CON_SESSIONLOCAL
# que lo tenga (app.db.database, erp_inventario, erp_ventas_fase4 y, si lo capturo al importarse, el modulo de pruebas)
# es el centinela. erp_compras no lo tiene: lo importa de app.db.database dentro de cada funcion y recibe ese.
_desviar_sessionlocal(CENTINELA_SESSIONLOCAL)
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


def _cerrar_corrida(passed, failed):
    """Las tres lineas finales; devuelve el codigo de salida."""
    despues = maximos()
    cambios = {t: (antes[t], despues[t]) for t in TABLAS if despues[t] != antes[t]}
    print(f"\n{passed} passed, {failed} failed")
    # B3 T8 r2 (guarda 2): la guarda de Chatwoot no se queda callada. Si actuo, una prueba llego al transporte real (el
    # envio la atrapa y responde 200, asi que la prueba pudo quedar en verde): la corrida falla igual. Va antes de la
    # ultima linea para que la salida siga terminando en «Base intacta».
    bloqueos_chatwoot = _ChatwootBloqueado.veces
    print(f"Chatwoot real bloqueado {bloqueos_chatwoot} veces"
          + ("" if not bloqueos_chatwoot else ": OJO, una prueba intento salir a Chatwoot o por urlopen (falla la corrida)"))
    print("Base intacta (max(id) sin cambios)." if not cambios else f"OJO, max(id) cambio en: {cambios}", flush=True)
    return 1 if failed or bloqueos_chatwoot else 0


passed = failed = 0
for nombre, fn in recolectar():
    _bloquear_servicios_externos()  # B3 T8 r2: al empezar cada prueba (una prueba anterior pudo recargar el .env)
    hilos_al_empezar = set(threading.enumerate())  # B4 T1B r1 (b)
    cuantos_al_empezar = threading.active_count()
    abortar = False
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
    _desviar_sessionlocal(Sesion)
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
        vivos = _hilos_que_quedaron(hilos_al_empezar)
        if vivos:
            # B4 T1B r1 (b): un hilo que sobrevive a su prueba podria seguir usando la base. La prueba es FAIL, SessionLocal
            # queda en el centinela, la conexion se descarta (Postgres revierte la transaccion abierta al perderla) y se
            # cierra (ya no se puede volver a usar), y la corrida aborta sin reponer nada.
            ok = False
            abortar = True
            detalles.append(f"[hilos vivos al terminar la prueba] al empezar {cuantos_al_empezar}, al terminar "
                            f"{threading.active_count()}: {', '.join(h.name for h in vivos)}\n")
            _desviar_sessionlocal(CENTINELA_SESSIONLOCAL)
            for paso in (conn.invalidate, conn.close):
                try:
                    paso()
                except Exception:
                    pass
        else:
            # B4 T1B (D13): una prueba con hilos (test_receipt_concurrency) usa la MISMA conexion desde dos peticiones a la
            # vez y deja sus savepoints invalidos; session.close() lanza PendingRollbackError. La prueba queda en FAIL con
            # el motivo y, si tampoco se puede revertir (r1, c), la conexion se descarta (Postgres revierte la
            # transaccion abierta al perderla). Nada se confirma en ningun caso.
            try:
                session.close()
            except Exception:
                ok = False
                detalles.append(f"[cierre de la sesion de la prueba]\n{traceback.format_exc()}")
            try:
                trans.rollback()
            except Exception:
                ok = False
                detalles.append(f"[revertir la transaccion de la prueba]\n{traceback.format_exc()}")
                conn.invalidate()
            conn.close()
            _desviar_sessionlocal(CENTINELA_SESSIONLOCAL)  # r1 (a): entre pruebas, el centinela (nunca el real)
            app.dependency_overrides.clear()  # get_db vuelve a ser el real, que usa dbmod.SessionLocal: el centinela
    print(f"{'PASS' if ok else 'FAIL'} {nombre}", flush=True)
    for d in detalles:
        sys.stderr.write(d)
    sys.stderr.flush()
    passed, failed = passed + ok, failed + (not ok)
    if abortar:
        print(f"[rollback_runner] CORRIDA ABORTADA en {nombre}: quedaron hilos vivos al terminar la prueba. No se corren "
              "las pruebas que faltan y no se repone nada.", flush=True)
        _cerrar_corrida(passed, failed)
        sys.stderr.flush()
        os._exit(3)  # sin esperar a los hilos vivos (sys.exit esperaria a los que no son daemon)

sys.exit(_cerrar_corrida(passed, failed))
