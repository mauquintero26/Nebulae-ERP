"""B2.1 D5: la tienda web valida el formato del correo del cliente en el servidor.

- app/core/clientes.py tiene CORREO_VALIDO (el patron que antes era erp_ventas._CORREO_VALIDO) y correo_valido(texto);
  erp_ventas lo usa sin una copia propia.
- POST /ecommerce/pedidos, POST /ecommerce/carritos (si trae correo) y POST /store/checkout responden 422
  «El correo «x» no es válido.» (x recortado) con un correo mal formado, antes de escribir nada: ni Customer, ni
  SaleOrder, ni carrito.
- Un correo valido con espacios alrededor se guarda recortado.

Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_b21_correo_tienda
"""
import uuid
from decimal import Decimal

import pytest
from sqlalchemy import text

CORREO_MALO = "no-es-correo"
TEXTO_CORREO_MALO = "El correo «no-es-correo» no es válido."


@pytest.fixture
def tienda(db, product):
    """Un SKU con 10 unidades NEBULAE en la bodega por defecto de la tienda (la que resuelve el servidor). Si erp_test
    no tiene bodega Central, se crea una dentro de la transaccion revertida (como base_catalog_and_customer de fase6)."""
    from app.api.v1.ecommerce import _get_authorized_ecommerce_warehouses
    from app.models.catalog import ProductSKU
    from app.models.fase1b import InventoryOwnerBalance
    from app.models.inventory import InventoryLevel, Warehouse
    _, bodega = _get_authorized_ecommerce_warehouses(db)
    if bodega is None:
        db.add(Warehouse(name=f"Bodega Central B21 {uuid.uuid4().hex[:6]}", location_type="Central"))
        db.commit()
        _, bodega = _get_authorized_ecommerce_warehouses(db)
    assert bodega is not None, "la tienda no tiene una bodega Central autorizada (configuracion explicita)"
    sku = ProductSKU(product_id=product.id, sku=f"SKU-B21-{uuid.uuid4().hex[:8]}", sale_price=Decimal("100000.00"),
                     cost_price=Decimal("50000.00"))
    db.add(sku)
    db.flush()
    db.add(InventoryLevel(warehouse_id=bodega.id, sku_id=sku.id, quantity=10))
    db.add(InventoryOwnerBalance(sku_id=sku.id, warehouse_id=bodega.id, owner="NEBULAE", quantity=Decimal("10")))
    db.commit()
    return {"sku": sku, "bodega": bodega}


def _correo_nuevo():
    return f"b21-{uuid.uuid4().hex[:8]}@test.nebulae"


def _pedido_web(app_client, sku, correo, clave):
    return app_client.post("/api/v1/ecommerce/pedidos", json={
        "idempotency_key": clave,
        "customer_email": correo,
        "customer_name": "Ana Tienda",
        "customer_phone": "3001234567",
        "productos": [{"sku_id": sku.id, "quantity": 1, "modalidad": "ENTREGA_INMEDIATA"}],
        "direccion_entrega": "Calle 1 #2-3",
    })


def _checkout(app_client, sku, correo, clave):
    return app_client.post("/api/v1/store/checkout", json={
        "customer": {"first_name": "Ana", "last_name": "Tienda", "email": correo, "phone": "3001234567"},
        "cart": [{"sku_id": sku.id, "quantity": 1}],
    }, headers={"Idempotency-Key": clave})


def _cliente(db, correo):
    from app.models.customers import Customer
    db.expire_all()
    return db.query(Customer).filter(Customer.email == correo).first()


def _pedido_por_clave(db, clave):
    from app.models.erp_documents import SaleOrder
    db.expire_all()
    return db.query(SaleOrder).filter(SaleOrder.checkout_idempotency_key == clave).first()


def _carrito(db, session_id):
    return db.execute(text("SELECT customer_email FROM web_carts WHERE session_id = :s"), {"s": session_id}).fetchone()


# ── clientes.correo_valido ────────────────────────────────────────────────────────────────────────────────


def test_correo_valido_es_el_patron_unico_de_clientes():
    import app.api.v1.erp_ventas as erp_ventas
    from app.core import clientes
    for correo in ("ana@test.co", "  ana.perez+web@sub.dominio.com  ", "a@b.c"):
        assert clientes.correo_valido(correo) is True, correo
    for correo in (CORREO_MALO, "ana@test", "ana perez@test.co", "ana@@test.co", "@test.co", "ana@test.", "", "   ",
                   None, 123, ["ana@test.co"]):
        assert clientes.correo_valido(correo) is False, correo
    assert clientes.CORREO_VALIDO.pattern == r"[^@\s]+@[^@\s]+\.[^@\s]+"
    assert not hasattr(erp_ventas, "_CORREO_VALIDO")  # erp_ventas usa el de clientes, sin copia propia


# ── POST /ecommerce/pedidos ───────────────────────────────────────────────────────────────────────────────


