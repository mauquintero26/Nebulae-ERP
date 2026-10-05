import uuid


def _headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


class TestProductsQuickCreate:
    """/crm/products/quick-create es usado por el boton 'crear producto nuevo'
    del autocompletar de producto (Solicitud de Cliente y el modal de Leads
    del CRM). Desde que la migracion de Catalogo Configurable volvio
    brand_id/category_id NOT NULL en `products`, este endpoint quedo roto:
    solo enviaba name/sale_price y la insercion fallaba con
    psycopg2.errors.NotNullViolation."""

    def test_quick_create_sin_marca_ni_categoria_no_falla(self, app_client, admin_token):
        name = f"Producto Quick {uuid.uuid4().hex[:6]}"
        r = app_client.post(
            "/api/v1/crm/products/quick-create",
            json={"name": name, "sale_price": 0},
            headers=_headers(admin_token),
        )
        assert r.status_code == 200, r.text
        assert r.json()["data"]["product_name"] == name

    def test_quick_create_marca_producto_como_necesita_revision(self, app_client, admin_token, db):
        from app.models.catalog import Product
        name = f"Producto Revision {uuid.uuid4().hex[:6]}"
        r = app_client.post(
            "/api/v1/crm/products/quick-create",
            json={"name": name, "sale_price": 0},
            headers=_headers(admin_token),
        )
        product_id = r.json()["data"]["product_id"]
        prod = db.query(Product).filter(Product.id == product_id).first()
        assert prod.necesita_revision is True
        assert prod.brand_id is not None
        assert prod.category_id is not None

    def test_quick_create_reutiliza_la_misma_marca_placeholder(self, app_client, admin_token, db):
        from app.models.catalog import Product
        r1 = app_client.post(
            "/api/v1/crm/products/quick-create",
            json={"name": f"Producto A {uuid.uuid4().hex[:6]}", "sale_price": 0},
            headers=_headers(admin_token),
        )
        r2 = app_client.post(
            "/api/v1/crm/products/quick-create",
            json={"name": f"Producto B {uuid.uuid4().hex[:6]}", "sale_price": 0},
            headers=_headers(admin_token),
        )
        prod1 = db.query(Product).filter(Product.id == r1.json()["data"]["product_id"]).first()
        prod2 = db.query(Product).filter(Product.id == r2.json()["data"]["product_id"]).first()
        assert prod1.brand_id == prod2.brand_id
        assert prod1.category_id == prod2.category_id

    # --- U7+U8+H12+H13 (Bloque 2, T5): codigo unico, reutilizar por nombre, 409 y textos en espanol ---------------

    def test_quick_create_dos_nombres_con_el_mismo_inicio_no_chocan(self, app_client, admin_token):
        """El codigo se recorta a 20 caracteres y ix_product_skus_sku es UNICO: el 2.o daba 400 sin avisar."""
        u = uuid.uuid4().hex[:6]
        r1 = app_client.post("/api/v1/crm/products/quick-create", json={"name": f"Pintura vinilo blanco galon {u}"},
                             headers=_headers(admin_token))
        r2 = app_client.post("/api/v1/crm/products/quick-create", json={"name": f"Pintura vinilo blanco cuarto {u}"},
                             headers=_headers(admin_token))
        assert r1.status_code == 200, r1.text
        assert r2.status_code == 200, r2.text
        d1, d2 = r1.json()["data"], r2.json()["data"]
        assert d1["product_id"] != d2["product_id"] and d1["sku"] != d2["sku"]
        assert d1["sku"].startswith("PINTURA-VINILO-BLANC") and d2["sku"].startswith("PINTURA-VINILO-BLANC")
        assert d1["creado"] is True and d2["creado"] is True
        assert d1["necesita_revision"] is True and d2["necesita_revision"] is True

    def test_quick_create_con_un_nombre_que_ya_existe_devuelve_ese_producto(self, app_client, admin_token, db):
        from sqlalchemy import func
        from app.models.catalog import Product
        u = uuid.uuid4().hex[:6]
        r1 = app_client.post("/api/v1/crm/products/quick-create", json={"name": f"Producto Repetido {u}"},
                             headers=_headers(admin_token))
        r2 = app_client.post("/api/v1/crm/products/quick-create", json={"name": f"  producto   repetido {u} "},
                             headers=_headers(admin_token))
        assert r1.status_code == 200, r1.text
        assert r2.status_code == 200, r2.text
        d1, d2 = r1.json()["data"], r2.json()["data"]
        assert d1["creado"] is True and d2["creado"] is False
        assert (d2["product_id"], d2["id"]) == (d1["product_id"], d1["id"])
        assert d2["product_name"] == f"Producto Repetido {u}"
        assert db.query(Product).filter(func.lower(Product.name) == f"producto repetido {u}").count() == 1

    def test_quick_create_con_codigo_explicito_repetido_responde_409(self, app_client, admin_token):
        u = uuid.uuid4().hex[:6]
        r1 = app_client.post("/api/v1/crm/products/quick-create", json={"name": f"Producto Uno {u}", "sku": f"QC-{u}"},
                             headers=_headers(admin_token))
        assert r1.status_code == 200, r1.text
        assert r1.json()["data"]["sku"] == f"QC-{u}"
        r2 = app_client.post("/api/v1/crm/products/quick-create", json={"name": f"Producto Dos {u}", "sku": f"QC-{u}"},
                             headers=_headers(admin_token))
        assert r2.status_code == 409, r2.text
        assert "Ya existe un producto con el código" in r2.json()["detail"]

    def test_quick_create_sin_nombre_explica_en_espanol(self, app_client, admin_token):
        for body in ({"name": "  "}, {"name": None}, {}):
            r = app_client.post("/api/v1/crm/products/quick-create", json=body, headers=_headers(admin_token))
            assert r.status_code == 400, (body, r.text)
            assert r.json()["detail"] == "Escribe el nombre del producto.", body

    # --- Ronda 1 de T5 (punto 2): sin SQL en la respuesta; precios y codigo validados antes -------------------------

    def test_quick_create_valida_precios_y_codigo_antes_de_tocar_la_base(self, app_client, admin_token, db):
        from app.models.catalog import Product
        u = uuid.uuid4().hex[:6]
        casos = [
            ({"sale_price": "abc"}, "El precio debe ser un número entre 0 y 99.999.999."),
            ({"sale_price": 10 ** 10}, "El precio debe ser un número entre 0 y 99.999.999."),
            ({"sale_price": -1}, "El precio debe ser un número entre 0 y 99.999.999."),
            ({"cost_price": "x"}, "El precio debe ser un número entre 0 y 99.999.999."),
            ({"sale_price": True}, "El precio debe ser un número entre 0 y 99.999.999."),
            ({"sku": "Q" * 51}, "El código del producto debe ser un texto de máximo 50 caracteres."),
            ({"sku": 123}, "El código del producto debe ser un texto de máximo 50 caracteres."),
        ]
        for extra, texto in casos:
            r = app_client.post("/api/v1/crm/products/quick-create", json={"name": f"Producto Precio {u}", **extra},
                                headers=_headers(admin_token))
            assert r.status_code == 422, (extra, r.text)
            assert r.json()["detail"] == texto, extra
        assert db.query(Product).filter(Product.name == f"Producto Precio {u}").count() == 0
        # En el limite si se acepta (el codigo lleva uuid: ix_product_skus_sku es unico y erp_test no se trunca).
        codigo_50 = u + "Q" * (50 - len(u))
        r = app_client.post("/api/v1/crm/products/quick-create",
                            json={"name": f"Producto Precio {u}", "sale_price": 99999999, "cost_price": "0",
                                  "sku": f" {codigo_50} "}, headers=_headers(admin_token))
        assert r.status_code == 200, r.text
        assert r.json()["data"]["sale_price"] == 99999999 and r.json()["data"]["sku"] == codigo_50

    def test_quick_create_un_error_inesperado_no_devuelve_el_sql(self, app_client, admin_token, monkeypatch):
        import app.api.v1.crm as m_crm
        from sqlalchemy.exc import DataError

        def _falla(db):
            raise DataError("INSERT INTO products (name) VALUES (%(name)s)", {"name": "secreto"},
                            Exception("psycopg2.errors.NumericValueOutOfRange: SQL secreto"))

        monkeypatch.setattr(m_crm.logger, "disabled", True)
        monkeypatch.setattr(m_crm, "_get_or_create_placeholder_brand_category", _falla)
        r = app_client.post("/api/v1/crm/products/quick-create", json={"name": f"Producto Falla {uuid.uuid4().hex[:6]}"},
                            headers=_headers(admin_token))
        assert r.status_code == 400, r.text
        assert r.json()["detail"] == "No se pudo crear el producto. Revisa los datos e intenta de nuevo."
        for prohibido in ("INSERT", "SQL", "psycopg2", "secreto"):
            assert prohibido not in r.text

    def test_quick_create_una_carrera_por_el_codigo_responde_409(self, app_client, admin_token, monkeypatch):
        import app.api.v1.crm as m_crm
        from sqlalchemy.exc import IntegrityError

        def _carrera(db):
            raise IntegrityError("INSERT INTO product_skus ...", {}, Exception("duplicate key ix_product_skus_sku"))

        monkeypatch.setattr(m_crm, "_get_or_create_placeholder_brand_category", _carrera)
        r = app_client.post("/api/v1/crm/products/quick-create", json={"name": f"Producto Carrera {uuid.uuid4().hex[:6]}"},
                            headers=_headers(admin_token))
        assert r.status_code == 409, r.text
        assert r.json()["detail"] == "Otro producto con el mismo código se creó al mismo tiempo. Intenta de nuevo."
        assert "INSERT" not in r.text

    def test_quick_create_un_producto_existente_sin_sku_recibe_uno(self, app_client, admin_token, db, brand, category):
        from app.models.catalog import Product, ProductSKU
        u = uuid.uuid4().hex[:6]
        p = Product(brand_id=brand.id, category_id=category.id, name=f"Sin Codigo {u}", type="Fisico",
                    base_currency="COP", uom="unidad", is_active=True)
        db.add(p); db.commit(); db.refresh(p)
        r = app_client.post("/api/v1/crm/products/quick-create", json={"name": f"sin  codigo {u}"},
                            headers=_headers(admin_token))
        assert r.status_code == 200, r.text
        d = r.json()["data"]
        assert d["product_id"] == p.id and d["creado"] is False and d["necesita_revision"] is False
        assert d["sku"].startswith(f"SIN-CODIGO-{u.upper()}"[:20])
        skus = db.query(ProductSKU).filter(ProductSKU.product_id == p.id).all()
        assert [s.id for s in skus] == [d["id"]]
