"""B4 T24 (B21): tres listas que hacían consultas por fila (N+1, de antes del bloque) ahora hacen un número fijo:
- GET /inventory/operations: los movimientos de cada operación (selectinload);
- GET /products: la marca, la categoría, los SKU y sus atributos de cada producto (selectinload);
- GET /compras/recepciones: el PEC de cada recepción en _gr_dict (los PEC de la página se cargan una vez y, desde r1
  m22, _gr_dict los recibe en un dict {pec_id: pec}).
Cada prueba compara las consultas de una página de 3 filas con las de una de 30: deben ser las mismas.

Se corre SOLO con el runner de ROLLBACK (python tests/rollback_runner.py test_consultas_fijas_listas).
"""
import uuid
from datetime import datetime

from app.models.catalog import Attribute, AttributeValue, Brand, Category, Product, ProductSKU
from app.models.erp_documents import GoodsReceipt, PurchaseOrderFull
from app.models.inventory import InventoryMovement, InventoryOperation


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _consultas(app_client, token, contador_sql, ruta, **params):
    with contador_sql.ventana() as v:
        resp = app_client.get(ruta, params=params, headers=_auth(token))
    assert resp.status_code == 200, (ruta, params, resp.text)
    return v.consultas, resp.json()["data"]


def test_operaciones_con_consultas_fijas(app_client, db, admin_token, warehouse, sku, contador_sql):
    s = uuid.uuid4().hex[:8]
    for grupo, n in (("tres", 3), ("treinta", 30)):
        for _ in range(n):
            op = InventoryOperation(operation_type="ADJUSTMENT", status="DONE", notas=f"{grupo}-{s}")
            db.add(op)
            db.flush()
            db.add_all([InventoryMovement(operation_id=op.id, sku_id=sku.id, quantity=1, direction=d,
                                          warehouse_id=warehouse.id, created_at=datetime(2001, 1, 2, 12), owner="NEBULAE")
                        for d in ("ADJUST_IN", "ADJUST_OUT")])
    db.commit()
    c3, d3 = _consultas(app_client, admin_token, contador_sql, "/api/v1/inventory/operations", q=f"tres-{s}")
    c30, d30 = _consultas(app_client, admin_token, contador_sql, "/api/v1/inventory/operations", q=f"treinta-{s}")
    assert (len(d3), len(d30)) == (3, 30)
    assert all(len(o["movements"]) == 2 for o in d3 + d30)
    assert c3 == c30, (c3, c30)


def test_productos_con_consultas_fijas(app_client, db, admin_token, contador_sql):
    """B4 T24 r1 (m18): cada producto con su propia marca y su propia categoría (y su propio atributo): con una sola
    compartida, la carga perezosa many-to-one sale del mapa de identidad después de la primera y el conteo no veía que
    faltara selectinload(Product.brand) o selectinload(Product.category)."""
    s = uuid.uuid4().hex[:8]
    for grupo, n in (("tres", 3), ("treinta", 30)):
        for i in range(n):
            marca, categoria = Brand(name=f"Marca-{grupo}-{s}-{i}"), Category(name=f"Cat-{grupo}-{s}-{i}")
            atributo = Attribute(name=f"Color-{grupo}-{s}-{i}")
            db.add_all([marca, categoria, atributo])
            db.flush()
            p = Product(brand_id=marca.id, category_id=categoria.id, name=f"{grupo}-{s}-{i}", type="Fisico",
                        base_currency="USD", uom="Ud")
            db.add(p)
            db.flush()
            k = ProductSKU(product_id=p.id, sku=f"{grupo}-{s}-{i}", cost_price=1, sale_price=2)
            k.attribute_values.append(AttributeValue(attribute_id=atributo.id, value=f"v{i}"))
            db.add(k)
    db.commit()
    c3, d3 = _consultas(app_client, admin_token, contador_sql, "/api/v1/products", q=f"tres-{s}")
    c30, d30 = _consultas(app_client, admin_token, contador_sql, "/api/v1/products", q=f"treinta-{s}")
    assert (len(d3), len(d30)) == (3, 30)
    assert all(len(p["skus"]) == 1 and len(p["skus"][0]["attribute_values"]) == 1 for p in d3 + d30)
    assert len({p["brand_id"] for p in d30}) == len({p["category_id"] for p in d30}) == 30
    assert c3 == c30, (c3, c30)


def test_recepciones_con_consultas_fijas(app_client, db, admin_token, contador_sql):
    s = uuid.uuid4().hex[:4].upper()   # numero es VARCHAR(20): ENINV-TREINTA + 4 + 2 = 19
    for grupo, n in (("TRES", 3), ("TREINTA", 30)):
        for i in range(n):
            pec = PurchaseOrderFull(numero=f"PEC-{grupo}{s}{i:02d}", estado="EMITIDO", supplier_name=f"P {s}",
                                    fecha_entrega_estimada=datetime(2026, 11, 1))
            db.add(pec)
            db.flush()
            db.add(GoodsReceipt(numero=f"ENINV-{grupo}{s}{i:02d}", pec_id=pec.id, pec_numero=pec.numero,
                                estado="COMPLETADA", fecha_recepcion=datetime(2026, 11, 5, 15, 0), productos=[]))
    db.commit()
    db.expire_all()   # que nada quede en el mapa de identidad de la sesión de la prueba
    c3, d3 = _consultas(app_client, admin_token, contador_sql, "/api/v1/compras/recepciones", q=f"TRES{s}",
                        vista="todas")
    c30, d30 = _consultas(app_client, admin_token, contador_sql, "/api/v1/compras/recepciones", q=f"TREINTA{s}",
                          vista="todas", limit=50)
    assert (len(d3), len(d30)) == (3, 30)
    assert all(r["dias_retraso"] == 3 for r in d3 + d30)   # 5 nov − (1 nov + 1 de tolerancia)
    assert c3 == c30, (c3, c30)
