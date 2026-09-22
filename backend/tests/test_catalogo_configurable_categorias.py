import uuid
import pytest


def _headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


def _crear_categoria(client, admin_token, name, parent_id=None):
    body = {"name": name}
    if parent_id is not None:
        body["parent_id"] = parent_id
    return client.post("/api/v1/categories", json=body, headers=_headers(admin_token))


class TestCategoriasJerarquia:

    def test_crear_categoria_de_primer_nivel(self, app_client, admin_token):
        r = _crear_categoria(app_client, admin_token, f"Ropa-{uuid.uuid4().hex[:6]}")
        assert r.status_code == 201
        assert r.json()["data"]["parent_id"] is None

    def test_crear_subcategoria_con_padre(self, app_client, admin_token):
        padre = _crear_categoria(app_client, admin_token, f"Calzado-{uuid.uuid4().hex[:6]}").json()["data"]
        hija = _crear_categoria(app_client, admin_token, f"Botas-{uuid.uuid4().hex[:6]}", parent_id=padre["id"])
        assert hija.status_code == 201
        assert hija.json()["data"]["parent_id"] == padre["id"]

    def test_editar_categoria_cambia_nombre_y_padre(self, app_client, admin_token):
        a = _crear_categoria(app_client, admin_token, f"Electronica-{uuid.uuid4().hex[:6]}").json()["data"]
        b = _crear_categoria(app_client, admin_token, f"Celulares-{uuid.uuid4().hex[:6]}").json()["data"]
        r = app_client.put(f"/api/v1/categories/{b['id']}", json={"parent_id": a["id"]}, headers=_headers(admin_token))
        assert r.status_code == 200
        assert r.json()["data"]["parent_id"] == a["id"]

    def test_no_permite_categoria_como_su_propio_padre(self, app_client, admin_token):
        a = _crear_categoria(app_client, admin_token, f"Hogar-{uuid.uuid4().hex[:6]}").json()["data"]
        r = app_client.put(f"/api/v1/categories/{a['id']}", json={"parent_id": a["id"]}, headers=_headers(admin_token))
        assert r.status_code == 400

    def test_no_permite_ciclo_de_dos_niveles(self, app_client, admin_token):
        a = _crear_categoria(app_client, admin_token, f"Deportes-{uuid.uuid4().hex[:6]}").json()["data"]
        b = _crear_categoria(app_client, admin_token, f"Ciclismo-{uuid.uuid4().hex[:6]}", parent_id=a["id"]).json()["data"]
        r = app_client.put(f"/api/v1/categories/{a['id']}", json={"parent_id": b["id"]}, headers=_headers(admin_token))
        assert r.status_code == 400

    def test_no_borra_categoria_con_subcategorias(self, app_client, admin_token):
        a = _crear_categoria(app_client, admin_token, f"Muebles-{uuid.uuid4().hex[:6]}").json()["data"]
        _crear_categoria(app_client, admin_token, f"Sillas-{uuid.uuid4().hex[:6]}", parent_id=a["id"])
        r = app_client.delete(f"/api/v1/categories/{a['id']}", headers=_headers(admin_token))
        assert r.status_code == 409

    def test_no_borra_categoria_con_productos(self, app_client, admin_token, brand):
        cat = _crear_categoria(app_client, admin_token, f"Juguetes-{uuid.uuid4().hex[:6]}").json()["data"]
        r = app_client.post("/api/v1/products", json={
            "brand_id": brand.id, "category_id": cat["id"], "name": "Producto Test",
            "type": "Fisico", "base_currency": "COP",
        }, headers=_headers(admin_token))
        assert r.status_code == 201
        r = app_client.delete(f"/api/v1/categories/{cat['id']}", headers=_headers(admin_token))
        assert r.status_code == 409

    def test_borra_categoria_vacia_sin_problema(self, app_client, admin_token):
        a = _crear_categoria(app_client, admin_token, f"CategoriaVacia-{uuid.uuid4().hex[:6]}").json()["data"]
        r = app_client.delete(f"/api/v1/categories/{a['id']}", headers=_headers(admin_token))
        assert r.status_code == 200

    def test_editar_categoria_puede_quitar_el_padre(self, app_client, admin_token):
        """Test that PUT with explicit null parent_id promotes subcategory to top-level."""
        padre = _crear_categoria(app_client, admin_token, f"Padre-{uuid.uuid4().hex[:6]}").json()["data"]
        hijo = _crear_categoria(app_client, admin_token, f"Hijo-{uuid.uuid4().hex[:6]}", parent_id=padre["id"]).json()["data"]
        assert hijo["parent_id"] == padre["id"]
        # Promote back to top-level by explicitly setting parent_id to null
        r = app_client.put(f"/api/v1/categories/{hijo['id']}", json={"parent_id": None}, headers=_headers(admin_token))
        assert r.status_code == 200
        assert r.json()["data"]["parent_id"] is None

    def test_crear_categoria_con_parent_id_inexistente_falla(self, app_client, admin_token):
        """Test that POST with non-existent parent_id returns 400."""
        r = _crear_categoria(app_client, admin_token, f"Huerfana-{uuid.uuid4().hex[:6]}", parent_id=99999)
        assert r.status_code == 400
        assert "padre" in r.json()["detail"].lower()
