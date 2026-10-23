"""Tarea 21 del Bloque 3: script de revision de datos existentes (backend/scripts/datos_bloque3.py).

Por subcomando se prueba que --listar encuentra lo suyo, que deja fuera lo que no le toca y que respeta la exclusion de
los documentos reales (aqui con numeros de prueba que imitan la exclusion; ademas, con los cuatro reales de erp_test).
--listar corre en una transaccion de solo lectura y no hace commits. tax_rate --aplicar copia 19 -> '19' y 5 -> '5' y
deja lo demas sin definir, con respaldo JSON previo en una carpeta temporal; con otra base, un id fuera de la lista o un
fallo a medio camino no escribe nada. Si la base no tiene la columna vieja products.tax_rate, --aplicar termina sin
escribir y con su mensaje. Los listados tambien sirven en una base donde el Bloque 3 todavia no se desplego.

La base erp_test es compartida y tiene datos reales: todo lo que escribe una prueba se limita a SUS filas y el runner
revierte la transaccion al terminar.

Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_datos_bloque3
"""
import contextlib
import datetime
import io
import json
import os
import shutil
import tempfile
import uuid
from decimal import Decimal
from pathlib import Path

import pytest
from sqlalchemy import text

SUBCOMANDOS = ("empresa", "tax_rate", "iva_documentos", "centavos_cot", "anticipos_cot", "pagos_sin_verificar",
               "telefonos", "pendientes_sin_seguimiento", "notas_cot")
REALES = ("SC-20260731", "COT-20260449", "PVEN-20262799", "SC-20260746")
CONVERSION = "CONVERSION_COTIZACION"
NOMBRE, CORREO = "Cliente T21", "cliente-t21@test.com"
TELEFONO_VALIDO = "3001234567"
MENSAJE_SIN_TAX_RATE = "La columna products.tax_rate no existe en esta base: no hay nada que copiar."
CALCULADORA = "Cotizado desde Calculadora Rápida. Margen: 30% | TRM: 4100"
MENSAJE_FALTA_IDS = "Falta --ids: aplica solo los ids que el usuario aprobó en el --listar."
AVISO_PRODUCCION = ("AVISO: estás conectado a la base de PRODUCCIÓN (erpdb). La salida trae datos reales: guárdala solo "
                    "en la carpeta datos y no la pegues en el chat.")


# ─── ayudas ───────────────────────────────────────────────────────────────────────────────────────────────────

def _db3():
    from scripts import datos_bloque3
    return datos_bloque3


def _sfx():
    return uuid.uuid4().hex[:6].upper()


def _ahora():
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


@contextlib.contextmanager
def _carpeta():
    ruta = tempfile.mkdtemp(prefix="respaldo_t21_")
    try:
        yield ruta
    finally:
        shutil.rmtree(ruta, ignore_errors=True)


def _base(db):
    return db.execute(text("SELECT current_database()")).scalar()


def _hay_tax_rate(db):
    """La columna vieja products.tax_rate (solo la crea migrate_erp_v2.py), vista en information_schema."""
    return db.execute(text(
        "SELECT count(*) FROM information_schema.columns WHERE table_schema = current_schema() "
        "AND table_name = 'products' AND column_name = 'tax_rate'")).scalar() == 1


def _sc(db, numero, **campos):
    from app.models.erp_documents import CustomerRequest
    campos.setdefault("estado", "ASIGNADA")
    campos.setdefault("modalidad_pago", "60/40 (60% anticipo - 40% pendiente)")
    campos.setdefault("customer_phone", TELEFONO_VALIDO)
    sc = CustomerRequest(numero=numero, customer_name=NOMBRE, customer_email=CORREO,
                         productos=[{"product_name": "X", "qty": 1}], **campos)
    db.add(sc)
    db.commit()
    db.refresh(sc)
    return sc


def _cot(db, numero, sc=None, **campos):
    from app.models.erp_documents import SalesQuotation
    if sc is not None:
        campos.setdefault("sc_id", sc.id)
        campos.setdefault("sc_numero", sc.numero)
    campos.setdefault("estado", "BORRADOR")
    campos.setdefault("total_cop", 1000000)
    campos.setdefault("subtotal_cop", campos["total_cop"])
    campos.setdefault("anticipo_cop", 0)
    campos.setdefault("customer_phone", TELEFONO_VALIDO)
    campos.setdefault("productos", [{"product_name": "X", "qty": 1, "unit_price_cop": 1000000}])
    cot = SalesQuotation(numero=numero, customer_name=NOMBRE, customer_email=CORREO, **campos)
    db.add(cot)
    db.commit()
    db.refresh(cot)
    return cot


def _ven(db, numero, cot=None, **campos):
    from app.models.erp_documents import SaleOrder
    if cot is not None:
        campos.setdefault("cot_id", cot.id)
        campos.setdefault("cot_numero", cot.numero)
        campos.setdefault("sc_id", cot.sc_id)
    campos.setdefault("estado", "PENDIENTE_COMPRA")
    campos.setdefault("total_cop", 1000000)
    campos.setdefault("subtotal_cop", campos["total_cop"])
    campos.setdefault("anticipo_cop", 0)
    campos.setdefault("saldo_cop", campos["total_cop"])
    campos.setdefault("customer_phone", TELEFONO_VALIDO)
    ven = SaleOrder(numero=numero, customer_name=NOMBRE, customer_email=CORREO,
                    productos=[{"product_name": "X", "qty": 1, "unit_price_cop": 1000000}], **campos)
    db.add(ven)
    db.commit()
    db.refresh(ven)
    return ven


def _pago(db, ven, monto, metodo=CONVERSION, estado="CONFIRMADO", referencia=None):
    from app.models.fase4 import SaleOrderPayment
    p = SaleOrderPayment(sale_order_id=ven.id, tipo="ANTICIPO", monto=monto, moneda="COP", metodo_pago=metodo,
                         fecha=datetime.date.today(), referencia_bancaria=referencia, usuario="asesor@test",
                         idempotency_key=f"T21-{uuid.uuid4().hex}", estado=estado)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def _cliente(db, telefono):
    from app.models.customers import Customer
    c = Customer(first_name="Cliente", last_name="T21", phone=telefono, email=f"t21-{uuid.uuid4().hex[:8]}@test.nebulae")
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def _seguimiento(db, tipo, doc, estado, motivo_fin=None):
    from app.models.confirmation import SeguimientoConfirmacion
    ahora = _ahora()
    s = SeguimientoConfirmacion(document_type=tipo, document_id=doc.id, document_numero=doc.numero, estado=estado,
                                iniciado_at=ahora, ultimo_contacto_at=ahora, motivo_fin=motivo_fin,
                                proximo_at=ahora + datetime.timedelta(days=2) if estado == "ACTIVO" else None)
    db.add(s)
    db.commit()
    return s


