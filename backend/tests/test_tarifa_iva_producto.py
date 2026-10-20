"""Bloque 3, Tarea 3 (IVA-PRODUCTO, backend): la tarifa de IVA es un dato del producto.

- products.tarifa_iva (fa6_027): '19' | '5' | 'EXENTO' | 'EXCLUIDO' | NULL (sin definir), con el CHECK
  ck_products_tarifa_iva.
- core/iva.py (primera parte): TARIFAS_IVA, ORDEN_TARIFAS, ETIQUETAS_TARIFA_IVA, TARIFA_IVA_POR_DEFECTO = '19' (R8),
  CLAVE_TARIFA_DEFECTO, normalizar_tarifa_iva, pct_tarifa_iva, etiqueta_tarifa_iva (puras, RP21) y las dos que reciben
  db: tarifa_iva_defecto (lee con admin_config.leer_config, RP17) y tarifas_de_producto (una sola consulta).
- Catálogo: POST/PATCH /products validan la tarifa a mano, 422 en español (C8/R12; el esquema no tiene validador).
- /crm/products/search devuelve tarifa_iva; /crm/products/quick-create guarda iva_tarifa (422 si no es válida).
- /ventas/config: iva_tarifa_defecto se valida en _validar_config (C23, todo o nada), la leen todos los roles (N8) y
  solo ADMIN la cambia. GET /ventas/cotizaciones/{id} trae iva_tarifa_defecto y tarifas_producto (solo el detalle).

Correr SOLO con el runner de ROLLBACK (admin_config no se trunca y es compartida):
    python tests/rollback_runner.py test_tarifa_iva_producto
"""
import uuid
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

INVALIDA = "Tarifa de IVA no válida: usa 19%, 5%, Exento o Excluido."
CLAVE = "iva_tarifa_defecto"


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _suf():
    return uuid.uuid4().hex[:8].upper()


def _valor_de_config(db, clave):
    fila = db.execute(text("SELECT value FROM admin_config WHERE key = :k"), {"k": clave}).fetchone()
    return fila[0] if fila else None


def _guardar_config(db, clave, valor):
    db.execute(text("INSERT INTO admin_config (key, value, updated_at) VALUES (:k, :v, NOW()) "
                    "ON CONFLICT (key) DO UPDATE SET value = :v, updated_at = NOW()"), {"k": clave, "v": valor})
    db.commit()


def _borrar_config(db, clave):
    db.execute(text("DELETE FROM admin_config WHERE key = :k"), {"k": clave})
    db.commit()


def _restaurar_config(db, clave, previo):
    """admin_config NO se trunca en las pruebas y es compartida: se deja como estaba (como N8)."""
    db.rollback()
    if previo is None:
        _borrar_config(db, clave)
    else:
        _guardar_config(db, clave, previo)


def _producto(db, brand, category, tarifa_iva=None, nombre=None, con_sku=True):
    from app.models.catalog import Product, ProductSKU
    p = Product(brand_id=brand.id, category_id=category.id, name=nombre or f"Producto IVA {_suf()}",
                type="Fisico", base_currency="COP", uom="Ud", tarifa_iva=tarifa_iva)
    db.add(p); db.flush()
    sku = None
    if con_sku:
        sku = ProductSKU(product_id=p.id, sku=f"IVA-{_suf()}", cost_price=1000, sale_price=2000)
        db.add(sku)
    db.commit()
    return p, sku


# --- 1. normalizar_tarifa_iva y las demás funciones puras ------------------------------------------------------------

