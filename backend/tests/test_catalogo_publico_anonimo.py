"""B4 T24 (FINAL-C1): el catálogo público sin sesión. GET /ecommerce/catalogo y GET /ecommerce/catalogo/{id} no tienen guardia
de rol (la tienda los lee sin token). Sin sesión ERP (get_optional_current_user da None):
- el detalle no devuelve notas_internas, created_by ni codigo_aduana, ni total_vendido, y su petición no carga los pedidos WEB;
- un producto con publicado_web = false da 404;
- la lista solo trae los publicados (publicado=false sin sesión no trae nada).
Con sesión ERP todo sigue como hoy (la pantalla de E-Commerce necesita ver los despublicados para el interruptor), y
total_vendido sale de una consulta agregada (SUM en SQL), nunca de cargar todos los pedidos WEB con .all().

Se corre SOLO con el runner de ROLLBACK (python tests/rollback_runner.py test_catalogo_publico_anonimo).
"""
import uuid

from sqlalchemy import text

from app.models.catalog import ProductWebListing
from app.models.erp_documents import SaleOrder
from tests.test_listas_varias_paginadas import CATALOGO, _Catalogo, _nombres, _obtener, _ok, _ramas

INTERNAS = {"notas_internas", "created_by", "codigo_aduana"}
CLAVES_DETALLE_HEREDADO = {"id", "nombre", "descripcion", "descripcion_larga", "sku", "precio_venta", "precio_comparacion",
                           "descuento_pct", "impuesto_pct", "categoria", "sub_categoria", "marca", "tipo_producto",
                           "imagenes", "atributos", "variantes", "stock_disponible", "alerta_stock_minimo",
                           "publicado_web", "rastrear_inventario", "codigo_aduana", "peso_kg", "notas_internas",
                           "seo_titulo", "seo_descripcion", "seo_keywords", "created_at", "updated_at", "created_by"}
CLAVES_DETALLE_CANONICO_SKU = {"id", "nombre", "descripcion", "sku", "precio_venta", "precio_comparacion",
                               "descuento_pct", "impuesto_pct", "categoria", "sub_categoria", "marca", "tipo_producto",
                               "imagenes", "atributos", "variantes", "stock_disponible", "modalidad_disponible",
                               "alerta_stock_minimo", "publicado_web", "rastrear_inventario", "seo_titulo", "created_at",
                               "updated_at", "is_low_stock", "descripcion_larga", "seo_descripcion", "seo_keywords",
                               "codigo_aduana", "peso_kg", "notas_internas", "created_by"}


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _detalle(app_client, ident, token=None):
    return app_client.get(f"{CATALOGO}/{ident}", headers=_auth(token) if token else {})


def _datos(app_client, ident, token=None):
    resp = _detalle(app_client, ident, token)
    assert resp.status_code == 200, (ident, resp.status_code, resp.text)
    return resp.json()["data"]