def _producto(db, brand, category, tax_rate=None, tarifa_iva=None, is_active=True):
    """Un producto de prueba; tax_rate (la columna vieja, fuera del modelo) se pone con SQL."""
    from app.models.catalog import Product
    p = Product(brand_id=brand.id, category_id=category.id, name=f"Producto T21-{_sfx()}", type="Fisico",
                base_currency="USD", uom="Ud", is_active=is_active, tarifa_iva=tarifa_iva)
    db.add(p)
    db.commit()
    if tax_rate is not None:
        db.execute(text("UPDATE products SET tax_rate = :t WHERE id = :i"), {"t": tax_rate, "i": p.id})
        db.commit()
    db.refresh(p)
    return p


def _config(db, clave, valor):
    db.execute(text("INSERT INTO admin_config (key, value, updated_at) VALUES (:k, :v, NOW()) "
                    "ON CONFLICT (key) DO NOTHING"), {"k": clave, "v": valor})
    db.commit()


def _numeros(listado, clave):
    return [f["numero"] for f in listado.seccion(clave).filas]


def _todos_los_valores(listado):
    """Cada valor de cada fila de cada seccion del listado, como texto."""
    return [str(v) for s in listado.secciones for f in s.filas for v in f.values()]


def _en_alguna_fila(listado, numero):
    return any(numero == v for v in _todos_los_valores(listado))


def _refrescar(db, *objs):
    db.expire_all()
    for o in objs:
        db.refresh(o)


def _sin_datos_del_cliente(texto):
    for prohibido in (NOMBRE, CORREO, TELEFONO_VALIDO):
        assert prohibido not in texto, prohibido


# ─── los subcomandos, la linea de comandos y la solo lectura ─────────────────────────────────────────────────

def test_los_subcomandos_y_los_documentos_reales():
    cb = _db3()
    assert tuple(cb.SUBCOMANDOS) == SUBCOMANDOS
    assert tuple(cb.SUBCOMANDOS_CON_APLICAR) == ("tax_rate",)
    assert tuple(cb.NUMEROS_REALES) == REALES
    assert cb.MENSAJE_SIN_TAX_RATE == MENSAJE_SIN_TAX_RATE
    raiz = Path(__file__).resolve().parent.parent.parent                    # la raiz del checkout (backend/..)
    assert cb.CARPETA_DATOS == raiz / ".superpowers" / "sdd" / "2026-10-04-ventas-bloque3-documentos-envio-iva" / "datos"


def test_solo_tax_rate_acepta_aplicar_y_lo_exige_con_base():
    cb = _db3()
    parser = cb.armar_parser()
    for sub in [s for s in SUBCOMANDOS if s != "tax_rate"] + ["todo"]:
        with contextlib.redirect_stderr(io.StringIO()), pytest.raises(SystemExit):
            parser.parse_args([sub, "--aplicar", "--base", "erp_test"])
        assert parser.parse_args([sub, "--listar"]).listar
    with contextlib.redirect_stderr(io.StringIO()), pytest.raises(SystemExit):
        parser.parse_args(["tax_rate", "--aplicar"])                      # sin --base
    # F1 (M25): sin --ids, --aplicar no copia «lo copiable de ese momento»: sale con el mensaje.
    error = io.StringIO()
    with contextlib.redirect_stderr(error), pytest.raises(SystemExit):
        parser.parse_args(["tax_rate", "--aplicar", "--base", "erp_test"])
    assert MENSAJE_FALTA_IDS in error.getvalue()
    with contextlib.redirect_stderr(io.StringIO()), pytest.raises(SystemExit):
        parser.parse_args(["tax_rate", "--listar", "--aplicar", "--base", "erp_test"])
    ns = parser.parse_args(["tax_rate", "--aplicar", "--base", "erp_test", "--ids", "3,4"])
    assert ns.aplicar and ns.base == "erp_test" and ns.ids == [3, 4] and ns.respaldo == str(cb.CARPETA_DATOS)


def test_listar_todo_corre_en_solo_lectura_sin_commits(db, contador_sql, monkeypatch):
    import inspect
    cb = _db3()
    # F1 (M27): la solo lectura es incondicional: listar y listar_todo ya no tienen la salida solo_lectura=False.
    assert "solo_lectura" not in inspect.signature(cb.listar).parameters
    assert "solo_lectura" not in inspect.signature(cb.listar_todo).parameters
    modo = []
    original = cb.LISTADORES["empresa"]

    def espia(db_, excl):
        modo.append(db_.execute(text("SHOW transaction_read_only")).scalar())
        return original(db_, excl)

    monkeypatch.setitem(cb.LISTADORES, "empresa", espia)
    contador_sql.reset()
    listados = cb.listar_todo(db)
    sentencias = [s.strip() for s in contador_sql.sentencias]
    assert sentencias[0].upper() == "SET TRANSACTION READ ONLY"           # lo primero que corre
    assert sentencias.count("SET TRANSACTION READ ONLY") == len(SUBCOMANDOS) + 1   # los excluidos + uno por listado
    assert not any(s.upper().startswith(("INSERT", "UPDATE", "DELETE", "CREATE", "DROP", "ALTER", "TRUNCATE"))
                   for s in sentencias)
    assert contador_sql.commits == 0
    assert modo == ["on"]                                                  # el listado ve la transaccion de solo lectura
    assert [l.subcomando for l in listados] == list(SUBCOMANDOS)
    assert not [(l.subcomando, l.error) for l in listados if l.error]
    assert not [(l.subcomando, l.no_aplica) for l in listados if l.no_aplica]
    # termina en rollback: la transaccion de la prueba vuelve a ser de lectura y escritura
    assert db.execute(text("SHOW transaction_read_only")).scalar() == "off"


def test_main_listar_todo_imprime_la_base_y_no_escribe(db, contador_sql):
    cb = _db3()
    salida = io.StringIO()
    contador_sql.reset()
    with contextlib.redirect_stdout(salida):
        codigo = cb.main(["todo", "--listar"])
    texto = salida.getvalue()
    assert codigo == 0
    assert f"SELECT current_database() -> {_base(db)}" in texto
    assert "***:***@" in texto                                            # la URL va enmascarada
    for sub in SUBCOMANDOS:
        assert f"{sub}: " in texto, sub
    assert "RESUMEN" in texto and "LISTAR: no se escribió nada" in texto
    assert contador_sql.commits == 0
    assert not any(s.strip().upper().startswith(("INSERT", "UPDATE", "DELETE")) for s in contador_sql.sentencias)
    # F1 (M26): con la base de pruebas no sale el aviso de producción.
    assert "PRODUCCIÓN" not in texto
    # F1 (M31 a): ni la URL cruda ni la contraseña (primero el booleano: el mensaje de la falla nunca lleva la URL).
    from urllib.parse import urlparse
    from app.db.database import SQLALCHEMY_DATABASE_URL
    cruda = SQLALCHEMY_DATABASE_URL in texto
    assert not cruda, "salió la URL sin enmascarar"
    clave = urlparse(SQLALCHEMY_DATABASE_URL).password
    if clave:
        con_la_clave = f":{clave}@" in texto or (len(clave) >= 8 and clave in texto)
        assert not con_la_clave, "salió la contraseña de la base"


