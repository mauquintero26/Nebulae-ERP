"""B4.1 T2 (A1-b y P27): el esquema de ids del catálogo de la tienda, igual en las dos ramas de GET /ecommerce/catalogo.

A1-b: una fila de ecommerce_products lleva su id (> 0) y un SKU del ERP lleva -product_skus.id (< 0). Antes, en la rama
heredada (la de producción), una fila SKU llevaba product_skus.id: chocaba con la fila de ecommerce_products de ese mismo
número, y PATCH y DELETE (con abs()) escribían en esa fila ajena; el detalle respondía otro producto por Product.id. Cada
fila lleva además `editable_en_tienda` (False solo en las filas SKU de la rama heredada).

P27: en la rama heredada sin offset, con sesión también se descarta el SKU con CUALQUIER espejo en ecommerce_products (como
sin sesión y como la rama paginada), y un SKU sin espejo respeta la categoría y la publicación (publicado=false no lo trae).

`_escribe(v)` mira las sentencias INSERT, UPDATE o DELETE de la ventana del contador, no los commits:
_ensure_ecommerce_tables hace un commit en cada petición (como en test_catalogo_publico_anonimo.py).

Se corre SOLO con el runner de ROLLBACK (python tests/rollback_runner.py test_b41_catalogo_ids).
"""
from sqlalchemy import text

from app.models.catalog import ProductWebListing
from tests.test_listas_varias_paginadas import CATALOGO, _Catalogo, _nombres, _ok, _ramas

TEXTO_FILA_DEL_ERP = "Ese producto no se puede editar desde el catálogo de la tienda."


def _auth(token):
    """La cabecera de la sesión ERP; sin token, ninguna (la llamada anónima de la tienda)."""
    return {"Authorization": f"Bearer {token}"} if token else {}


