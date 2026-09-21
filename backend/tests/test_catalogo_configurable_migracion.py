import datetime
import pytest
from sqlalchemy import text
from scripts.migrate_legacy_catalog import run_migration
from app.models.catalog import Product, Category, Brand


def _crear_producto_legacy(db, nombre, categoria, sub_categoria, marca, precio, stock, variantes, sku=None):
    db.execute(text("""
        INSERT INTO ecommerce_products
            (nombre, sku, precio_venta, categoria, sub_categoria, marca, stock_disponible, variantes, created_at, updated_at)
        VALUES (:nombre, :sku, :precio, :categoria, :sub_categoria, :marca, :stock, CAST(:variantes AS jsonb), :now, :now)
    """), {
        "nombre": nombre, "sku": sku or f"LEG-{nombre[:10]}", "precio": precio, "categoria": categoria,
        "sub_categoria": sub_categoria, "marca": marca, "stock": stock, "variantes": variantes,
        "now": datetime.datetime.utcnow(),
    })
    db.commit()


class TestMigracionCatalogoLegacy:

    def test_producto_simple_sin_variantes_migra_completo(self, db):
        _crear_producto_legacy(db, "Termo Basico", "Hogar", None, "GenericaHogar", 45000, 10, "[]")
        stats = run_migration(db)
        assert stats["migrados"] >= 1
        prod = db.query(Product).filter(Product.name == "Termo Basico").first()
        assert prod is not None
        assert prod.necesita_revision is False
        assert prod.category.name.lower() == "hogar"
        assert prod.skus[0].sale_price == 45000

    def test_producto_con_variantes_queda_marcado_para_revision(self, db):
        _crear_producto_legacy(db, "Camiseta Variada", "Ropa", "Camisetas", "MarcaTest", 30000, 5,
                                '[{"talla":"M","color":"Rojo"}]')
        run_migration(db)
        prod = db.query(Product).filter(Product.name == "Camiseta Variada").first()
        assert prod.necesita_revision is True

    def test_categoria_y_subcategoria_quedan_jerarquicas(self, db):
        _crear_producto_legacy(db, "Bota Cuero", "Calzado", "Botas", "MarcaTest", 90000, 3, "[]")
        run_migration(db)
        prod = db.query(Product).filter(Product.name == "Bota Cuero").first()
        assert prod.category.name.lower() == "botas"
        assert prod.category.parent is not None
        assert prod.category.parent.name.lower() == "calzado"

    def test_categoria_con_distintas_mayusculas_no_duplica(self, db):
        _crear_producto_legacy(db, "Producto A", "Electronica", None, "MarcaX", 10000, 1, "[]")
        _crear_producto_legacy(db, "Producto B", "electronica", None, "MarcaX", 20000, 1, "[]")
        run_migration(db)
        categorias = db.query(Category).filter(Category.name.ilike("electronica")).all()
        assert len(categorias) == 1

    def test_reejecutar_migracion_no_duplica(self, db):
        _crear_producto_legacy(db, "Producto Idempotente", "Deportes", None, "MarcaY", 15000, 2, "[]")
        run_migration(db)
        total_antes = db.query(Product).filter(Product.name == "Producto Idempotente").count()
        run_migration(db)
        total_despues = db.query(Product).filter(Product.name == "Producto Idempotente").count()
        assert total_antes == 1
        assert total_despues == 1

    def test_subcategoria_con_mismo_nombre_bajo_categorias_distintas_queda_para_revision(self, db):
        # Dos filas legacy usan el mismo nombre de sub_categoria ("Accesorios Playa")
        # pero cuelgan de categorias padre distintas. La segunda no debe heredar
        # la categoria "Accesorios Playa" creada por la primera (perteneceria a
        # la jerarquia equivocada) ni duplicar el nombre (Category.name es unico).
        _crear_producto_legacy(db, "Tabla de Surf", "Deportes Acuaticos", "Accesorios Playa", "MarcaQ", 80000, 2, "[]")
        _crear_producto_legacy(db, "Guantes de Nieve", "Deportes Invierno", "Accesorios Playa", "MarcaQ", 40000, 2, "[]")
        run_migration(db)

        prod1 = db.query(Product).filter(Product.name == "Tabla de Surf").first()
        prod2 = db.query(Product).filter(Product.name == "Guantes de Nieve").first()
        assert prod1 is not None and prod2 is not None

        # La primera fila resuelve normalmente: sin ambiguedad todavia.
        assert prod1.necesita_revision is False
        assert prod1.category.name.lower() == "accesorios playa"
        assert prod1.category.parent.name.lower() == "deportes acuaticos"

        # La segunda choca con el nombre ya usado bajo un padre distinto:
        # no se le asigna esa categoria y queda marcada para revision humana.
        assert prod2.necesita_revision is True
        assert prod2.category_id != prod1.category_id

    def test_sku_duplicado_no_aborta_migracion_completa(self, db):
        # ecommerce_products.sku nunca fue unico en el legacy; dos filas pueden
        # compartir el mismo valor. product_skus.sku si es unico, asi que la
        # segunda fila debe fallar sin tumbar el trabajo ya confirmado de la primera.
        _crear_producto_legacy(db, "Producto Sku Uno", "Varios Test", None, "MarcaZ", 5000, 1, "[]",
                                sku="DUP-SKU-TEST-01")
        _crear_producto_legacy(db, "Producto Sku Dos", "Varios Test", None, "MarcaZ", 6000, 1, "[]",
                                sku="DUP-SKU-TEST-01")
        id_dos = db.execute(
            text("SELECT id FROM ecommerce_products WHERE nombre = :n"), {"n": "Producto Sku Dos"}
        ).scalar()

        stats = run_migration(db)

        prod1 = db.query(Product).filter(Product.name == "Producto Sku Uno").first()
        prod2 = db.query(Product).filter(Product.name == "Producto Sku Dos").first()
        assert prod1 is not None
        assert prod2 is None

        errores_ids = [e["legacy_id"] for e in stats["errores"]]
        assert id_dos in errores_ids

    def test_filtro_necesita_revision_en_listado(self, app_client, admin_token):
        r = app_client.get("/api/v1/products?necesita_revision=true",
                            headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        for p in r.json()["data"]:
            assert p["necesita_revision"] is True