def test_main_avisa_si_esta_conectado_a_produccion(db, monkeypatch):
    """F1 (M26): si current_database() es la base de producción (erpdb, el nombre de alembic/env.py), el aviso sale
    arriba de todo, en stdout y en stderr. El Uso dice de dónde sale la base (DATABASE_URL) y que ALEMBIC_ENV no
    aplica."""
    cb = _db3()
    assert cb.BASE_PRODUCCION == "erpdb"
    assert "DATABASE_URL" in cb.__doc__ and "ALEMBIC_ENV" in cb.__doc__
    monkeypatch.setattr(cb, "base_actual", lambda db_: "erpdb")
    salida, error = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(salida), contextlib.redirect_stderr(error):
        codigo = cb.main(["empresa", "--listar"])
    assert codigo == 0
    texto = salida.getvalue()
    assert AVISO_PRODUCCION in texto and AVISO_PRODUCCION in error.getvalue()
    assert texto.index(AVISO_PRODUCCION) < texto.index("empresa: ")  # antes de cualquier listado


def test_los_documentos_reales_de_erp_test_no_salen_en_ningun_listado(db):
    cb = _db3()
    excl = cb.calcular_excluidos(db)
    reales = set()
    for tabla, ids in (("customer_requests", excl.sc), ("sales_quotations", excl.cot), ("sale_orders", excl.pven),
                       ("payment_pendings", excl.pxp)):
        if ids:
            reales |= set(db.execute(text(f"SELECT numero FROM {tabla} WHERE id = ANY(:i)"),
                                     {"i": sorted(ids)}).scalars().all())
    existentes = set()
    for tabla in ("customer_requests", "sales_quotations", "sale_orders"):
        existentes |= set(db.execute(text(f"SELECT numero FROM {tabla} WHERE numero = ANY(:n)"),
                                     {"n": list(REALES)}).scalars().all())
    assert existentes <= reales                                            # los cuatro (los que haya) y su cadena
    listados = cb.listar_todo(db)
    for l in listados:
        valores = _todos_los_valores(l)
        for numero in reales:
            assert not any(numero in v for v in valores), (l.subcomando, numero)
    # en erp_test, COT-20260449 y PVEN-20262799 no tienen IVA discriminado: el listado los nombra como excluidos
    iva = next(l for l in listados if l.subcomando == "iva_documentos")
    for numero in {"COT-20260449", "PVEN-20262799"} & existentes:
        assert any(numero in x for x in iva.excluidos), numero


# ─── empresa ──────────────────────────────────────────────────────────────────────────────────────────────────

def test_empresa_lista_las_claves_con_los_prefijos_sin_sus_valores(db):
    cb = _db3()
    s = _sfx().lower()
    _config(db, f"empresa_t21_{s}", "VALOR-T21-EMPRESA")
    _config(db, f"documentos_t21_{s}", "VALOR-T21-DOCUMENTOS")
    _config(db, f"otra_t21_{s}", "VALOR-T21-OTRA")
    _config(db, f"empresat21{s}", "VALOR-T21-SIN-GUION")                  # sin el guion bajo: no es del prefijo
    _config(db, "empresa_nit", "VALOR-T21-NIT")                            # una que el Bloque 3 si usa
    l = cb.listar(db, "empresa")
    claves = {f["clave"]: f for f in l.seccion("claves").filas}
    assert f"empresa_t21_{s}" in claves and f"documentos_t21_{s}" in claves
    assert f"otra_t21_{s}" not in claves and f"empresat21{s}" not in claves
    assert claves[f"empresa_t21_{s}"]["usa_bloque3"].startswith("No")
    assert claves["empresa_nit"]["usa_bloque3"] == "Sí"
    assert claves[f"empresa_t21_{s}"]["largo"] == len("VALOR-T21-EMPRESA")
    texto = cb.texto_listado(l)
    assert "VALOR-T21" not in texto                                        # nunca imprime los valores
    assert f"empresa_t21_{s}" in texto


# ─── tax_rate ─────────────────────────────────────────────────────────────────────────────────────────────────

def test_tax_rate_aplicar_copia_19_y_5_y_deja_el_resto_sin_definir(db, brand, category):
    cb = _db3()
    if not _hay_tax_rate(db):
        # erp_test sin la columna vieja: --aplicar termina sin escribir y lo dice
        with _carpeta() as carpeta:
            res = cb.aplicar_tax_rate(db, base=_base(db), carpeta_respaldo=carpeta, ids=[1])
            assert res.cambiados == 0 and MENSAJE_SIN_TAX_RATE in res.detalle and os.listdir(carpeta) == []
        return
    p19 = _producto(db, brand, category, tax_rate=19)
    p16_exento = _producto(db, brand, category, tax_rate=16, tarifa_iva="EXENTO")   # F1 (M29)
    p5 = _producto(db, brand, category, tax_rate=5)
    p16 = _producto(db, brand, category, tax_rate=16)
    p0 = _producto(db, brand, category, tax_rate=0)
    p_nulo = _producto(db, brand, category)
    p_con = _producto(db, brand, category, tax_rate=19, tarifa_iva="EXENTO")
    p_inactivo = _producto(db, brand, category, is_active=False)
    l = cb.listar(db, "tax_rate")
    ids = lambda clave: [f["id"] for f in l.seccion(clave).filas]
    assert p19.id in ids("copiables") and p5.id in ids("copiables")
    assert p16.id in ids("otros") and p16.id not in ids("copiables")
    assert p_con.id in ids("ya_tienen") and p_con.id not in ids("copiables")
    for p in (p0, p_nulo):
        assert p.id not in ids("copiables") + ids("otros") + ids("ya_tienen")
    assert {p19.id, p5.id, p16.id, p0.id, p_nulo.id} <= set(ids("sin_tarifa"))
    assert p_con.id not in ids("sin_tarifa") and p_inactivo.id not in ids("sin_tarifa")
    fila = next(f for f in l.seccion("copiables").filas if f["id"] == p19.id)
    assert fila["tarifa_nueva"] == "19" and fila["tax_rate"] == "19"
    assert next(f for f in l.seccion("copiables").filas if f["id"] == p5.id)["tarifa_nueva"] == "5"
    assert next(f for f in l.seccion("otros").filas if f["id"] == p16.id)["tax_rate"] == "16"
    # F1 (M29): el que ya tiene tarifa no «se deja sin definir»: conserva la suya.
    assert next(f for f in l.seccion("otros").filas if f["id"] == p16.id)["queda"] == "sin definir (no es 19 ni 5)"
    assert next(f for f in l.seccion("otros").filas if f["id"] == p16_exento.id)["queda"] == "conserva 'EXENTO'"
    # F1 (M25): el --listar trae el comando exacto con los ids copiables.
    copiables = ",".join(str(f["id"]) for f in l.seccion("copiables").filas)
    assert any(f"tax_rate --aplicar --base {_base(db)} --ids {copiables}" in n for n in l.notas), l.notas
    with _carpeta() as carpeta:
        salida = io.StringIO()
        with contextlib.redirect_stdout(salida):
            codigo = cb.main(["tax_rate", "--aplicar", "--base", _base(db), "--respaldo", carpeta,
                              "--ids", f"{p19.id},{p5.id}"])
        assert codigo == 0, salida.getvalue()
        archivos = os.listdir(carpeta)
        assert len(archivos) == 1 and archivos[0].startswith(f"tax_rate-{_base(db)}-") and archivos[0].endswith(".json")
        assert "NO-APLICADO" not in archivos[0]
        assert "Respaldo JSON" in salida.getvalue()
        with open(os.path.join(carpeta, archivos[0]), encoding="utf-8") as f:
            guardado = json.load(f)
        assert guardado["base"] == _base(db) and guardado["subcomando"] == "tax_rate"
        assert guardado["columnas"] == ["id", "tarifa_iva", "tax_rate"]
        filas = {f["id"]: f for f in guardado["filas"]}
        assert {p19.id, p5.id} <= set(filas) and p16.id not in filas and p_con.id not in filas
        assert filas[p19.id]["tarifa_iva"] is None and set(filas[p19.id]) == {"id", "tarifa_iva", "tax_rate"}
    _refrescar(db, p19, p5, p16, p0, p_nulo, p_con)
    assert p19.tarifa_iva == "19" and p5.tarifa_iva == "5"
    assert p16.tarifa_iva is None and p0.tarifa_iva is None and p_nulo.tarifa_iva is None
    assert p_con.tarifa_iva == "EXENTO"                                    # ya tenia tarifa: no se toca
    _refrescar(db, p16_exento)
    assert p16_exento.tarifa_iva == "EXENTO"
    otra_vez = cb.listar(db, "tax_rate")
    assert p19.id not in [f["id"] for f in otra_vez.seccion("copiables").filas]
    assert p19.id in [f["id"] for f in otra_vez.seccion("ya_tienen").filas]