def test_normalizar_tarifa_iva():
    from app.core import iva
    for valor in ("19", 19, 19.0, Decimal("19"), "19%", " iva 19 ", "IVA 19%", "Iva19"):
        assert iva.normalizar_tarifa_iva(valor) == "19", valor
    for valor in ("5", 5, 5.0, "5%", "IVA 5"):
        assert iva.normalizar_tarifa_iva(valor) == "5", valor
    for valor in ("exento", "EXENTO", " Exento "):
        assert iva.normalizar_tarifa_iva(valor) == "EXENTO", valor
    for valor in ("Excluido", "EXCLUIDO", "excluido"):
        assert iva.normalizar_tarifa_iva(valor) == "EXCLUIDO", valor
    for valor in (None, "", "   "):
        assert iva.normalizar_tarifa_iva(valor) is None, repr(valor)
    # '0' se rechaza a propósito: no dice si es exento o excluido.
    for valor in ("0", 0, "16", 16, "abc", True, False, 19.5, "19.0", "IVA", "%", float("nan"), ["19"], {"t": "19"}):
        try:
            iva.normalizar_tarifa_iva(valor)
        except ValueError as e:
            assert str(e) == INVALIDA, (valor, str(e))
        else:
            raise AssertionError(f"{valor!r} debía lanzar ValueError")


def test_constantes_porcentaje_y_etiqueta_de_cada_tarifa():
    from app.core import iva
    assert iva.TARIFA_IVA_POR_DEFECTO == "19"
    assert iva.CLAVE_TARIFA_DEFECTO == CLAVE
    assert iva.ORDEN_TARIFAS == ("19", "5", "EXENTO", "EXCLUIDO")
    assert iva.TARIFAS_IVA == {"19": Decimal("19"), "5": Decimal("5"), "EXENTO": Decimal("0"), "EXCLUIDO": Decimal("0")}
    assert iva.ETIQUETAS_TARIFA_IVA == {"19": "IVA 19%", "5": "IVA 5%", "EXENTO": "Exento", "EXCLUIDO": "Excluido"}
    assert iva.MENSAJE_TARIFA_INVALIDA == INVALIDA
    # Una sola fuente de los códigos (r1): el orden y las etiquetas cubren exactamente los de TARIFAS_IVA.
    assert set(iva.ORDEN_TARIFAS) == set(iva.TARIFAS_IVA) == set(iva.ETIQUETAS_TARIFA_IVA)
    for codigo, pct in (("19", Decimal("19")), ("5", Decimal("5")), ("EXENTO", Decimal("0")),
                        ("EXCLUIDO", Decimal("0")), ("exento", Decimal("0")), (None, Decimal("0"))):
        assert iva.pct_tarifa_iva(codigo) == pct, codigo
        assert isinstance(iva.pct_tarifa_iva(codigo), Decimal)
    for codigo, etiqueta in (("19", "IVA 19%"), ("5", "IVA 5%"), ("EXENTO", "Exento"), ("EXCLUIDO", "Excluido"),
                             (None, "IVA no discriminado"), ("", "IVA no discriminado")):
        assert iva.etiqueta_tarifa_iva(codigo) == etiqueta, codigo
    # Ruling r1 (como lib/iva.js): un código que normalizar_tarifa_iva rechaza vale lo mismo que None, sin lanzar
    # (un JSON viejo con un código raro no tumba el documento). normalizar_tarifa_iva sí sigue lanzando.
    for raro in ("16", "abc", True, "0", 19.5, ["19"]):
        assert iva.pct_tarifa_iva(raro) == Decimal("0"), raro
        assert isinstance(iva.pct_tarifa_iva(raro), Decimal)
        assert iva.etiqueta_tarifa_iva(raro) == "IVA no discriminado", raro


def test_el_check_de_la_base_trae_exactamente_los_codigos_de_tarifas_iva(db):
    """La migración fa6_027 congela su literal: esta prueba avisa si TARIFAS_IVA y el CHECK se separan."""
    import re
    from app.core import iva
    definicion = db.execute(text(
        "SELECT pg_get_constraintdef(oid) FROM pg_constraint "
        "WHERE conname = 'ck_products_tarifa_iva' AND conrelid = 'products'::regclass")).scalar()
    assert definicion is not None, "falta el CHECK ck_products_tarifa_iva"
    assert "tarifa_iva IS NULL" in definicion, definicion
    assert set(re.findall(r"'([^']*)'", definicion)) == set(iva.TARIFAS_IVA), definicion