def _escribe(ventana):
    """Las sentencias de escritura de una ventana del contador (el GET solo asegura las tablas con CREATE IF NOT EXISTS)."""
    return [s for s in ventana.sentencias if s.lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE"))]


def _con_datos_internos(db, t):
    """h1 (publicado) y h2 (despublicado) con notas internas, autor y código de aduana; p2 con su ficha web despublicada y
    p1 con la suya publicada, las dos con datos internos."""
    for ident in (t.h1, t.h2):
        db.execute(text("UPDATE ecommerce_products SET notas_internas='nota secreta', created_by='quien@x.co', "
                        "codigo_aduana='9503' WHERE id=:i"), {"i": ident})
    db.add_all([
        ProductWebListing(sku_id=t.p1.id, publicado_web=True, notas_internas="nota secreta", created_by="quien@x.co",
                          codigo_aduana="9503"),
        ProductWebListing(sku_id=t.p2.id, publicado_web=False, notas_internas="nota secreta", created_by="quien@x.co",
                          codigo_aduana="9503"),
    ])
    db.commit()


def test_detalle_anonimo_sin_datos_internos_ni_total_vendido_en_las_dos_ramas(app_client, db, warehouse, monkeypatch):
    t = _Catalogo(db, warehouse)
    _con_datos_internos(db, t)
    monkeypatch.setenv("CATALOGO_LECTURA", "legacy")
    resp = _detalle(app_client, t.h1)
    assert resp.status_code == 200, resp.text
    assert set(resp.json()["data"]) == CLAVES_DETALLE_HEREDADO - INTERNAS
    monkeypatch.setenv("CATALOGO_LECTURA", "canonico")
    resp = _detalle(app_client, -t.h1)
    assert resp.status_code == 200, resp.text
    assert set(resp.json()["data"]) == CLAVES_DETALLE_HEREDADO - INTERNAS
    resp = _detalle(app_client, t.p1.id)
    assert resp.status_code == 200, resp.text
    assert set(resp.json()["data"]) == CLAVES_DETALLE_CANONICO_SKU - INTERNAS


def test_detalle_con_sesion_erp_trae_todo_como_hoy(app_client, db, warehouse, monkeypatch, admin_token):
    t = _Catalogo(db, warehouse)
    _con_datos_internos(db, t)
    monkeypatch.setenv("CATALOGO_LECTURA", "legacy")
    for ident in (t.h1, t.h2):  # con sesión también el despublicado
        data = _datos(app_client, ident, admin_token)
        assert set(data) == CLAVES_DETALLE_HEREDADO | {"total_vendido"}, ident
        assert (data["notas_internas"], data["created_by"], data["codigo_aduana"]) == ("nota secreta", "quien@x.co", "9503")
    monkeypatch.setenv("CATALOGO_LECTURA", "canonico")
    for ident, claves in ((-t.h2, CLAVES_DETALLE_HEREDADO), (t.p2.id, CLAVES_DETALLE_CANONICO_SKU)):
        resp = _detalle(app_client, ident, admin_token)
        assert resp.status_code == 200, (ident, resp.text)
        data = resp.json()["data"]
        assert set(data) == claves | {"total_vendido"}, ident
        assert (data["notas_internas"], data["created_by"], data["codigo_aduana"]) == ("nota secreta", "quien@x.co", "9503")


def test_detalle_anonimo_de_un_despublicado_da_404_en_las_dos_ramas(app_client, db, warehouse, monkeypatch, contador_sql):
    t = _Catalogo(db, warehouse)
    _con_datos_internos(db, t)
    monkeypatch.setenv("CATALOGO_LECTURA", "legacy")
    for ident in (t.h2,):
        with contador_sql.ventana() as v:
            resp = _detalle(app_client, ident)
        assert (resp.status_code, resp.json()) == (404, {"detail": "Producto no encontrado"}), ident
        assert not _escribe(v), ident
    monkeypatch.setenv("CATALOGO_LECTURA", "canonico")
    for ident in (-t.h2, t.p2.id):
        with contador_sql.ventana() as v:
            resp = _detalle(app_client, ident)
        assert (resp.status_code, resp.json()) == (404, {"detail": "Producto no encontrado"}), ident
        assert not _escribe(v), ident


def test_detalle_anonimo_no_carga_los_pedidos_web(app_client, db, warehouse, monkeypatch, contador_sql):
    t = _Catalogo(db, warehouse)
    for rama, ident in (("legacy", t.h1), ("canonico", -t.h1), ("canonico", t.p1.id)):
        monkeypatch.setenv("CATALOGO_LECTURA", rama)
        with contador_sql.ventana() as v:
            assert _detalle(app_client, ident).status_code == 200
        assert not [s for s in v.sentencias if "sale_orders" in s], (rama, ident)


def test_total_vendido_con_sesion_es_una_suma_en_sql_con_la_regla_de_hoy(app_client, db, warehouse, monkeypatch,
                                                                         contador_sql, admin_token):
    """La regla de hoy: pedidos WEB no cancelados; cada línea cuenta si su sku es el del producto o su nombre es el mismo sin
    mayúsculas; vale qty, o cantidad si no trae qty."""
    t = _Catalogo(db, warehouse)
    s = uuid.uuid4().hex[:8].upper()
    nombre_h1 = t.nombres["h1"]
    sku_h1 = f"ORF-{t.s}-1"

    def pedido(n, productos, estado="PAGADO", canal="WEB"):
        db.add(SaleOrder(numero=f"PV-C1{s}{n}", canal_venta=canal, total_cop=1, productos=productos, estado=estado))
        db.commit()

    pedido(1, [{"sku": sku_h1, "qty": 2}, {"sku": "OTRO", "qty": 40}, {"sku": sku_h1, "qty": 1, "cantidad": 9}])
    pedido(2, [{"nombre": nombre_h1.upper(), "cantidad": 3}])
    pedido(3, [{"sku": sku_h1, "qty": 5}], estado="CANCELADO")
    pedido(4, [{"sku": sku_h1, "qty": 7}], canal="CRM")
    pedido(5, None)
    for rama, ident in (("legacy", t.h1), ("canonico", -t.h1)):
        monkeypatch.setenv("CATALOGO_LECTURA", rama)
        with contador_sql.ventana() as v:
            data = _datos(app_client, ident, admin_token)
        assert data["total_vendido"] == 6, rama   # 2 + 1 (qty gana sobre cantidad) + 3 (por nombre, con cantidad)
        con_pedidos = [x for x in v.sentencias if "sale_orders" in x]
        assert len(con_pedidos) == 1 and "sum(" in con_pedidos[0].lower(), (rama, con_pedidos)


def test_lista_anonima_solo_trae_publicados_y_con_sesion_trae_todo(app_client, db, warehouse, monkeypatch, admin_token):
    t = _Catalogo(db, warehouse)
    n = t.nombres
    for rama in _ramas(monkeypatch):
        for params in ({}, {"publicado": "true"}, {"orden": "nombre"}, {"offset": 0}):
            anonima = _ok(app_client, CATALOGO, search=t.s, **params)
            assert n["h2"] not in _nombres(anonima), (rama, params)
            assert sorted(_nombres(anonima)) == sorted([n["auto"], n["h1"], n["nevera"]]), (rama, params)
            assert anonima["total"] == 3, (rama, params, anonima["total"])
        cuerpo = _ok(app_client, CATALOGO, search=t.s, publicado="false")
        assert (cuerpo["total"], cuerpo["data"]) == (0, []), rama
        assert _ok(app_client, CATALOGO, search=t.s, limit=0, offset=0)["total"] == 3, rama
        con_sesion = _ok(app_client, CATALOGO, admin_token, search=t.s, orden="nombre")
        assert _nombres(con_sesion) == [n["auto"], n["h1"], n["h2"], n["nevera"]], rama
        assert _nombres(_ok(app_client, CATALOGO, admin_token, search=t.s, publicado="false", offset=0)) == (
            [n["h2"]] if rama == "canonico" else [n["h2"], n["auto"]]), rama
        # un token que no es de un usuario ERP vale como sin sesión
        resp = _obtener(app_client, CATALOGO, "no-es-un-token", search=t.s, orden="nombre")
        assert resp.status_code == 200 and n["h2"] not in _nombres(resp.json()), rama



# ─── B4 T24 r1 (C1, m14): un producto despublicado no se cuela por su espejo ni por el respaldo del detalle ────────────

def _despublicar_la_nevera(db, t):
    """La nevera (p1) despublicada como se ve en cada rama: su espejo m1 de ecommerce_products con publicado_web = false
    (la rama heredada lee de ahí) y su ficha web ProductWebListing despublicada (la canónica lee de ahí)."""
    db.execute(text("UPDATE ecommerce_products SET publicado_web = FALSE WHERE id = :i"), {"i": t.m1})
    db.add(ProductWebListing(sku_id=t.p1.id, publicado_web=False))
    db.commit()


def test_un_sku_con_espejo_despublicado_no_sale_sin_sesion(app_client, db, warehouse, monkeypatch, admin_token):
    """r1 (C1): en la rama heredada sin offset (la de la tienda en producción), el SKU cuyo espejo está despublicado
    volvía a salir como fila propia con publicado_web: True. Sin sesión, un SKU con CUALQUIER espejo se descarta (el espejo
    publicado sale como su propia fila). Con sesión, como hoy (con publicado=true el SKU sale como fila del ERP, BASE)."""
    t = _Catalogo(db, warehouse)
    n = t.nombres
    _despublicar_la_nevera(db, t)
    for rama in _ramas(monkeypatch):
        for params in ({}, {"publicado": "true", "limit": 50}, {"publicado": "true", "limit": 3}, {"orden": "nombre"},
                       {"offset": 0}):
            anonima = _nombres(_ok(app_client, CATALOGO, search=t.s, **params))
            assert n["nevera"] not in anonima, (rama, params, anonima)
            assert n["auto"] in anonima and n["h1"] in anonima, (rama, params, anonima)
        con_sesion = _nombres(_ok(app_client, CATALOGO, admin_token, search=t.s, orden="nombre"))
        assert n["nevera"] in con_sesion, (rama, con_sesion)


def test_el_espejo_publicado_sigue_saliendo_una_vez_sin_sesion(app_client, db, warehouse, monkeypatch):
    """r1 (C1): con el espejo publicado, la nevera sale UNA vez sin sesión: como la fila de ecommerce_products (heredada)
    o como el SKU (canónica)."""
    t = _Catalogo(db, warehouse)
    for rama in _ramas(monkeypatch):
        nombres = _nombres(_ok(app_client, CATALOGO, search=t.s, publicado="true", limit=50))
        assert nombres.count(t.nombres["nevera"]) == 1, (rama, nombres)


def test_el_respaldo_del_detalle_no_sirve_un_despublicado_sin_sesion(app_client, db, warehouse, monkeypatch,
                                                                     admin_token):
    """r1 (C1): GET /catalogo/{id} de la rama heredada, cuando el id no es de ecommerce_products, responde el Product con ese
    id. Sin sesión ya no responde uno cuyo SKU tiene el espejo despublicado: el mismo 404 que la ficha despublicada. Uno sin
    espejo, o con el espejo publicado, sigue respondiendo; con sesión, como hoy."""
    t = _Catalogo(db, warehouse)
    monkeypatch.setenv("CATALOGO_LECTURA", "legacy")
    nevera, auto = t.p1.product_id, t.p2.product_id
    ocupados = {r[0] for r in db.execute(text("SELECT id FROM ecommerce_products WHERE id IN (:a, :b)"),
                                         {"a": nevera, "b": auto})}
    assert not ocupados, "el id del producto coincide con una fila de ecommerce_products: la prueba no mira el respaldo"
    assert _detalle(app_client, nevera).status_code == 200     # espejo publicado
    _despublicar_la_nevera(db, t)
    resp = _detalle(app_client, nevera)
    assert (resp.status_code, resp.json()) == (404, {"detail": "Producto no encontrado"})
    assert _detalle(app_client, nevera, admin_token).status_code == 200
    assert _detalle(app_client, auto).status_code == 200       # sin espejo


def test_una_ficha_web_despublicada_no_sale_sin_sesion_en_la_canonica(app_client, db, warehouse, monkeypatch,
                                                                       admin_token):
    """r1 (m14): en la rama canónica, un SKU con su ProductWebListing despublicado no sale en la lista anónima y sí con
    sesión."""
    t = _Catalogo(db, warehouse)
    db.add(ProductWebListing(sku_id=t.p2.id, publicado_web=False))
    db.commit()
    monkeypatch.setenv("CATALOGO_LECTURA", "canonico")
    for params in ({}, {"publicado": "true"}, {"orden": "nombre"}, {"offset": 0}):
        assert t.nombres["auto"] not in _nombres(_ok(app_client, CATALOGO, search=t.s, **params)), params
    assert t.nombres["auto"] in _nombres(_ok(app_client, CATALOGO, admin_token, search=t.s, orden="nombre"))


def test_un_error_del_catalogo_no_le_muestra_el_sql_al_anonimo(app_client, db, warehouse, monkeypatch, admin_token):
    """r1 (m10): con un error del código de BASE, el anónimo ya no recibe str(e) (trae el SQL y sus parámetros): recibe un
    texto genérico. Con sesión sigue la paridad con BASE (str(e))."""
    from app.api.v1 import ecommerce
    t = _Catalogo(db, warehouse)
    monkeypatch.setenv("CATALOGO_LECTURA", "legacy")

    def roto(*args, **kwargs):
        raise RuntimeError("SELECT secreto FROM tabla WHERE x = 1")
    monkeypatch.setattr(ecommerce, "_filas_heredadas_de_hoy", roto)
    resp = app_client.get(CATALOGO, params={"search": t.s})
    assert (resp.status_code, resp.json()) == (200, {"status": "success", "total": 0, "data": [],
                                                     "error": "No se pudo cargar el catálogo."})
    resp = app_client.get(CATALOGO, params={"search": t.s}, headers=_auth(admin_token))
    assert resp.json()["error"] == "SELECT secreto FROM tabla WHERE x = 1"



# ─── B4 T24 r2 (m7): el checkout anónimo no vende lo que la tienda ya no muestra ──────────────────────────────────────

def _pedido_web(app_client, sku=None, codigo=None, token=None):
    linea = {"quantity": 1, "modalidad": "POR_PEDIDO", **({"sku_id": sku.id} if sku is not None else {"sku": codigo})}
    cabecera = {"Authorization": f"Bearer {token}"} if token else {}
    return app_client.post("/api/v1/ecommerce/pedidos", headers=cabecera, json={
        "idempotency_key": f"r2-m7-{uuid.uuid4().hex}", "customer_email": f"r2m7-{uuid.uuid4().hex[:8]}@test.nebulae",
        "customer_name": "Ana Tienda", "customer_phone": "3001234567", "productos": [linea],
        "direccion_entrega": "Calle 1 #2-3"})


def test_el_checkout_anonimo_rechaza_un_sku_que_la_tienda_ya_no_muestra(app_client, db, warehouse, contador_sql):
    """r2 (m7): POST /ecommerce/pedidos sin sesión resolvía cualquier SKU por sku_id o por código sin mirar la publicación:
    un producto despublicado (que tras C1 ya no sale en la lista ni en el detalle) se podía pedir igual. Ahora la misma
    regla de C1: un SKU con espejo en ecommerce_products y ninguno publicado da 409 en español, sin escribir. Un SKU sin
    espejo sigue como hoy (la regla de BASE)."""
    t = _Catalogo(db, warehouse)
    _despublicar_la_nevera(db, t)
    nevera, codigo = t.p1.id, t.p1.sku
    antes = db.query(SaleOrder).count()
    texto = f"El producto {codigo} ya no está disponible en la tienda."
    for por in ({"sku": t.p1}, {"codigo": codigo}):
        with contador_sql.ventana() as v:
            resp = _pedido_web(app_client, **por)
        assert (resp.status_code, resp.json()) == (409, {"detail": texto}), (por, resp.status_code, resp.text)
        assert not [s for s in v.sentencias if s.lstrip().upper().startswith(("INSERT", "UPDATE"))], por
    db.expire_all()
    assert db.query(SaleOrder).count() == antes, nevera   # r3 (m25): sin el «and nevera» que no afirmaba nada
    resp = _pedido_web(app_client, sku=t.p2)   # sin espejo: como hoy
    assert resp.status_code == 201, resp.text



def test_un_reintento_del_checkout_devuelve_el_pedido_aunque_el_sku_se_despublique(app_client, db, warehouse):
    """Cierre de r2 (ruling de m7): la regla de publicación del checkout corre DESPUÉS de buscar la idempotencia. Un pedido
    creado (con el espejo publicado) y reintentado con la misma clave después de despublicar el SKU devuelve el mismo
    pedido (200, idempotent_replay), no un 409: un reintento de red no puede hacer creer al cliente que falló. Una clave
    nueva con el SKU ya despublicado sí da 409."""
    t = _Catalogo(db, warehouse)
    clave, correo = f"r2-m7-{uuid.uuid4().hex}", f"r2m7-{uuid.uuid4().hex[:8]}@test.nebulae"
    cuerpo = {"idempotency_key": clave, "customer_email": correo, "customer_name": "Ana Tienda",
              "customer_phone": "3001234567", "direccion_entrega": "Calle 1 #2-3",
              "productos": [{"sku_id": t.p1.id, "quantity": 1, "modalidad": "POR_PEDIDO"}]}
    creado = app_client.post("/api/v1/ecommerce/pedidos", json=cuerpo)
    assert creado.status_code == 201, creado.text
    _despublicar_la_nevera(db, t)
    reintento = app_client.post("/api/v1/ecommerce/pedidos", json=cuerpo)
    assert reintento.status_code == 200, reintento.text
    assert reintento.json()["idempotent_replay"] is True
    assert reintento.json()["data"]["id"] == creado.json()["data"]["id"]
    nuevo = app_client.post("/api/v1/ecommerce/pedidos", json={**cuerpo, "idempotency_key": f"r2-m7-{uuid.uuid4().hex}"})
    assert nuevo.status_code == 409, nuevo.text



def test_el_checkout_con_sesion_erp_sigue_como_hoy(app_client, db, warehouse, admin_token):
    """r3 (m12 + m23): con sesión ERP (la tienda puede mandar el token de un empleado), el checkout del SKU despublicado
    crea el pedido (201), como la lista y el detalle de C1 con sesión."""
    t = _Catalogo(db, warehouse)
    _despublicar_la_nevera(db, t)
    resp = _pedido_web(app_client, sku=t.p1, token=admin_token)
    assert resp.status_code == 201, resp.text