def test_pedido_web_con_correo_malo_responde_422_sin_cliente_ni_pedido(app_client, db, tienda):
    clave = f"B21-PED-{uuid.uuid4().hex[:10]}"
    resp = _pedido_web(app_client, tienda["sku"], CORREO_MALO, clave)
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"] == TEXTO_CORREO_MALO
    assert _cliente(db, CORREO_MALO) is None
    assert _pedido_por_clave(db, clave) is None


def test_pedido_web_recorta_el_correo_en_el_422(app_client, db, tienda):
    clave = f"B21-PED-{uuid.uuid4().hex[:10]}"
    resp = _pedido_web(app_client, tienda["sku"], f"  {CORREO_MALO}  ", clave)
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"] == TEXTO_CORREO_MALO
    assert _pedido_por_clave(db, clave) is None


def test_pedido_web_guarda_el_correo_recortado(app_client, db, tienda):
    correo = _correo_nuevo()
    clave = f"B21-PED-{uuid.uuid4().hex[:10]}"
    resp = _pedido_web(app_client, tienda["sku"], f"  {correo}  ", clave)
    assert resp.status_code == 201, resp.text
    pedido = _pedido_por_clave(db, clave)
    assert pedido is not None and pedido.customer_email == correo
    cliente = _cliente(db, correo)
    assert cliente is not None and pedido.customer_id == cliente.id


def test_pedido_web_sin_correo_sigue_funcionando(app_client, db, tienda):
    """El correo no es obligatorio en /ecommerce/pedidos: vacio sigue siendo 'sin correo', como antes."""
    clave = f"B21-PED-{uuid.uuid4().hex[:10]}"
    resp = _pedido_web(app_client, tienda["sku"], "", clave)
    assert resp.status_code == 201, resp.text
    pedido = _pedido_por_clave(db, clave)
    assert pedido is not None and pedido.customer_email is None


# ── POST /store/checkout ──────────────────────────────────────────────────────────────────────────────────


def test_checkout_con_correo_malo_responde_422_sin_cliente_ni_pedido(app_client, db, tienda):
    clave = f"B21-CHK-{uuid.uuid4().hex[:10]}"
    resp = _checkout(app_client, tienda["sku"], CORREO_MALO, clave)
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"] == TEXTO_CORREO_MALO
    assert _cliente(db, CORREO_MALO) is None
    assert _pedido_por_clave(db, clave) is None


def test_checkout_con_correo_vacio_responde_422(app_client, db, tienda):
    clave = f"B21-CHK-{uuid.uuid4().hex[:10]}"
    resp = _checkout(app_client, tienda["sku"], "   ", clave)
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"] == "El correo «» no es válido."
    assert _pedido_por_clave(db, clave) is None


def test_checkout_guarda_el_correo_recortado(app_client, db, tienda):
    correo = _correo_nuevo()
    clave = f"B21-CHK-{uuid.uuid4().hex[:10]}"
    resp = _checkout(app_client, tienda["sku"], f"  {correo}  ", clave)
    assert resp.status_code == 201, resp.text
    pedido = _pedido_por_clave(db, clave)
    assert pedido is not None and pedido.customer_email == correo
    cliente = _cliente(db, correo)
    assert cliente is not None and pedido.customer_id == cliente.id


# ── POST /ecommerce/carritos ──────────────────────────────────────────────────────────────────────────────


def test_carrito_valida_el_correo_si_lo_trae_y_lo_guarda_recortado(app_client, db):
    correo = _correo_nuevo()
    sesion = f"B21-CART-{uuid.uuid4().hex[:10]}"
    resp = app_client.post("/api/v1/ecommerce/carritos", json={"session_id": sesion, "customer_email": f" {correo} ",
                                                                "customer_name": "Ana", "productos": []})
    assert resp.status_code == 200, resp.text
    assert _carrito(db, sesion)[0] == correo

    # Actualizar el mismo carrito con un correo malo: 422 y el carrito queda como estaba.
    resp = app_client.post("/api/v1/ecommerce/carritos", json={"session_id": sesion, "customer_email": CORREO_MALO,
                                                                "customer_name": "Ana", "productos": []})
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"] == TEXTO_CORREO_MALO
    assert _carrito(db, sesion)[0] == correo

    # Un carrito nuevo con un correo malo no se crea.
    otra = f"B21-CART-{uuid.uuid4().hex[:10]}"
    resp = app_client.post("/api/v1/ecommerce/carritos", json={"session_id": otra, "customer_email": CORREO_MALO,
                                                                "productos": []})
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"] == TEXTO_CORREO_MALO
    assert _carrito(db, otra) is None


def test_carrito_sin_correo_sigue_funcionando(app_client, db):
    sesion = f"B21-CART-{uuid.uuid4().hex[:10]}"
    resp = app_client.post("/api/v1/ecommerce/carritos", json={"session_id": sesion, "productos": []})
    assert resp.status_code == 200, resp.text
    fila = _carrito(db, sesion)
    assert fila is not None and fila[0] is None