# --- 2 a 4. Catálogo: POST y PATCH /products ------------------------------------------------------------------------

def test_crear_producto_con_tarifa(app_client, admin_token, db):
    from app.models.catalog import Product
    # r1: un número JSON (19, 5.0) también se acepta: el esquema solo declara tipos y normalizar_tarifa_iva decide.
    for enviada, guardada in (("5", "5"), ("exento", "EXENTO"), ("IVA 19%", "19"), (None, None), ("", None),
                              (19, "19"), (5.0, "5")):
        nombre = f"Producto Tarifa {_suf()}"
        r = app_client.post("/api/v1/products", json={"name": nombre, "type": "Fisico", "base_currency": "COP",
                                                      "tarifa_iva": enviada}, headers=auth(admin_token))
        assert r.status_code == 201, r.text
        assert r.json()["data"]["tarifa_iva"] == guardada, enviada
        assert db.query(Product).filter(Product.name == nombre).one().tarifa_iva == guardada
    # Sin la clave queda sin definir.
    r = app_client.post("/api/v1/products", json={"name": f"Producto Sin Tarifa {_suf()}", "type": "Fisico",
                                                  "base_currency": "COP"}, headers=auth(admin_token))
    assert r.status_code == 201, r.text
    assert r.json()["data"]["tarifa_iva"] is None


def test_tarifa_invalida_es_422_y_no_crea(app_client, admin_token, db, product):
    from app.models.catalog import Product
    for invalida in ("16", "0", "abc", 16, 0, 19.5, True):
        nombre = f"Producto Invalido {_suf()}"
        r = app_client.post("/api/v1/products", json={"name": nombre, "type": "Fisico", "base_currency": "COP",
                                                      "tarifa_iva": invalida}, headers=auth(admin_token))
        # true (bool JSON): Pydantic lo convierte a int 1 dentro del Union y normalizar_tarifa_iva lo rechaza -> 422.
        assert r.status_code == 422, (invalida, r.text)
        assert r.json()["detail"] == INVALIDA
        assert db.query(Product).filter(Product.name == nombre).count() == 0
    # La base tampoco la acepta (CHECK ck_products_tarifa_iva de fa6_027).
    punto = db.begin_nested()
    try:
        db.execute(text("UPDATE products SET tarifa_iva = '16' WHERE id = :id"), {"id": product.id})
    except IntegrityError as e:
        punto.rollback()
        assert "ck_products_tarifa_iva" in str(e.orig)
    else:
        punto.rollback()
        raise AssertionError("la base aceptó tarifa_iva = '16'")


def test_actualizar_y_quitar_la_tarifa(app_client, admin_token, db, product):
    from app.models.catalog import Product

    def patch(body):
        return app_client.patch(f"/api/v1/products/{product.id}", json=body, headers=auth(admin_token))

    def guardada():
        db.expire_all()
        return db.query(Product).filter(Product.id == product.id).one().tarifa_iva

    r = patch({"tarifa_iva": "19"})
    assert r.status_code == 200, r.text
    assert r.json()["data"]["tarifa_iva"] == "19" and guardada() == "19"
    r = patch({"tarifa_iva": None})
    assert r.status_code == 200, r.text
    assert r.json()["data"]["tarifa_iva"] is None and guardada() is None
    r = patch({"tarifa_iva": 19})  # r1: número JSON
    assert r.status_code == 200, r.text
    assert r.json()["data"]["tarifa_iva"] == "19" and guardada() == "19"
    for invalida in (16, True):
        r = patch({"tarifa_iva": invalida})
        assert r.status_code == 422, (invalida, r.text)
        assert r.json()["detail"] == INVALIDA
        assert guardada() == "19"
    r = patch({"tarifa_iva": "Excluido"})
    assert r.json()["data"]["tarifa_iva"] == "EXCLUIDO" and guardada() == "EXCLUIDO"
    # Un PATCH sin la clave no la toca.
    nuevo = f"Renombrado {_suf()}"
    r = patch({"name": nuevo})
    assert r.status_code == 200, r.text
    assert r.json()["data"]["tarifa_iva"] == "EXCLUIDO" and guardada() == "EXCLUIDO"
    # Una tarifa no válida responde 422 y no cambia NADA del producto (tampoco el nombre que venía en el mismo PATCH).
    r = patch({"name": "No debe guardarse", "tarifa_iva": "16"})
    assert r.status_code == 422, r.text
    assert r.json()["detail"] == INVALIDA
    db.expire_all()
    fila = db.query(Product).filter(Product.id == product.id).one()
    assert fila.tarifa_iva == "EXCLUIDO" and fila.name == nuevo