def _escribe(v):
    """Las sentencias de escritura de una ventana del contador."""
    return [s for s in v.sentencias if s.lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE"))]


def _fila(db, ident):
    """(id, nombre, publicado_web, updated_at) de la fila `ident` de ecommerce_products, o None."""
    r = db.execute(text("SELECT id, nombre, publicado_web, updated_at FROM ecommerce_products WHERE id = :i"),
                   {"i": ident}).first()
    return tuple(r) if r is not None else None


def _fila_ajena_con_el_id(db, ident, s):
    """A1: la fila `ident` de ecommerce_products, la que chocaba con el SKU `ident`. erp_test es compartida: si ya existe,
    se usa esa; si no, se inserta con ese id explícito (dentro de la transacción revertida)."""
    if _fila(db, ident) is None:
        db.execute(text("INSERT INTO ecommerce_products (id, nombre, sku, publicado_web) VALUES (:i, :n, :s, TRUE)"),
                   {"i": ident, "n": f"Zz-{s}-Ajena", "s": f"AJENA-{s}"})
        db.commit()
    return _fila(db, ident)


def _nombre_ep(db, ident):
    """El nombre de la fila `ident` de ecommerce_products, o None si no existe."""
    return db.execute(text("SELECT nombre FROM ecommerce_products WHERE id = :i"), {"i": ident}).scalar()


def _patch(app_client, token, ident, cuerpo):
    return app_client.patch(f"{CATALOGO}/{ident}", json=cuerpo, headers=_auth(token))


# ─── A1-b: el esquema de ids ─────────────────────────────────────────────────────────────────────────────────────────

def test_ids_de_las_filas_en_las_dos_ramas(app_client, db, warehouse, monkeypatch, admin_token):
    t = _Catalogo(db, warehouse)
    llamadas = [({}, admin_token), ({"offset": 0}, admin_token), ({"publicado": "true", "limit": 50}, None),
                ({"orden": "nombre"}, None)]
    for rama in _ramas(monkeypatch):
        for params, token in llamadas:
            filas = {x["sku"]: x for x in _ok(app_client, CATALOGO, token, search=t.s, **params)["data"]}
            ids = [x["id"] for x in filas.values()]
            assert len(ids) == len(set(ids)), (rama, params, ids)                       # A1-f: claves de fila únicas
            assert filas[t.p2.sku]["id"] == -t.p2.id, (rama, params)                    # el auto: SKU sin espejo
            assert filas[f"ORF-{t.s}-1"]["id"] == t.h1, (rama, params)                   # el huérfano: su id
            assert filas[f"ORF-{t.s}-1"]["editable_en_tienda"] is True, (rama, params)
            if rama == "legacy":
                assert filas[t.p1.sku]["id"] == t.m1, (rama, params)                   # la nevera: su espejo
                assert filas[t.p2.sku]["editable_en_tienda"] is False, (rama, params)
            else:
                assert filas[t.p1.sku]["id"] == -t.p1.id, (rama, params)
                assert filas[t.p2.sku]["editable_en_tienda"] is True, (rama, params)


def test_ida_y_vuelta_de_la_lista_al_detalle(app_client, db, warehouse, monkeypatch, admin_token):
    t = _Catalogo(db, warehouse)
    for rama in _ramas(monkeypatch):
        for token in (None, admin_token):
            for fila in _ok(app_client, CATALOGO, token, search=t.s, publicado="true", limit=50)["data"]:
                resp = app_client.get(f"{CATALOGO}/{fila['id']}", headers=_auth(token))
                assert resp.status_code == 200, (rama, token is not None, fila["id"], resp.text)
                d = resp.json()["data"]
                assert (d["sku"], d["nombre"]) == (fila["sku"], fila["nombre"]), (rama, fila["id"])
    monkeypatch.setenv("CATALOGO_LECTURA", "canonico")
    d = app_client.get(f"{CATALOGO}/{t.m1}").json()["data"]                         # la URL de hoy de un espejo
    assert (d["sku"], d["id"]) == (t.p1.sku, -t.p1.id)                               # abre el SKU tras el corte


def test_patch_y_delete_de_una_fila_sku_no_tocan_la_fila_ajena(app_client, db, warehouse, monkeypatch, admin_token,
                                                              contador_sql):
    monkeypatch.setenv("CATALOGO_LECTURA", "legacy")
    t = _Catalogo(db, warehouse)
    antes = _fila_ajena_con_el_id(db, t.p2.id, t.s)     # A1: la fila n de ecommerce_products y el SKU n
    for metodo, extra in (("patch", {"json": {"publicado_web": False}}), ("delete", {})):
        with contador_sql.ventana() as v:
            resp = getattr(app_client, metodo)(f"{CATALOGO}/{-t.p2.id}", headers=_auth(admin_token), **extra)
        assert (resp.status_code, resp.json()) == (404, {"detail": TEXTO_FILA_DEL_ERP}), (metodo, resp.text)
        assert _escribe(v) == [], metodo
        assert _fila(db, t.p2.id) == antes, metodo


def test_patch_y_delete_de_una_fila_propia_siguen_funcionando(app_client, db, warehouse, monkeypatch, admin_token):
    t = _Catalogo(db, warehouse)
    monkeypatch.setenv("CATALOGO_LECTURA", "legacy")
    assert _patch(app_client, admin_token, t.h1, {"nombre": f"Zz-{t.s}-Editado"}).status_code == 200
    assert _nombre_ep(db, t.h1) == f"Zz-{t.s}-Editado"
    assert app_client.delete(f"{CATALOGO}/{t.h2}", headers=_auth(admin_token)).status_code == 200
    assert _nombre_ep(db, t.h2) is None
    monkeypatch.setenv("CATALOGO_LECTURA", "canonico")
    assert _patch(app_client, admin_token, -t.p2.id, {"publicado_web": False}).status_code == 200
    db.expire_all()
    assert db.query(ProductWebListing).filter_by(sku_id=t.p2.id).one().publicado_web is False
    assert _patch(app_client, admin_token, t.h1, {"nombre": f"Zz-{t.s}-Otra"}).status_code == 200   # huérfano canónico, +id


def test_un_id_que_no_existe_da_404_sin_escribir(app_client, db, monkeypatch, admin_token, contador_sql):
    for rama, ids in (("legacy", (0, 2_000_000_000)), ("canonico", (0, 2_000_000_000, -2_000_000_000))):
        monkeypatch.setenv("CATALOGO_LECTURA", rama)
        for ident in ids:
            for metodo, extra in (("patch", {"json": {"nombre": "x"}}), ("delete", {})):
                with contador_sql.ventana() as v:
                    resp = getattr(app_client, metodo)(f"{CATALOGO}/{ident}", headers=_auth(admin_token), **extra)
                assert (resp.status_code, resp.json()) == (404, {"detail": "Producto no encontrado"}), (rama, ident, metodo)
                assert _escribe(v) == [], (rama, ident, metodo)


def test_la_url_vieja_de_una_fila_sku_ya_no_abre_otro_producto(app_client, db, warehouse, monkeypatch):
    """Review Focus 1."""
    monkeypatch.setenv("CATALOGO_LECTURA", "legacy")
    t = _Catalogo(db, warehouse)
    libres = [i for i in (t.p2.id, t.p2.product_id)                     # erp_test es compartida: el id puede estar ocupado
              if db.execute(text("SELECT 1 FROM ecommerce_products WHERE id = :i"), {"i": i}).first() is None]
    assert libres, "ningún id libre: la prueba no mira la URL vieja"
    for ident in libres:
        assert app_client.get(f"{CATALOGO}/{ident}").status_code == 404, ident     # antes: el Product con ese id o 404
    assert app_client.get(f"{CATALOGO}/{-t.p2.id}").json()["data"]["sku"] == t.p2.sku


# ─── P27: la tienda heredada ─────────────────────────────────────────────────────────────────────────────────────────

def test_con_sesion_un_sku_con_espejo_no_sale_como_fila_del_erp(app_client, db, warehouse, monkeypatch, admin_token):
    """P27 (1): con sesión, la rama heredada sin offset también descarta el SKU con CUALQUIER espejo (como el anónimo y como
    la rama paginada): la nevera solo sale como su espejo m1, nunca como la fila del ERP."""
    monkeypatch.setenv("CATALOGO_LECTURA", "legacy")
    t = _Catalogo(db, warehouse)
    db.execute(text("UPDATE ecommerce_products SET publicado_web = FALSE WHERE id = :i"), {"i": t.m1}); db.commit()
    for params, cuantas in (({}, 1), ({"publicado": "true", "limit": 50}, 0), ({"offset": 0}, 1)):
        filas = [x for x in _ok(app_client, CATALOGO, admin_token, search=t.s, **params)["data"] if x["sku"] == t.p1.sku]
        assert [x["id"] for x in filas] == [t.m1] * cuantas, (params, filas)


def test_un_sku_sin_espejo_respeta_la_categoria_y_la_publicacion(app_client, db, warehouse, monkeypatch, admin_token):
    """P27 (2): el auto (p2, Cat-C, sin espejo) ya no sale en todas las categorías ni con publicado=false."""
    monkeypatch.setenv("CATALOGO_LECTURA", "legacy")
    t = _Catalogo(db, warehouse)
    for token in (None, admin_token):
        for extra in ({}, {"offset": 0}, {"publicado": "true", "limit": 50}):
            de_a = _nombres(_ok(app_client, CATALOGO, token, search=t.s, categoria=f"Cat-A-{t.s}", **extra))
            de_c = _nombres(_ok(app_client, CATALOGO, token, search=t.s, categoria=f"Cat-C-{t.s}", **extra))
            assert t.nombres["auto"] not in de_a and t.nombres["auto"] in de_c, (token is not None, extra, de_a, de_c)
    for extra in ({}, {"offset": 0}):
        assert _nombres(_ok(app_client, CATALOGO, admin_token, search=t.s, publicado="false", **extra)) == [t.nombres["h2"]], extra