def test_tax_rate_sin_la_columna_vieja_no_escribe_y_lo_dice(db, monkeypatch, contador_sql):
    cb = _db3()
    original = cb._columnas
    monkeypatch.setattr(cb, "_columnas",
                        lambda db_, tabla: original(db_, tabla) - ({"tax_rate"} if tabla == "products" else set()))
    with _carpeta() as carpeta:
        contador_sql.reset()
        res = cb.aplicar_tax_rate(db, base=_base(db), carpeta_respaldo=carpeta, ids=[1])
        assert res.cambiados == 0 and not res.escribio and res.respaldo is None
        assert res.detalle == [MENSAJE_SIN_TAX_RATE]
        assert os.listdir(carpeta) == []
        assert not any(s.strip().upper().startswith("UPDATE") for s in contador_sql.sentencias)
        assert contador_sql.commits == 0
        salida = io.StringIO()
        with contextlib.redirect_stdout(salida):
            codigo = cb.main(["tax_rate", "--aplicar", "--base", _base(db), "--respaldo", carpeta, "--ids", "1"])
        assert codigo == 0 and MENSAJE_SIN_TAX_RATE in salida.getvalue()
        assert os.listdir(carpeta) == []
    l = cb.listar(db, "tax_rate")
    assert MENSAJE_SIN_TAX_RATE in l.notas
    assert l.seccion("copiables").filas == [] and l.seccion("otros").filas == []


def test_tax_rate_con_otra_base_o_un_id_fuera_de_la_lista_aborta_sin_escribir(db, brand, category):
    cb = _db3()
    with _carpeta() as carpeta:
        with pytest.raises(cb.ErrorDatos) as exc:
            cb.aplicar_tax_rate(db, base="otra_base_que_no_es", carpeta_respaldo=carpeta, ids=[1])
        assert "otra_base_que_no_es" in str(exc.value) and "no se escribió nada" in str(exc.value)
        salida, error = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(salida), contextlib.redirect_stderr(error):
            codigo = cb.main(["tax_rate", "--aplicar", "--base", "otra_base_que_no_es", "--respaldo", carpeta,
                              "--ids", "1"])
        assert codigo == 2 and "ABORTADO" in error.getvalue() and "Traceback" not in error.getvalue()
        assert os.listdir(carpeta) == []
        if not _hay_tax_rate(db):
            res = cb.aplicar_tax_rate(db, base=_base(db), carpeta_respaldo=carpeta, ids=[1])
            assert res.cambiados == 0 and MENSAJE_SIN_TAX_RATE in res.detalle
            return
        p19 = _producto(db, brand, category, tax_rate=19)
        p5 = _producto(db, brand, category, tax_rate=5)
        p16 = _producto(db, brand, category, tax_rate=16)
        p_con = _producto(db, brand, category, tax_rate=5, tarifa_iva="19")
        p16_exento = _producto(db, brand, category, tax_rate=16, tarifa_iva="EXENTO")   # F1 (M29)
        for pid, motivo in ((p16.id, "no es 19 ni 5 (se deja sin definir)"), (p_con.id, "ya tiene tarifa"),
                            (p16_exento.id, "no es 19 ni 5 (conserva 'EXENTO')"),
                            (2_000_000_000, "no está en el listado")):
            with pytest.raises(cb.ErrorDatos) as exc:
                cb.aplicar_tax_rate(db, base=_base(db), carpeta_respaldo=carpeta, ids=[p19.id, pid])
            assert f"id {pid}" in str(exc.value) and motivo in str(exc.value), str(exc.value)
            assert "no se escribió nada" in str(exc.value)
        assert os.listdir(carpeta) == []
        _refrescar(db, p19)
        assert p19.tarifa_iva is None
        res = cb.aplicar_tax_rate(db, base=_base(db), carpeta_respaldo=carpeta, ids=[p19.id])
        assert res.cambiados == 1 and res.escribio and res.respaldo and os.path.exists(res.respaldo)
    _refrescar(db, p19, p5, p16, p_con)
    assert p19.tarifa_iva == "19" and p5.tarifa_iva is None and p16.tarifa_iva is None and p_con.tarifa_iva == "19"


def test_tax_rate_si_falla_a_medio_camino_no_queda_nada_y_el_respaldo_dice_no_aplicado(db, brand, category,
                                                                                        monkeypatch):
    cb = _db3()
    if not _hay_tax_rate(db):
        with _carpeta() as carpeta:
            res = cb.aplicar_tax_rate(db, base=_base(db), carpeta_respaldo=carpeta, ids=[1])
            assert res.cambiados == 0 and MENSAJE_SIN_TAX_RATE in res.detalle
        return
    p19 = _producto(db, brand, category, tax_rate=19)
    p5 = _producto(db, brand, category, tax_rate=5)
    llamadas = []
    original = cb._copiar_tarifa

    def falla_en_la_segunda(db_, producto_id, tarifa):
        llamadas.append(producto_id)
        if len(llamadas) == 2:
            raise RuntimeError("falla de prueba a medio camino")
        return original(db_, producto_id, tarifa)

    monkeypatch.setattr(cb, "_copiar_tarifa", falla_en_la_segunda)
    with _carpeta() as carpeta:
        with pytest.raises(RuntimeError):
            cb.aplicar_tax_rate(db, base=_base(db), carpeta_respaldo=carpeta, ids=[p19.id, p5.id])
        archivos = os.listdir(carpeta)
        assert len(archivos) == 1 and archivos[0].endswith("-NO-APLICADO.json")
    _refrescar(db, p19, p5)
    assert p19.tarifa_iva is None and p5.tarifa_iva is None                 # el primero tambien se revirtio


