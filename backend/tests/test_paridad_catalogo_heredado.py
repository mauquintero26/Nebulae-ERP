"""B4 T20 r3 (I4): la rama heredada del catalogo SIN offset ni orden (la llamada de la tienda publica) contra una COPIA LITERAL
de la logica de BASE (6690b12, list_catalogo rama heredada), ejecutada sobre la misma base y en la misma transaccion.

BASE no pide ORDER BY en los SKU del ERP: el orden lo da PostgreSQL. Esta prueba NO fija ese orden: compara contra BASE tal
cual. La unica diferencia permitida es la del ruling de r1: a BASE se le quita cada SKU del ERP cuyo espejo en
ecommerce_products pasa los filtros pero quedo fuera del LIMIT de ecommerce_products. Despues de crear los datos se
actualiza un SKU (su fila fisica pasa al final), para que el orden fisico deje de coincidir con el orden por id.

Se corre SOLO con el runner de ROLLBACK (python tests/rollback_runner.py test_paridad_catalogo_heredado).
"""
from sqlalchemy import text

from app.api.v1.ecommerce import _get_real_sellable_stock
from app.models.catalog import Product, ProductSKU
from tests.test_listas_varias_paginadas import CATALOGO, _Catalogo, _ok


def _base_heredado(db, search, categoria, publicado, limit):
    # ---- copia literal de BASE 6690b12 (rama heredada de list_catalogo) ----
    where_clauses = []
    params: dict = {"limit": limit}
    if search:
        where_clauses.append("(nombre ILIKE :s OR sku ILIKE :s OR descripcion ILIKE :s)")
        params["s"] = f"%{search}%"
    if categoria:
        where_clauses.append("categoria ILIKE :c")
        params["c"] = f"%{categoria}%"
    if publicado is not None:
        where_clauses.append("publicado_web = :pub")
        params["pub"] = publicado
    where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""
    rows = db.execute(text(f"SELECT id, nombre, descripcion, sku, precio_venta, precio_comparacion, descuento_pct, impuesto_pct, categoria, sub_categoria, marca, tipo_producto, imagenes, atributos, variantes, stock_disponible, alerta_stock_minimo, publicado_web, rastrear_inventario, seo_titulo, created_at, updated_at FROM ecommerce_products {where_sql} ORDER BY nombre LIMIT :limit"), params).fetchall()
    total = int(db.execute(text(f"SELECT COUNT(*) FROM ecommerce_products {where_sql}"), {k: v for k, v in params.items() if k != "limit"}).scalar() or 0)
    data = []
    seen_skus = set()
    for r in rows:
        sku_code = r[3]
        stock_disp = float(r[15] or 0)
        if sku_code:
            seen_skus.add(sku_code)
            sku_record = db.query(ProductSKU).filter(ProductSKU.sku == sku_code).first()
            if sku_record:
                real_stock = _get_real_sellable_stock(db, sku_record.id, owner="NEBULAE")
                stock_disp = float(real_stock)
        modalidad = "ENTREGA_INMEDIATA" if stock_disp > 0 else "POR_PEDIDO"
        is_low = stock_disp <= (r[16] or 5)
        data.append({
            "id": r[0], "nombre": r[1], "descripcion": r[2], "sku": r[3], "precio_venta": float(r[4] or 0),
            "precio_comparacion": float(r[5] or 0), "descuento_pct": float(r[6] or 0), "impuesto_pct": float(r[7] or 0),
            "categoria": r[8], "sub_categoria": r[9], "marca": r[10], "tipo_producto": r[11], "imagenes": r[12] or [],
            "atributos": r[13] or [], "variantes": r[14] or [], "stock_disponible": stock_disp,
            "modalidad_disponible": modalidad, "alerta_stock_minimo": r[16] or 5, "publicado_web": r[17],
            "rastrear_inventario": r[18], "seo_titulo": r[19],
            "created_at": r[20].isoformat() if r[20] else None, "updated_at": r[21].isoformat() if r[21] else None,
            "is_low_stock": is_low,
        })
    n_ep = len(data)
    sku_q = db.query(ProductSKU).join(Product, ProductSKU.product_id == Product.id)
    if search:
        like = f"%{search}%"
        sku_q = sku_q.filter(ProductSKU.sku.ilike(like) | Product.name.ilike(like))
    for canon_sku in sku_q.limit(limit).all():
        if canon_sku.sku not in seen_skus:
            prod = canon_sku.product
            real_stock = float(_get_real_sellable_stock(db, canon_sku.id, owner="NEBULAE"))
            modalidad = "ENTREGA_INMEDIATA" if real_stock > 0 else "POR_PEDIDO"
            data.append({
                "id": canon_sku.id, "nombre": prod.name if prod else canon_sku.sku,
                "descripcion": getattr(prod, "description", "") or "", "sku": canon_sku.sku,
                "precio_venta": float(canon_sku.sale_price or 0), "precio_comparacion": float(canon_sku.sale_price or 0),
                "descuento_pct": 0.0, "impuesto_pct": 0.0,
                "categoria": getattr(getattr(prod, "category", None), "name", "") if prod else "",
                "sub_categoria": "", "marca": getattr(getattr(prod, "brand", None), "name", "") if prod else "",
                "tipo_producto": "Fisico", "imagenes": [], "atributos": [], "variantes": [],
                "stock_disponible": real_stock, "modalidad_disponible": modalidad, "alerta_stock_minimo": 5,
                "publicado_web": True, "rastrear_inventario": True, "seo_titulo": prod.name if prod else canon_sku.sku,
                "created_at": canon_sku.created_at.isoformat() if hasattr(canon_sku, "created_at") and canon_sku.created_at else None,
                "updated_at": canon_sku.updated_at.isoformat() if hasattr(canon_sku, "updated_at") and canon_sku.updated_at else None,
                "is_low_stock": real_stock <= 5,
            })
            seen_skus.add(canon_sku.sku)
            total += 1
    return {"status": "success", "total": total, "data": data}, n_ep