# --- 5 y 6. Búsqueda y alta rápida -----------------------------------------------------------------------------------

def test_busqueda_devuelve_la_tarifa(app_client, admin_token, db, brand, category):
    marca = f"Buscable{_suf()}"
    con_tarifa, sku_con = _producto(db, brand, category, tarifa_iva="5", nombre=f"Cuna {marca} A")
    sin_tarifa, sku_sin = _producto(db, brand, category, tarifa_iva=None, nombre=f"Cuna {marca} B")
    r = app_client.get(f"/api/v1/crm/products/search?q={marca}", headers=auth(admin_token))
    assert r.status_code == 200, r.text
    filas = {f["id"]: f for f in r.json()["data"]}
    assert filas[sku_con.id]["tarifa_iva"] == "5"
    assert filas[sku_sin.id]["tarifa_iva"] is None


def test_quick_create_guarda_la_tarifa_de_la_linea(app_client, admin_token, db):
    from app.models.catalog import Product

    def crear(**body):
        return app_client.post("/api/v1/crm/products/quick-create", json=body, headers=auth(admin_token))

    nombre = f"Linea IVA {_suf()}"
    r = crear(name=nombre, sale_price=1000, iva_tarifa="5")
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["creado"] is True and data["tarifa_iva"] == "5"
    assert db.query(Product).filter(Product.id == data["product_id"]).one().tarifa_iva == "5"

    # Si el nombre ya existe se reutiliza el producto: su tarifa del catálogo NO cambia por la de la línea.
    r = crear(name=nombre, sale_price=1000, iva_tarifa="EXENTO")
    assert r.status_code == 200, r.text
    assert r.json()["data"]["creado"] is False and r.json()["data"]["tarifa_iva"] == "5"
    db.expire_all()
    assert db.query(Product).filter(Product.id == data["product_id"]).one().tarifa_iva == "5"

    for extra in ({}, {"iva_tarifa": None}, {"iva_tarifa": ""}):
        sin = f"Linea Sin IVA {_suf()}"
        r = crear(name=sin, sale_price=1000, **extra)
        assert r.status_code == 200, r.text
        assert r.json()["data"]["tarifa_iva"] is None
        assert db.query(Product).filter(Product.name == sin).one().tarifa_iva is None

    r = crear(name=f"Linea Normalizada {_suf()}", sale_price=1000, iva_tarifa="excluido")
    assert r.json()["data"]["tarifa_iva"] == "EXCLUIDO"

    for invalida in ("16", "0", True):
        malo = f"Linea Mala {_suf()}"
        r = crear(name=malo, sale_price=1000, iva_tarifa=invalida)
        assert r.status_code == 422, r.text
        assert r.json()["detail"] == INVALIDA
        assert db.query(Product).filter(Product.name == malo).count() == 0
    # Con un nombre que ya existe, una tarifa no válida también es 422 (se valida antes de buscar).
    r = crear(name=nombre, sale_price=1000, iva_tarifa="16")
    assert r.status_code == 422, r.text


# --- 7 y 8. Tarifa por defecto en la Configuración --------------------------------------------------------------------