# ─── iva_documentos ───────────────────────────────────────────────────────────────────────────────────────────

def test_iva_documentos_lista_las_cot_y_pven_vigentes_sin_iva_discriminado(db):
    from app.core.iva import calcular_totales_cotizacion
    cb = _db3()
    s = _sfx()
    t = calcular_totales_cotizacion([{"product_name": "X", "qty": 1, "unit_price_cop": 1000000, "iva_tarifa": "19"}], 0)
    cot_sin = _cot(db, f"COT-T21{s}", estado="ENVIADA")
    cot_con = _cot(db, f"COT-T21I{s}", estado="BORRADOR", productos=t["lineas"], subtotal_cop=t["subtotal_cop"],
                   tax_cop=t["iva_cop"], total_cop=t["total_cop"])
    cot_mezcla = _cot(db, f"COT-T21M{s}", estado="PENDIENTE_CONFIRMACION",
                      productos=t["lineas"] + [{"product_name": "Y", "qty": 1, "unit_price_cop": 5000}])
    cot_rechazada = _cot(db, f"COT-T21X{s}", estado="RECHAZADA")
    ven_sin = _ven(db, f"PVEN-T21{s}", tax_cop=0)
    ven_cancelado = _ven(db, f"PVEN-T21C{s}", estado="CANCELADO")
    cot_real = _cot(db, f"COT-T21R{s}", estado="CONFIRMADA")
    ven_real = _ven(db, f"PVEN-T21R{s}", cot=cot_real)
    l = cb.listar(db, "iva_documentos", excluidos=(cot_real.numero,))
    cots, vens = _numeros(l, "cotizaciones"), _numeros(l, "pedidos")
    assert cot_sin.numero in cots and cot_mezcla.numero in cots
    assert cot_con.numero not in cots and cot_rechazada.numero not in cots
    assert ven_sin.numero in vens and ven_cancelado.numero not in vens
    assert not _en_alguna_fila(l, cot_real.numero) and not _en_alguna_fila(l, ven_real.numero)
    assert any(cot_real.numero in x for x in l.excluidos) and any(ven_real.numero in x for x in l.excluidos)
    motivo = {f["numero"]: f["motivo"] for f in l.seccion("cotizaciones").filas}
    assert "no traen" in motivo[cot_sin.numero] and "algunas" in motivo[cot_mezcla.numero]
    fila = next(f for f in l.seccion("cotizaciones").filas if f["numero"] == cot_sin.numero)
    assert fila["estado"] == "Enviada al cliente" and fila["total"] == "$1.000.000"
    _sin_datos_del_cliente(cb.texto_listado(l))


# ─── centavos_cot ─────────────────────────────────────────────────────────────────────────────────────────────

def test_centavos_cot_lista_las_pendientes_con_centavos_en_la_cabecera_o_en_las_lineas(db):
    cb = _db3()
    s = _sfx()
    cabecera = _cot(db, f"COT-T21{s}", estado="PENDIENTE_CONFIRMACION", total_cop=Decimal("1000000.50"),
                    subtotal_cop=Decimal("1000000.50"))
    lineas = _cot(db, f"COT-T21L{s}", estado="PENDIENTE_CONFIRMACION",
                  productos=[{"product_name": "X", "qty": 1, "unit_price_cop": 1000.5},
                             {"product_name": "Y", "qty": 1, "unit_price_cop": "abc"},
                             "una línea que no es un producto"])
    enteras = _cot(db, f"COT-T21K{s}", estado="PENDIENTE_CONFIRMACION")
    borrador = _cot(db, f"COT-T21B{s}", estado="BORRADOR", total_cop=Decimal("5.50"))
    real = _cot(db, f"COT-T21R{s}", estado="PENDIENTE_CONFIRMACION", total_cop=Decimal("7.25"))
    l = cb.listar(db, "centavos_cot", excluidos=(real.numero,))
    assert cabecera.numero in _numeros(l, "cabecera") and cabecera.numero not in _numeros(l, "lineas")
    assert lineas.numero in _numeros(l, "lineas") and lineas.numero not in _numeros(l, "cabecera")
    for doc in (enteras, borrador, real):
        assert not _en_alguna_fila(l, doc.numero), doc.numero
    assert any(real.numero in x for x in l.excluidos)
    fila = next(f for f in l.seccion("cabecera").filas if f["numero"] == cabecera.numero)
    assert fila["total"] == "$1.000.000,50" and fila["subtotal"] == "$1.000.000,50"
    fila = next(f for f in l.seccion("lineas").filas if f["numero"] == lineas.numero)
    assert fila["lineas_con_centavos"] == 1 and fila["ejemplo"] == "$1.000,50"


# ─── anticipos_cot ────────────────────────────────────────────────────────────────────────────────────────────