def _espejo_pasa(db, sku, search, categoria, publicado):
    donde, params = ["sku = :sku"], {"sku": sku}
    if search:
        donde.append("(nombre ILIKE :s OR sku ILIKE :s OR descripcion ILIKE :s)")
        params["s"] = f"%{search}%"
    if categoria:
        donde.append("categoria ILIKE :c")
        params["c"] = f"%{categoria}%"
    if publicado is not None:
        donde.append("publicado_web = :pub")
        params["pub"] = publicado
    return bool(db.execute(text(f"SELECT 1 FROM ecommerce_products WHERE {' AND '.join(donde)} LIMIT 1"), params).first())


def _base_con_ruling(db, search, categoria, publicado, limit):
    """BASE menos los SKU del ERP cuyo espejo pasa los filtros (la unica diferencia que manda el ruling de r1)."""
    base, n_ep = _base_heredado(db, search, categoria, publicado, limit)
    quitar = [x for x in base["data"][n_ep:] if _espejo_pasa(db, x["sku"], search, categoria, publicado)]
    data = base["data"][:n_ep] + [x for x in base["data"][n_ep:] if x not in quitar]
    return {"status": "success", "total": base["total"] - len(quitar), "data": data}


def _desordenar(db, t):
    """Pasa al final del heap el SKU de menor id: el orden fisico (el de BASE, sin ORDER BY) deja de ser el orden por id."""
    db.execute(text("UPDATE product_skus SET cost_price = cost_price + 0 WHERE id = :i"), {"i": t.p1.id})
    db.execute(text("UPDATE product_skus SET cost_price = cost_price + 0 WHERE id = :i"), {"i": t.p2.id})
    db.execute(text("UPDATE product_skus SET cost_price = cost_price + 0 WHERE id = :i"), {"i": t.p1.id})
    db.commit()


def test_la_tienda_es_igual_a_base_en_orden_exacto(app_client, db, warehouse, monkeypatch):
    """publicado=true&limit=50 (store/catalogo y store/categoria) y limit=3, antes y despues de desordenar el heap."""
    monkeypatch.setenv("CATALOGO_LECTURA", "legacy")
    t = _Catalogo(db, warehouse)
    for fase in ("heap en orden", "heap desordenado"):
        if fase == "heap desordenado":
            _desordenar(db, t)
        for params in ({"publicado": "true", "limit": 50}, {"publicado": "true", "limit": 3}, {"limit": 3}, {"limit": 500}):
            nuevo = _ok(app_client, CATALOGO, **params)
            esperado = _base_con_ruling(db, None, None, True if params.get("publicado") else None, params["limit"])
            assert nuevo == esperado, (fase, params, nuevo["total"], esperado["total"],
                                       [(x["id"], x["sku"]) for x in nuevo["data"]][:8],
                                       [(x["id"], x["sku"]) for x in esperado["data"]][:8])


def test_toda_diferencia_con_base_es_la_del_ruling(app_client, db, warehouse, monkeypatch):
    """Con y sin busqueda, categorias, publicado y limits: lo nuevo es EXACTAMENTE BASE menos los SKU del ERP cuyo espejo
    pasa los filtros. Con el heap desordenado."""
    monkeypatch.setenv("CATALOGO_LECTURA", "legacy")
    t = _Catalogo(db, warehouse)
    _desordenar(db, t)
    n, inexplicadas = 0, []
    for search in (t.s, None):
        for categoria in (None, f"Cat-A-{t.s}", f"Cat-B-{t.s}", "cat-b"):
            for publicado in (None, True, False):
                for limit in (None, 0, 1, 2, 3, 50, 500):
                    params = {}
                    if search is not None:
                        params["search"] = search
                    if categoria is not None:
                        params["categoria"] = categoria
                    if publicado is not None:
                        params["publicado"] = "true" if publicado else "false"
                    if limit is not None:
                        params["limit"] = limit
                    nuevo = _ok(app_client, CATALOGO, **params)
                    esperado = _base_con_ruling(db, search, categoria, publicado, 100 if limit is None else limit)
                    n += 1
                    if nuevo != esperado:
                        inexplicadas.append((params, nuevo["total"], esperado["total"]))
    assert n == 168
    assert not inexplicadas, inexplicadas[:10]