def test_tarifa_por_defecto_sale_de_configuracion(db, monkeypatch):
    from app.core import iva
    previo = _valor_de_config(db, CLAVE)
    try:
        _borrar_config(db, CLAVE)
        assert iva.tarifa_iva_defecto(db) == "19"
        _guardar_config(db, CLAVE, "5")
        assert iva.tarifa_iva_defecto(db) == "5"
        _guardar_config(db, CLAVE, "exento")  # escrita a mano: se normaliza al leer
        assert iva.tarifa_iva_defecto(db) == "EXENTO"
        for mala in ("abc", "16", "0", ""):
            _guardar_config(db, CLAVE, mala)
            assert iva.tarifa_iva_defecto(db) == "19", mala

        # Si la lectura falla: '19' y queda en el log (no se traga en silencio).
        registro = []

        def falla(*args, **kwargs):
            raise RuntimeError("fallo simulado de admin_config")
        monkeypatch.setattr(iva, "leer_config", falla)
        monkeypatch.setattr(iva.logger, "exception", lambda mensaje, *a, **k: registro.append(mensaje % a))
        assert iva.tarifa_iva_defecto(db) == "19"
        assert registro == [f"No se pudo leer {CLAVE} de admin_config"]
    finally:
        monkeypatch.undo()
        _restaurar_config(db, CLAVE, previo)


def test_un_error_real_de_la_base_al_leer_la_tarifa_no_tumba_la_sesion(app_client, db, admin_token, brand, category,
                                                                       monkeypatch):
    """r1: la lectura va en un SAVEPOINT. Un error REAL de SQL se revierte solo hasta ahí: da '19', la sesión sigue
    sirviendo y el detalle de la cotización responde 200 (antes la consulta siguiente caía con
    InFailedSqlTransaction). La COT lleva una línea con SKU para que tarifas_de_producto haga una consulta real
    DESPUÉS de la lectura fallida (re-revisión r1: con solo texto libre no consultaba nada)."""
    from app.core import iva
    from app.models.erp_documents import SalesQuotation
    _, sku_5 = _producto(db, brand, category, tarifa_iva="5")
    cot = SalesQuotation(numero=f"COT-IVA-{_suf()}", estado="BORRADOR", customer_name="Cliente IVA",
                         productos=[{"product_name": "Texto libre", "qty": 1, "unit_price_cop": 1000},
                                    {"sku_id": sku_5.id, "product_name": "Con tarifa", "qty": 1,
                                     "unit_price_cop": 1000}])
    db.add(cot); db.commit(); db.refresh(cot)
    cot_id = cot.id
    registro = []

    def lee_una_tabla_que_no_existe(sesion, claves):
        return dict(sesion.execute(text("SELECT key, value FROM b3t3_tabla_que_no_existe")).fetchall())

    monkeypatch.setattr(iva, "leer_config", lee_una_tabla_que_no_existe)
    monkeypatch.setattr(iva.logger, "exception", lambda mensaje, *a, **k: registro.append(mensaje % a))
    assert iva.tarifa_iva_defecto(db) == "19"
    assert registro == [f"No se pudo leer {CLAVE} de admin_config"]
    assert db.execute(text("SELECT 1")).scalar() == 1  # la sesión sigue utilizable
    r = app_client.get(f"/api/v1/ventas/cotizaciones/{cot_id}", headers=auth(admin_token))
    assert r.status_code == 200, r.text
    assert r.json()["data"]["iva_tarifa_defecto"] == "19"
    assert r.json()["data"]["tarifas_producto"] == [None, "5"]


def test_un_error_de_lo_pendiente_no_se_disfraza_de_lectura_de_la_tarifa(db, brand, category, monkeypatch):
    """Re-revisión r1: lo pendiente de la sesión se manda (flush) ANTES del try. Si es inválido, su propio error sale tal
    cual; no se registra como «No se pudo leer iva_tarifa_defecto» ni se devuelve '19' con la sesión rota."""
    from app.core import iva
    from app.models.catalog import Product
    from sqlalchemy.exc import IntegrityError
    registro = []
    monkeypatch.setattr(iva.logger, "exception", lambda mensaje, *a, **k: registro.append(mensaje % a))
    db.add(Product(brand_id=brand.id, category_id=category.id, name=None, type="Fisico", base_currency="COP",
                   uom="Ud"))  # name es NOT NULL
    try:
        iva.tarifa_iva_defecto(db)
    except IntegrityError:
        pass
    else:
        raise AssertionError("tarifa_iva_defecto escondió el error de lo pendiente")
    finally:
        db.rollback()
    assert registro == []