def test_anticipos_cot_separa_las_que_cambian_solo_porque_d7_saco_su_modalidad_del_credito(db):
    cb = _db3()
    s = _sfx()
    sc_d7 = _sc(db, f"SC-T21D{s}", modalidad_pago="Pago a crédito")      # la regla vieja la tomaba como credito
    cot_d7 = _cot(db, f"COT-T21D{s}", sc_d7, estado="PENDIENTE_CONFIRMACION", anticipo_cop=0)
    cot_d7_otro = _cot(db, f"COT-T21E{s}", sc_d7, estado="CONFIRMADA", anticipo_cop=100000)   # ni vieja ni nueva
    sc_6040 = _sc(db, f"SC-T21S{s}")
    cot_mal = _cot(db, f"COT-T21M{s}", sc_6040, estado="CONFIRMADA", anticipo_cop=100000)
    sc_contado = _sc(db, f"SC-T21C{s}", modalidad_pago="Contado")
    cot_ok = _cot(db, f"COT-T21K{s}", sc_contado, estado="PENDIENTE_CONFIRMACION", anticipo_cop=1000000)
    sc_credito = _sc(db, f"SC-T21K{s}", modalidad_pago="Credito 30 dias")
    cot_credito = _cot(db, f"COT-T21Q{s}", sc_credito, estado="PENDIENTE_CONFIRMACION", anticipo_cop=0)
    cot_borrador = _cot(db, f"COT-T21B{s}", sc_6040, estado="BORRADOR", anticipo_cop=100000)
    cot_con_pven = _cot(db, f"COT-T21P{s}", sc_6040, estado="CONFIRMADA", anticipo_cop=100000)
    _ven(db, f"PVEN-T21P{s}", cot=cot_con_pven)
    cot_pven_cancelado = _cot(db, f"COT-T21Y{s}", sc_6040, estado="CONFIRMADA", anticipo_cop=100000)
    _ven(db, f"PVEN-T21Y{s}", cot=cot_pven_cancelado, estado="CANCELADO")
    sc_real = _sc(db, f"SC-T21R{s}", modalidad_pago="Cruce de cuentas")
    cot_real = _cot(db, f"COT-T21R{s}", sc_real, estado="PENDIENTE_CONFIRMACION", anticipo_cop=0)
    # F1 (M31 d): la rama «empieza por cr» de la regla vieja, en una COT que no está excluida; y una con anticipo
    # manual y una modalidad de D7, que no es «solo por D7» (su % sale del manual).
    sc_cr = _sc(db, f"SC-T21CR{s}", modalidad_pago="cr. 90 dias")
    cot_cr = _cot(db, f"COT-T21CR{s}", sc_cr, estado="PENDIENTE_CONFIRMACION", anticipo_cop=0)
    cot_manual = _cot(db, f"COT-T21MN{s}", sc_cr, estado="CONFIRMADA", anticipo_cop=0, anticipo_pct_manual=30,
                      anticipo_manual_nota="Acordado con el cliente")
    # F1 (M32): una COT sin SC con centavos en el anticipo sale con el origen «conservado».
    cot_sin_sc = _cot(db, f"COT-T21NS{s}", estado="PENDIENTE_CONFIRMACION", anticipo_cop=Decimal("300000.50"))
    l = cb.listar(db, "anticipos_cot", excluidos=(sc_real.numero,))
    d7, otras = _numeros(l, "dejo_de_ser_credito"), _numeros(l, "desactualizadas")
    assert cot_cr.numero in d7 and cot_manual.numero not in d7
    fila = next(f for f in l.seccion("desactualizadas").filas if f["numero"] == cot_sin_sc.numero)
    assert fila["origen"] == "conservado"
    assert "sin SC" in l.que_haria and "h36 solo recalcula las COT con SC" in l.que_haria
    assert cot_d7.numero in d7 and cot_d7.numero not in otras
    assert cot_d7_otro.numero in otras and cot_d7_otro.numero not in d7
    assert cot_mal.numero in otras and cot_pven_cancelado.numero in otras
    for doc in (cot_ok, cot_credito, cot_borrador, cot_con_pven, cot_real):
        assert not _en_alguna_fila(l, doc.numero), doc.numero
    assert any(cot_real.numero in x for x in l.excluidos)
    fila = next(f for f in l.seccion("dejo_de_ser_credito").filas if f["numero"] == cot_d7.numero)
    assert fila["anticipo_guardado"] == "$0" and fila["anticipo_hoy"] == "$600.000" and fila["pct"] == "60%"
    assert fila["modalidad"] == "Pago a crédito"
    fila = next(f for f in l.seccion("desactualizadas").filas if f["numero"] == cot_mal.numero)
    assert fila["anticipo_guardado"] == "$100.000" and fila["anticipo_hoy"] == "$600.000"
    _sin_datos_del_cliente(cb.texto_listado(l))


# ─── pagos_sin_verificar ──────────────────────────────────────────────────────────────────────────────────────

def test_pagos_sin_verificar_lista_los_conversion_cotizacion_confirmados(db):
    cb = _db3()
    s = _sfx()
    ven = _ven(db, f"PVEN-T21{s}")
    _pago(db, ven, 600000)
    ven_anulado = _ven(db, f"PVEN-T21A{s}")
    _pago(db, ven_anulado, 600000, estado="ANULADO")
    ven_verificado = _ven(db, f"PVEN-T21K{s}")
    _pago(db, ven_verificado, 600000, "Transferencia bancaria", referencia="BANCO-1")
    real = _ven(db, f"PVEN-T21R{s}")
    _pago(db, real, 600000)
    l = cb.listar(db, "pagos_sin_verificar", excluidos=(real.numero,))
    numeros = _numeros(l, "pagos")
    assert ven.numero in numeros
    for doc in (ven_anulado, ven_verificado, real):
        assert not _en_alguna_fila(l, doc.numero), doc.numero
    assert any(real.numero in x for x in l.excluidos)
    fila = next(f for f in l.seccion("pagos").filas if f["numero"] == ven.numero)
    assert fila["monto"] == "$600.000" and fila["estado"] == "Pendiente de compra"
    _sin_datos_del_cliente(cb.texto_listado(l))


# ─── telefonos ────────────────────────────────────────────────────────────────────────────────────────────────

def test_telefonos_lista_clientes_y_documentos_vigentes_sin_whatsapp_valido(db):
    cb = _db3()
    s = _sfx()
    c_malo = _cliente(db, "300123456")                                     # 9 digitos
    c_sin = _cliente(db, None)
    c_vacio = _cliente(db, "   ")
    c_bueno = _cliente(db, TELEFONO_VALIDO)
    c_real = _cliente(db, "12345")                                         # cliente de un documento real
    sc_malo = _sc(db, f"SC-T21{s}", customer_phone="300123456")
    cot_sin = _cot(db, f"COT-T21{s}", customer_phone=None, customer_id=c_sin.id)
    cot_del_cliente = _cot(db, f"COT-T21C{s}", customer_phone="", customer_id=c_bueno.id, estado="ENVIADA")
    ven_cancelado = _ven(db, f"PVEN-T21{s}", customer_phone="123", estado="CANCELADO")
    sc_cancelada = _sc(db, f"SC-T21C{s}", customer_phone="123", estado="CANCELADA")
    sc_papelera = _sc(db, f"SC-T21P{s}", customer_phone="123", eliminada_at=_ahora())
    cot_rechazada = _cot(db, f"COT-T21X{s}", customer_phone="123", estado="RECHAZADA")
    sc_real = _sc(db, f"SC-T21R{s}", customer_phone="123", customer_id=c_real.id)
    # F1 (M31 e): un pedido vigente y una COT activa con un teléfono inválido; un documento sin teléfono propio cuyo
    # cliente tiene 9 dígitos sale con el origen «del cliente».
    ven_malo = _ven(db, f"PVEN-T21M{s}", customer_phone="123")
    cot_mala = _cot(db, f"COT-T21M{s}", customer_phone="123", estado="BORRADOR")
    cot_del_cliente_malo = _cot(db, f"COT-T21D{s}", customer_phone="", customer_id=c_malo.id, estado="ENVIADA")
    l = cb.listar(db, "telefonos", excluidos=(sc_real.numero,))
    por_numero = {f["numero"]: f for f in l.seccion("documentos_invalidos").filas}
    assert por_numero[ven_malo.numero]["tipo"] == "PVEN" and por_numero[cot_mala.numero]["tipo"] == "COT"
    assert por_numero[cot_del_cliente_malo.numero]["origen"] == "del cliente"
    assert por_numero[cot_del_cliente_malo.numero]["digitos"] == 9
    clientes = {f["id"]: f for f in l.seccion("clientes").filas}
    assert c_malo.id in clientes and clientes[c_malo.id]["digitos"] == 9
    for c in (c_sin, c_vacio, c_bueno, c_real):
        assert c.id not in clientes, c.id
    invalidos, sin = _numeros(l, "documentos_invalidos"), _numeros(l, "documentos_sin_telefono")
    assert sc_malo.numero in invalidos and cot_sin.numero in sin
    for doc in (cot_del_cliente, ven_cancelado, sc_cancelada, sc_papelera, cot_rechazada, sc_real):
        assert not _en_alguna_fila(l, doc.numero), doc.numero
    assert any(sc_real.numero in x for x in l.excluidos)
    assert any(f"cliente #{c_real.id}" in x for x in l.excluidos)
    fila = next(f for f in l.seccion("documentos_invalidos").filas if f["numero"] == sc_malo.numero)
    assert fila["tipo"] == "SC" and fila["digitos"] == 9 and fila["origen"] == "del documento"
    assert l.datos["clientes_sin_telefono"] >= 2 and l.datos["clientes_validos"] >= 1
    texto = cb.texto_listado(l)
    assert "300123456" not in texto and TELEFONO_VALIDO not in texto                    # ningun numero


