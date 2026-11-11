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