def test_config_valida_la_tarifa_y_el_asesor_la_lee(app_client, db, admin_token, vendedor_token):
    previo = _valor_de_config(db, CLAVE)
    previo_alerta = _valor_de_config(db, "alerta_sc_dias")
    try:
        _guardar_config(db, CLAVE, "19")

        def patch(body, token=admin_token):
            return app_client.patch("/api/v1/ventas/config", json=body, headers=auth(token))

        for invalida in ("16", "0", "", None, True):
            r = patch({CLAVE: invalida})
            assert r.status_code == 422, (invalida, r.text)
            assert r.json()["detail"] == INVALIDA
            assert _valor_de_config(db, CLAVE) == "19"
        # Todo o nada (C23): con la tarifa no válida tampoco se guarda la otra clave del mismo PATCH.
        r = patch({"alerta_sc_dias": "17", CLAVE: "16"})
        assert r.status_code == 422, r.text
        assert _valor_de_config(db, "alerta_sc_dias") == previo_alerta
        assert _valor_de_config(db, CLAVE) == "19"

        r = patch({CLAVE: "Exento"})
        assert r.status_code == 200, r.text
        assert _valor_de_config(db, CLAVE) == "EXENTO"
        r = patch({CLAVE: 5})
        assert r.status_code == 200, r.text
        assert _valor_de_config(db, CLAVE) == "5"

        r = app_client.get("/api/v1/ventas/config", headers=auth(vendedor_token))
        assert r.status_code == 200, r.text
        assert r.json()["data"][CLAVE]["value"] == "5"

        r = patch({CLAVE: "19"}, token=vendedor_token)
        assert r.status_code == 403, r.text
        assert _valor_de_config(db, CLAVE) == "5"
    finally:
        _restaurar_config(db, CLAVE, previo)
        _restaurar_config(db, "alerta_sc_dias", previo_alerta)


# --- 9. Detalle de la cotización --------------------------------------------------------------------------------------