# ─── pendientes_sin_seguimiento ───────────────────────────────────────────────────────────────────────────────

def test_pendientes_sin_seguimiento_lista_las_que_esperan_confirmacion_sin_recordatorio(db):
    cb = _db3()
    s = _sfx()
    sc_sin = _sc(db, f"SC-T21{s}", estado="PENDIENTE_CONFIRMACION")
    sc_activo = _sc(db, f"SC-T21A{s}", estado="PENDIENTE_CONFIRMACION")
    _seguimiento(db, "SC", sc_activo, "ACTIVO")
    sc_detenido = _sc(db, f"SC-T21D{s}", estado="PENDIENTE_CONFIRMACION")
    _seguimiento(db, "SC", sc_detenido, "DETENIDO", motivo_fin="MANUAL")
    sc_papelera = _sc(db, f"SC-T21P{s}", estado="PENDIENTE_CONFIRMACION", eliminada_at=_ahora())
    sc_asignada = _sc(db, f"SC-T21G{s}")
    cot_sin = _cot(db, f"COT-T21{s}", estado="PENDIENTE_CONFIRMACION")
    cot_activo = _cot(db, f"COT-T21A{s}", estado="PENDIENTE_CONFIRMACION")
    _seguimiento(db, "COT", cot_activo, "ACTIVO")
    sc_real = _sc(db, f"SC-T21R{s}", estado="PENDIENTE_CONFIRMACION")
    cot_real = _cot(db, f"COT-T21R{s}", sc_real, estado="PENDIENTE_CONFIRMACION")
    l = cb.listar(db, "pendientes_sin_seguimiento", excluidos=(sc_real.numero,))
    scs, cots = _numeros(l, "sc"), _numeros(l, "cot")
    assert sc_sin.numero in scs and sc_detenido.numero in scs and cot_sin.numero in cots
    for doc in (sc_activo, sc_papelera, sc_asignada, cot_activo, sc_real, cot_real):
        assert not _en_alguna_fila(l, doc.numero), doc.numero
    assert any(sc_real.numero in x for x in l.excluidos) and any(cot_real.numero in x for x in l.excluidos)
    recordatorio = {f["numero"]: f["recordatorio"] for f in l.seccion("sc").filas}
    assert recordatorio[sc_sin.numero] == "Ninguno" and recordatorio[sc_detenido.numero].startswith("Detenido")


# ─── notas_cot ────────────────────────────────────────────────────────────────────────────────────────────────

def test_notas_cot_lista_las_notas_de_cot_activas_y_pedidos_y_aparta_las_del_cotizador_rapido(db):
    cb = _db3()
    s = _sfx()
    cot_activa = _cot(db, f"COT-T21{s}", estado="ENVIADA", notas="Entrega en portería")
    cot_calculadora = _cot(db, f"COT-T21Q{s}", estado="PENDIENTE_CONFIRMACION", notas=CALCULADORA)
    cot_rechazada = _cot(db, f"COT-T21X{s}", estado="RECHAZADA", notas="Nota de una cotización rechazada")
    cot_vacia = _cot(db, f"COT-T21V{s}", estado="BORRADOR", notas="  \n\t ")
    cot_larga = _cot(db, f"COT-T21L{s}", estado="CONFIRMADA", notas="Línea uno\n" + "A" * 300)
    cot_del_pedido = _cot(db, f"COT-T21P{s}", estado="CONFIRMADA", notas="Nota que hereda el pedido")
    ven = _ven(db, f"PVEN-T21{s}", cot=cot_del_pedido)
    cot_calc_pedido = _cot(db, f"COT-T21K{s}", estado="CONFIRMADA",
                           notas="Cotizado desde Calculadora Rapida. Margen: 25% | TRM: 4000")   # sin tilde
    ven_calc = _ven(db, f"PVEN-T21K{s}", cot=cot_calc_pedido)
    ven_cancelado = _ven(db, f"PVEN-T21C{s}", cot=cot_activa, estado="CANCELADO")
    cot_calc_rechazada = _cot(db, f"COT-T21Y{s}", estado="RECHAZADA", notas=CALCULADORA)
    cot_real = _cot(db, f"COT-T21R{s}", estado="CONFIRMADA", notas="Nota de un documento real")
    ven_real = _ven(db, f"PVEN-T21R{s}", cot=cot_real)
    # F1 (M28): los correos y las series de 7 o más dígitos (con espacios, puntos o guiones) salen ocultos.
    cot_datos = _cot(db, f"COT-T21N{s}", estado="BORRADOR",
                     notas="Llamar a ana.perez@correo.com o al 300 123 4567; cédula 1.023.456.789. Código 4100.")
    l = cb.listar(db, "notas_cot", excluidos=(cot_real.numero,))
    fila = next(f for f in l.seccion("cot_notas").filas if f["numero"] == cot_datos.numero)
    for dato in ("ana.perez@correo.com", "300 123 4567", "1.023.456.789"):
        assert dato not in fila["notas"], fila["notas"]
    assert fila["notas"] == ("Llamar a [correo oculto] o al [número oculto]; cédula [número oculto]. Código 4100.")
    assert "pueden traer datos personales" in cb.INFO["notas_cot"]["que_es"]
    assert "pueden traer datos personales" in cb.__doc__
    cot_otras, cot_calc = _numeros(l, "cot_notas"), _numeros(l, "cot_calculadora")
    pven_otras, pven_calc = _numeros(l, "pven_notas"), _numeros(l, "pven_calculadora")
    assert cot_activa.numero in cot_otras and cot_activa.numero not in cot_calc               # activa con notas: sale
    assert cot_calculadora.numero in cot_calc and cot_calculadora.numero not in cot_otras      # en su grupo
    assert cot_calc_pedido.numero in cot_calc
    assert not _en_alguna_fila(l, cot_rechazada.numero)                                        # RECHAZADA: no sale
    assert not _en_alguna_fila(l, cot_vacia.numero)                                            # notas vacias
    assert not _en_alguna_fila(l, ven_cancelado.numero)                                        # PVEN cancelado: no
    assert ven.numero in pven_otras and ven_calc.numero in pven_calc and ven_calc.numero not in pven_otras
    assert not _en_alguna_fila(l, cot_real.numero) and not _en_alguna_fila(l, ven_real.numero)  # documento real: no
    assert any(cot_real.numero in x for x in l.excluidos) and any(ven_real.numero in x for x in l.excluidos)
    fila = next(f for f in l.seccion("pven_notas").filas if f["numero"] == ven.numero)
    assert fila["cot_origen"] == cot_del_pedido.numero and fila["notas"] == "Nota que hereda el pedido"
    assert fila["estado"] == "Pendiente de compra" and fila["fecha"]
    fila = next(f for f in l.seccion("cot_notas").filas if f["numero"] == cot_larga.numero)
    assert len(fila["notas"]) == 160 and fila["notas"].startswith("Línea uno A") and "\n" not in fila["notas"]
    fila = next(f for f in l.seccion("cot_notas").filas if f["numero"] == cot_activa.numero)
    assert fila["estado"] == "Enviada al cliente" and fila["fecha"]
    # informativo: las del Cotizador Rapido en otros estados, aparte y fuera del conteo
    informativa = l.seccion("calculadora_otros_estados")
    assert informativa.informativa and cot_calc_rechazada.numero in _numeros(l, "calculadora_otros_estados")
    assert cot_rechazada.numero not in _numeros(l, "calculadora_otros_estados")
    assert l.conteo == sum(len(x.filas) for x in l.secciones if not x.informativa)
    # F1 (M30): el resumen no suma la sección informativa: sus partes dan el conteo.
    resumen = cb.texto_resumen([l])
    assert "calculadora_otros_estados" not in resumen
    import re
    dentro = resumen.split("fila(s) (", 1)[1].split(");", 1)[0]
    partes = {clave: int(n) for clave, n in re.findall(r"(\w+): (\d+)", dentro)}
    assert "calculadora_otros_estados" not in partes and sum(partes.values()) == l.conteo, resumen
    texto = cb.texto_listado(l)
    assert "A" * 200 not in texto                                          # el texto tambien sale recortado
    _sin_datos_del_cliente(texto)


