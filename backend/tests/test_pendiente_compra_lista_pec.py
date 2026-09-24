import uuid


def _headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


def _make_sale_order(db, estado="PENDIENTE_COMPRA"):
    from app.models.erp_documents import SaleOrder
    v = SaleOrder(
        numero=f"PVEN-TEST-{uuid.uuid4().hex[:8].upper()}",
        customer_name="Cliente Test",
        estado=estado,
        total_cop=100000, anticipo_cop=20000, saldo_cop=80000,
        productos=[{"product_name": "Producto Test", "qty": 3, "unit_price_cop": 100000, "total_cop": 100000}],
    )
    db.add(v); db.commit(); db.refresh(v)
    return v


class TestAgregarListaComprasRegistraActividad:
    """Bug reportado: 'Agregar a Lista de Compras' no dejaba ningun rastro --
    ni en la actividad del pedido, ni forma de saber despues que esa fue la
    via elegida."""

    def test_post_lista_compras_crea_actividad_en_el_pven(self, app_client, admin_token, db):
        ven = _make_sale_order(db)
        r = app_client.post(
            "/api/v1/compras/lista-compras",
            json={"pven_id": ven.id, "pven_numero": ven.numero,
                  "productos": [{"producto_nombre": "Producto Test", "qty": 3}]},
            headers=_headers(admin_token),
        )
        assert r.status_code == 201, r.text
        item_id = r.json()["data"][0]["id"]
        try:
            detail = app_client.get(f"/api/v1/ventas/pedidos/{ven.id}", headers=_headers(admin_token))
            assert detail.status_code == 200, detail.text
            data = detail.json()["data"]
            acciones = [a["action"] for a in data["actividades"]]
            assert "SENT_TO_LISTA_COMPRAS" in acciones, (
                "Debe quedar una actividad registrada al enviar el pedido a Lista de Compras"
            )
        finally:
            app_client.delete(f"/api/v1/compras/lista-compras/{item_id}", headers=_headers(admin_token))

    def test_get_pedido_expone_lista_compras_items_del_pven(self, app_client, admin_token, db):
        ven = _make_sale_order(db)
        r = app_client.post(
            "/api/v1/compras/lista-compras",
            json={"pven_id": ven.id, "pven_numero": ven.numero,
                  "productos": [{"producto_nombre": "Producto Test", "qty": 3}]},
            headers=_headers(admin_token),
        )
        item_id = r.json()["data"][0]["id"]
        try:
            detail = app_client.get(f"/api/v1/ventas/pedidos/{ven.id}", headers=_headers(admin_token))
            items = detail.json()["data"]["lista_compras_items"]
            # web_builder_config (donde vive Lista de Compras) no se trunca entre
            # corridas de pytest, y sale_orders reinicia sus ids -- por eso se
            # busca el item propio por id en vez de asumir que la lista esta vacia.
            mine = next((it for it in items if it["id"] == item_id), None)
            assert mine is not None, "El item recien creado debe aparecer en lista_compras_items del PVEN"
            assert mine["producto"] == "Producto Test"
        finally:
            app_client.delete(f"/api/v1/compras/lista-compras/{item_id}", headers=_headers(admin_token))

    def test_lista_compras_items_vacio_si_no_se_envio_a_lista(self, app_client, admin_token, db):
        ven = _make_sale_order(db)
        detail = app_client.get(f"/api/v1/ventas/pedidos/{ven.id}", headers=_headers(admin_token))
        assert detail.json()["data"]["lista_compras_items"] == []


class TestCancelarPecDesvinculaPvenYLista:
    """Requisito del usuario: la decision 'Pendiente de Compra' debe poder
    deshacerse SOLO si se cancela el PEC directo, o se elimina de la Lista
    de Compras -- este cubre el caso de cancelar el PEC."""

    def test_cancelar_pec_libera_el_pven_vinculado(self, app_client, admin_token, db, supplier):
        ven = _make_sale_order(db)
        pec_r = app_client.post(
            "/api/v1/compras/pedidos",
            json={"supplier_id": supplier.id, "supplier_name": supplier.name,
                  "ven_id": ven.id, "ven_numero": ven.numero,
                  "productos": [{"producto_nombre": "Producto Test", "qty": 3, "unit_price_cop": 100000}]},
            headers=_headers(admin_token),
        )
        assert pec_r.status_code == 201, pec_r.text
        pec = pec_r.json()["data"]

        linked = app_client.get(f"/api/v1/ventas/pedidos/{ven.id}", headers=_headers(admin_token)).json()["data"]
        assert linked["pec_id"] == pec["id"]
        assert linked["estado"] == "EN_PROCESO"

        cancel_r = app_client.patch(
            f"/api/v1/compras/pedidos/{pec['id']}",
            json={"estado": "CANCELADO", "updated_by": "tester"},
            headers=_headers(admin_token),
        )
        assert cancel_r.status_code == 200, cancel_r.text

        after = app_client.get(f"/api/v1/ventas/pedidos/{ven.id}", headers=_headers(admin_token)).json()["data"]
        assert after["pec_id"] is None, "El PVEN debe quedar sin PEC vinculado tras cancelar la PEC"
        assert after["pec_numero"] is None
        assert after["estado"] == "PENDIENTE_COMPRA", "Debe volver a Pendiente de Compra, no quedar en En Proceso"

    def test_cancelar_pec_revierte_el_item_de_lista_de_compras(self, app_client, admin_token, db, supplier):
        ven = _make_sale_order(db)
        add_r = app_client.post(
            "/api/v1/compras/lista-compras",
            json={"pven_id": ven.id, "pven_numero": ven.numero,
                  "productos": [{"producto_nombre": "Producto Test", "qty": 3}]},
            headers=_headers(admin_token),
        )
        item_id = add_r.json()["data"][0]["id"]
        try:
            pec_r = app_client.post(
                "/api/v1/compras/pedidos",
                json={"supplier_id": supplier.id, "supplier_name": supplier.name,
                      "productos": [{"producto_nombre": "Producto Test", "qty": 3, "unit_price_cop": 100000}]},
                headers=_headers(admin_token),
            )
            pec = pec_r.json()["data"]
            app_client.patch(
                f"/api/v1/compras/lista-compras/{item_id}",
                json={"estado": "EN_PEDIDO", "pec_id": pec["id"], "pec_numero": pec["numero"]},
                headers=_headers(admin_token),
            )

            cancel_r = app_client.patch(
                f"/api/v1/compras/pedidos/{pec['id']}",
                json={"estado": "CANCELADO", "updated_by": "tester"},
                headers=_headers(admin_token),
            )
            assert cancel_r.status_code == 200, cancel_r.text

            items = app_client.get("/api/v1/compras/lista-compras?limit=200", headers=_headers(admin_token)).json()["data"]
            item = next(it for it in items if it["id"] == item_id)
            assert item["estado"] == "PENDIENTE"
            assert item["pec_id"] is None
        finally:
            app_client.delete(f"/api/v1/compras/lista-compras/{item_id}", headers=_headers(admin_token))