def test_get_cotizacion_expone_tarifas(app_client, db, admin_token, brand, category, contador_sql):
    from app.core import iva
    from app.models.erp_documents import SalesQuotation
    previo = _valor_de_config(db, CLAVE)
    try:
        _borrar_config(db, CLAVE)
        _, sku_5 = _producto(db, brand, category, tarifa_iva="5")
        _, sku_sin = _producto(db, brand, category, tarifa_iva=None)
        from app.models.catalog import ProductSKU
        from sqlalchemy import func
        inexistente = db.query(func.max(ProductSKU.id)).scalar() + 100000  # un SKU borrado
        # r1: la línea libre va primero y el 5% en medio, para que solo una lista paralela dé el resultado.
        productos = [
            {"product_name": "Texto libre", "qty": 1, "unit_price_cop": 1000, "es_libre": True},
            {"sku_id": str(sku_sin.id), "product_name": "Sin tarifa", "qty": 1, "unit_price_cop": 1000},
            {"sku_id": sku_5.id, "product_name": "Con tarifa", "qty": 1, "unit_price_cop": 1000},
            {"sku_id": inexistente, "product_name": "SKU borrado", "qty": 1, "unit_price_cop": 1000},
        ]
        cot = SalesQuotation(numero=f"COT-IVA-{_suf()}", estado="BORRADOR", customer_name="Cliente IVA",
                             productos=productos)
        db.add(cot); db.commit(); db.refresh(cot)

        r = app_client.get(f"/api/v1/ventas/cotizaciones/{cot.id}", headers=auth(admin_token))
        assert r.status_code == 200, r.text
        d = r.json()["data"]
        assert d["tarifas_producto"] == [None, None, "5", None]
        assert d["iva_tarifa_defecto"] == "19"
        assert len(d["tarifas_producto"]) == len(d["productos"])

        _guardar_config(db, CLAVE, "EXCLUIDO")
        assert app_client.get(f"/api/v1/ventas/cotizaciones/{cot.id}",
                              headers=auth(admin_token)).json()["data"]["iva_tarifa_defecto"] == "EXCLUIDO"

        # Solo en el detalle: el listado (_cot_dict) no consulta las tarifas por fila.
        r = app_client.get("/api/v1/ventas/cotizaciones", params={"search": cot.numero}, headers=auth(admin_token))
        assert r.status_code == 200, r.text
        fila = next(c for c in r.json()["data"] if c["id"] == cot.id)
        assert "tarifas_producto" not in fila and "iva_tarifa_defecto" not in fila

        # tarifas_de_producto: UNA consulta para todos los SKU; con la lista vacía no consulta. (Los ids se leen antes
        # de contar: tras el commit, sku.id recarga el objeto.)
        id_5, id_sin = sku_5.id, sku_sin.id
        contador_sql.reset()
        assert iva.tarifas_de_producto(db, [id_5, id_sin, id_5]) == {id_5: "5", id_sin: None}
        assert contador_sql.consultas == 1, contador_sql.sentencias
        contador_sql.reset()
        assert iva.tarifas_de_producto(db, []) == {}
        assert contador_sql.consultas == 0
        # r1: ids raros del JSON. Un bool, None o un texto no numérico se ignoran (un True NO consulta el SKU 1) y
        # un texto numérico vale como entero. Sigue siendo una sola consulta, y ninguna si no queda ningún id.
        contador_sql.reset()
        raros = [True, False, None, "abc", "", 12.5, f" {id_5} ", str(id_sin), id_5]
        assert iva.tarifas_de_producto(db, raros) == {id_5: "5", id_sin: None}
        assert contador_sql.consultas == 1, contador_sql.sentencias
        contador_sql.reset()
        assert iva.tarifas_de_producto(db, [True, None, "abc"]) == {}  # sin consulta: el True no se lee como SKU 1
        assert contador_sql.consultas == 0
    finally:
        _restaurar_config(db, CLAVE, previo)


# ─── T20, Paso 1 (revisión de seguridad) ────────────────────────────────────────────────────────────────────

def test_crear_producto_con_marca_inexistente_no_expone_sql(app_client, admin_token, db, brand, category):
    """T20 (M8, M18, punto 7 de lo parqueado): como update_product, create_product valida que la marca y la categoría
    existan (400 en español) y, ante cualquier otro error al guardar, responde un 400 genérico sin str(e): nunca el SQL,
    la tabla ni los parámetros."""
    from app.models.catalog import Product
    for campo, mensaje in (("brand_id", "La marca indicada no existe"),
                           ("category_id", "La categoria indicada no existe")):
        nombre = f"Producto T20 {_suf()}"
        body = {"name": nombre, "type": "Fisico", "base_currency": "COP", "brand_id": brand.id,
                "category_id": category.id, campo: 2_000_000_000}
        r = app_client.post("/api/v1/products", json=body, headers=auth(admin_token))
        assert r.status_code == 400, r.text
        assert r.json()["detail"] == mensaje
        for pedazo in ("SQL", "INSERT", "psycopg2", "products", "violates"):
            assert pedazo not in r.text, (pedazo, r.text)
        assert db.query(Product).filter(Product.name == nombre).count() == 0
    # Otro error al guardar (un NUL: psycopg2 lo rechaza en el INSERT): el 400 genérico, sin el texto del error.
    r = app_client.post("/api/v1/products", json={"name": f"Producto\x00T20 {_suf()}", "type": "Fisico",
                                                  "base_currency": "COP", "brand_id": brand.id,
                                                  "category_id": category.id}, headers=auth(admin_token))
    assert r.status_code == 400, r.text
    assert r.json()["detail"] == "No se pudo crear el producto. Revisa los datos e intenta de nuevo."
    assert "NUL" not in r.text and "0x00" not in r.text