# ─── antes de desplegar el Bloque 3 ───────────────────────────────────────────────────────────────────────────

def test_los_listados_sirven_en_una_base_sin_el_bloque_3(db, monkeypatch, contador_sql):
    """En produccion se listan ANTES de desplegar: sin products.tarifa_iva, sin sales_quotations.tax_cop ni la tabla
    seguimientos_confirmacion. Los listados no las nombran y --aplicar de tax_rate no escribe."""
    cb = _db3()
    original = cb._columnas
    ocultas = {"products": {"tarifa_iva"}, "sales_quotations": {"tax_cop"}}

    def sin_bloque3(db_, tabla):
        if tabla == "seguimientos_confirmacion":
            return set()
        return original(db_, tabla) - ocultas.get(tabla, set())

    monkeypatch.setattr(cb, "_columnas", sin_bloque3)
    s = _sfx()
    sc = _sc(db, f"SC-T21{s}", estado="PENDIENTE_CONFIRMACION")
    cot = _cot(db, f"COT-T21{s}", estado="ENVIADA")
    contador_sql.reset()
    listados = {sub: cb.listar(db, sub) for sub in ("tax_rate", "iva_documentos", "pendientes_sin_seguimiento")}
    for sub, l in listados.items():
        assert l.error is None and l.no_aplica is None, (sub, l.error, l.no_aplica)
    sql = " ".join(contador_sql.sentencias)
    assert "tarifa_iva" not in sql and "seguimientos_confirmacion" not in sql and "q.tax_cop" not in sql
    assert sc.numero in _numeros(listados["pendientes_sin_seguimiento"], "sc")
    assert "aún no existe" in " ".join(listados["pendientes_sin_seguimiento"].notas)
    assert cot.numero in _numeros(listados["iva_documentos"], "cotizaciones")
    assert "fa6_027" in listados["tax_rate"].seccion("sin_tarifa").nota
    with _carpeta() as carpeta:
        res = cb.aplicar_tax_rate(db, base=_base(db), carpeta_respaldo=carpeta, ids=[1])
        assert res.cambiados == 0 and any("tarifa_iva" in d for d in res.detalle) and os.listdir(carpeta) == []


# ─── Revisión final del Bloque 3, ronda F1 (M25 y M31) ──────────────────────────────────────────────────────

def test_tax_rate_aplicar_sin_ids_no_escribe_nada(db, brand, category, contador_sql):
    """F1 (M25): ids es obligatorio también en la función (sin ids, o vacío): ErrorDatos con el mensaje, sin UPDATE,
    sin commit y sin respaldo."""
    cb = _db3()
    p19 = _producto(db, brand, category, tax_rate=19) if _hay_tax_rate(db) else None
    with _carpeta() as carpeta:
        for ids in (None, []):
            contador_sql.reset()
            with pytest.raises(cb.ErrorDatos) as exc:
                cb.aplicar_tax_rate(db, base=_base(db), carpeta_respaldo=carpeta, ids=ids)
            assert str(exc.value) == MENSAJE_FALTA_IDS, ids
            assert not any(s.strip().upper().startswith("UPDATE") for s in contador_sql.sentencias), ids
            assert contador_sql.commits == 0, ids
        assert os.listdir(carpeta) == []
    if p19 is not None:
        _refrescar(db, p19)
        assert p19.tarifa_iva is None


def test_tax_rate_el_respaldo_va_antes_del_primer_update(db, brand, category, monkeypatch, contador_sql):
    """F1 (M31 b): el respaldo existe antes del primer UPDATE; si no se puede escribir, se aborta sin ningún UPDATE ni
    commit y la tarifa no cambia. (c) el guard «AND tarifa_iva IS NULL» por sí solo: un producto que ya tiene tarifa
    no cambia aunque se le pida."""
    cb = _db3()
    if not _hay_tax_rate(db):
        return
    p19 = _producto(db, brand, category, tax_rate=19)
    p5 = _producto(db, brand, category, tax_rate=5)
    p_exento = _producto(db, brand, category, tax_rate=19, tarifa_iva="EXENTO")
    assert cb._copiar_tarifa(db, p_exento.id, "19") == 0
    _refrescar(db, p_exento)
    assert p_exento.tarifa_iva == "EXENTO"

    original = cb._copiar_tarifa
    with _carpeta() as carpeta:
        archivos_al_copiar = []

        def espia(db_, producto_id, tarifa):
            archivos_al_copiar.append(len(os.listdir(carpeta)))
            return original(db_, producto_id, tarifa)

        monkeypatch.setattr(cb, "_copiar_tarifa", espia)
        res = cb.aplicar_tax_rate(db, base=_base(db), carpeta_respaldo=carpeta, ids=[p19.id])
        assert res.cambiados == 1 and archivos_al_copiar == [1]

    def no_se_puede(*args, **kwargs):
        raise OSError("disco lleno (prueba)")

    monkeypatch.setattr(cb, "_copiar_tarifa", original)
    monkeypatch.setattr(cb, "_escribir_respaldo_tax_rate", no_se_puede)
    with _carpeta() as carpeta:
        contador_sql.reset()
        with pytest.raises(cb.ErrorDatos) as exc:
            cb.aplicar_tax_rate(db, base=_base(db), carpeta_respaldo=carpeta, ids=[p5.id])
        assert "respaldo" in str(exc.value) and "no se escribió nada" in str(exc.value)
        assert not any(s.strip().upper().startswith("UPDATE") for s in contador_sql.sentencias)
        assert contador_sql.commits == 0
    _refrescar(db, p5)
    assert p5.tarifa_iva is None
