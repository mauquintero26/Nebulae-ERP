import datetime
import pytest
from sqlalchemy import text
from scripts.migrate_legacy_catalog import run_migration
from app.models.catalog import Product, Category, Brand


def _crear_producto_legacy(db, nombre, categoria, sub_categoria, marca, precio, stock, variantes):
    db.execute(text("""
        INSERT INTO ecommerce_products
            (nombre, sku, precio_venta, categoria, sub_categoria, marca, stock_disponible, variantes, created_at, updated_at)
        VALUES (:nombre, :sku, :precio, :categoria, :sub_categoria, :marca, :stock, CAST(:variantes AS jsonb), :now, :now)
    """), {
        "nombre": nombre, "sku": f"LEG-{nombre[:10]}", "precio": precio, "categoria": categoria,
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
