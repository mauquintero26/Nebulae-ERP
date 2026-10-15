"""B2.1 D3: el pedido directo (POST /ventas/pedidos/canonico) exige una cotización confirmada, como las pantallas.

- Solo ADMIN: un ASESOR recibe 403, aunque traiga una cotización confirmada.
- Guardas, en este orden: cot_id (422) -> la COT existe (404) -> no está RECHAZADA ni CANCELADA (409) -> no tiene un
  pedido vigente (409, _pven_vigente_de_cotizacion: uno CANCELADO no cuenta) -> está CONFIRMADA (400) -> tiene la
  marca de Gate 2 (400) -> customer_id y sc_id (si viene) son los de la COT (422). Los textos de los 400 y del 409 por
  estado son los de convertir_cotizacion_a_venta.
- Con todo correcto: 201, el pedido queda con su cot_id y la marca se consume (gate2_confirmed_at None) en el MISMO
  commit que crea el pedido. Un rechazo no toca la COT: la marca sigue puesta para reintentar.
- Residual documentado (D3): las líneas y los precios salen del cuerpo, sin compararlos con la COT.

Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_b21_pedido_directo
"""
import uuid

import pytest

from app.models.customers import Customer
from app.models.erp_documents import SaleOrder, SalesQuotation
from tests._cot_confirmada import cot_confirmada_para_canonico

RUTA = "/api/v1/ventas/pedidos/canonico"
TEXTO_SIN_COT = ("Falta la cotización (cot_id): el pedido de venta solo se crea desde una cotización confirmada por "
                 "el cliente.")
TEXTO_SIN_MARCA = ("Esta cotización no tiene una confirmación de cliente válida y sin usar; no se puede crear el Pedido "
                   "de Venta.")


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _cliente_nuevo(db):
    c = Customer(first_name="Cliente", last_name=f"Directo-{uuid.uuid4().hex[:4]}",
                 email=f"pd_{uuid.uuid4().hex[:8]}@test.com")
    db.add(c)
    db.commit()
    return c


@pytest.fixture
def cliente(db):
    return _cliente_nuevo(db)


def _cuerpo(cliente_id, sku_id, **extra):
    return {"customer_id": cliente_id, "anticipo_pct": 60.0, "saldo_pct": 40.0,
            "lines": [{"sku_id": sku_id, "quantity": 1, "unit_price_cop": 100000.0, "modalidad": "POR_PEDIDO"}],
            **extra}


def _cot(db, cot_id):
    """La COT leída de nuevo de la base (la API la cambió en otra sesión)."""
    db.expire_all()
    return db.get(SalesQuotation, cot_id)


def _pedidos_del_cliente(db, cliente_id):
    return db.query(SaleOrder).filter(SaleOrder.customer_id == cliente_id).count()


def _cambiar_cot(db, cot_id, **campos):
    cot = db.get(SalesQuotation, cot_id)
    for campo, valor in campos.items():
        setattr(cot, campo, valor)
    db.commit()
    return cot


def _pedido_de_la_cot(db, cot_id, cliente_id, estado):
    so = SaleOrder(numero=f"PVEN-PDT-{uuid.uuid4().hex[:8].upper()}", cot_id=cot_id, customer_id=cliente_id,
                   customer_name="Cliente Prueba", estado=estado)
    db.add(so)
    db.commit()
    return so


def test_un_asesor_recibe_403_aunque_traiga_una_cotizacion_confirmada(app_client, db, vendedor_token, cliente, sku):
    cot_id = cot_confirmada_para_canonico(db, cliente.id)
    for cuerpo in (_cuerpo(cliente.id, sku.id, cot_id=cot_id), _cuerpo(cliente.id, sku.id)):
        resp = app_client.post(RUTA, json=cuerpo, headers=_auth(vendedor_token))
        assert resp.status_code == 403, resp.text
    assert _pedidos_del_cliente(db, cliente.id) == 0
    assert _cot(db, cot_id).gate2_confirmed_at is not None


def test_sin_cot_id_responde_422(app_client, db, admin_token, cliente, sku):
    for cuerpo in (_cuerpo(cliente.id, sku.id), _cuerpo(cliente.id, sku.id, cot_id=None)):
        resp = app_client.post(RUTA, json=cuerpo, headers=_auth(admin_token))
        assert resp.status_code == 422, resp.text
        assert resp.json()["detail"] == TEXTO_SIN_COT
    assert _pedidos_del_cliente(db, cliente.id) == 0


def test_una_cotizacion_que_no_existe_responde_404(app_client, db, admin_token, cliente, sku):
    resp = app_client.post(RUTA, json=_cuerpo(cliente.id, sku.id, cot_id=999999999), headers=_auth(admin_token))
    assert resp.status_code == 404, resp.text
    assert resp.json()["detail"] == "Cotización 999999999 no encontrada."
    assert _pedidos_del_cliente(db, cliente.id) == 0


def test_una_cotizacion_rechazada_o_cancelada_responde_409(app_client, db, admin_token, cliente, sku):
    for estado, etiqueta in (("RECHAZADA", "Rechazada"), ("CANCELADA", "Cancelada")):
        cot_id = cot_confirmada_para_canonico(db, cliente.id)
        _cambiar_cot(db, cot_id, estado=estado)
        resp = app_client.post(RUTA, json=_cuerpo(cliente.id, sku.id, cot_id=cot_id), headers=_auth(admin_token))
        assert resp.status_code == 409, (estado, resp.text)
        assert resp.json()["detail"] == (f"Cotización en estado {etiqueta} no puede ser convertida a pedido de "
                                         f"venta."), estado
        assert _cot(db, cot_id).gate2_confirmed_at is not None, estado
    assert _pedidos_del_cliente(db, cliente.id) == 0


def test_una_cotizacion_con_pedido_vigente_responde_409_y_uno_cancelado_no_cuenta(app_client, db, admin_token,
                                                                                   cliente, sku):
    cot_id = cot_confirmada_para_canonico(db, cliente.id)
    vigente = _pedido_de_la_cot(db, cot_id, cliente.id, "PENDIENTE_ANTICIPO")
    numero_cot = db.get(SalesQuotation, cot_id).numero
    resp = app_client.post(RUTA, json=_cuerpo(cliente.id, sku.id, cot_id=cot_id), headers=_auth(admin_token))
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"] == f"Cotización {numero_cot} ya fue convertida al pedido {vigente.numero}."
    assert _cot(db, cot_id).gate2_confirmed_at is not None
    assert _pedidos_del_cliente(db, cliente.id) == 1

    # H46: un pedido CANCELADO no es vigente; la COT reconfirmada crea otro pedido.
    db.get(SaleOrder, vigente.id).estado = "CANCELADO"
    db.commit()
    resp = app_client.post(RUTA, json=_cuerpo(cliente.id, sku.id, cot_id=cot_id), headers=_auth(admin_token))
    assert resp.status_code == 201, resp.text
    assert _pedidos_del_cliente(db, cliente.id) == 2


def test_una_cotizacion_en_borrador_responde_400(app_client, db, admin_token, cliente, sku):
    # La marca sigue puesta: el estado se exige por separado (la ventana del congelamiento de precio de Gate 2).
    cot_id = cot_confirmada_para_canonico(db, cliente.id)
    _cambiar_cot(db, cot_id, estado="BORRADOR")
    resp = app_client.post(RUTA, json=_cuerpo(cliente.id, sku.id, cot_id=cot_id), headers=_auth(admin_token))
    assert resp.status_code == 400, resp.text
    assert resp.json()["detail"] == ("Cotización en estado Borrador no tiene una confirmación de cliente vigente; no "
                                     "se puede crear el Pedido de Venta.")
    assert _pedidos_del_cliente(db, cliente.id) == 0


def test_una_cotizacion_confirmada_sin_la_marca_responde_400(app_client, db, admin_token, cliente, sku):
    cot_id = cot_confirmada_para_canonico(db, cliente.id)
    _cambiar_cot(db, cot_id, gate2_confirmed_at=None)
    resp = app_client.post(RUTA, json=_cuerpo(cliente.id, sku.id, cot_id=cot_id), headers=_auth(admin_token))
    assert resp.status_code == 400, resp.text
    assert resp.json()["detail"] == TEXTO_SIN_MARCA
    assert _pedidos_del_cliente(db, cliente.id) == 0


def test_el_cliente_o_la_solicitud_que_no_son_los_de_la_cotizacion_responden_422(app_client, db, admin_token,
                                                                                    cliente, sku):
    otro = _cliente_nuevo(db)
    cot_id = cot_confirmada_para_canonico(db, cliente.id)
    cot = db.get(SalesQuotation, cot_id)
    numero_cot, sc_de_la_cot = cot.numero, cot.sc_id
    otra_sc = db.get(SalesQuotation, cot_confirmada_para_canonico(db, otro.id)).sc_id

    resp = app_client.post(RUTA, json=_cuerpo(otro.id, sku.id, cot_id=cot_id), headers=_auth(admin_token))
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"] == f"El cliente {otro.id} no es el de la cotización {numero_cot}."

    resp = app_client.post(RUTA, json=_cuerpo(cliente.id, sku.id, cot_id=cot_id, sc_id=otra_sc),
                           headers=_auth(admin_token))
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"] == f"La solicitud {otra_sc} no es la de la cotización {numero_cot}."
    assert _pedidos_del_cliente(db, cliente.id) == 0 and _pedidos_del_cliente(db, otro.id) == 0
    assert _cot(db, cot_id).gate2_confirmed_at is not None  # el rechazo no gasta la marca

    # La solicitud de la COT sí se acepta.
    resp = app_client.post(RUTA, json=_cuerpo(cliente.id, sku.id, cot_id=cot_id, sc_id=sc_de_la_cot),
                           headers=_auth(admin_token))
    assert resp.status_code == 201, resp.text


def test_con_todo_correcto_crea_el_pedido_y_consume_la_marca_en_un_solo_commit(app_client, db, admin_token, cliente,
                                                                                 sku, contador_sql):
    cot_id = cot_confirmada_para_canonico(db, cliente.id)
    with contador_sql.ventana() as v:
        resp = app_client.post(RUTA, json=_cuerpo(cliente.id, sku.id, cot_id=cot_id), headers=_auth(admin_token))
    assert resp.status_code == 201, resp.text
    assert v.commits == 1, v.commits
    pedido = db.get(SaleOrder, resp.json()["data"]["id"])
    cot = _cot(db, cot_id)
    assert pedido.cot_id == cot_id and pedido.customer_id == cliente.id
    assert cot.gate2_confirmed_at is None
    assert cot.estado == "CONFIRMADA"

    # La marca ya se usó: la misma COT no da un segundo pedido.
    resp = app_client.post(RUTA, json=_cuerpo(cliente.id, sku.id, cot_id=cot_id), headers=_auth(admin_token))
    assert resp.status_code == 409, resp.text
    assert _pedidos_del_cliente(db, cliente.id) == 1


def test_el_orden_de_las_guardas(app_client, db, admin_token, cliente, sku):
    otro = _cliente_nuevo(db)

    # Estado cerrado antes que el cliente.
    cot_id = cot_confirmada_para_canonico(db, cliente.id)
    _cambiar_cot(db, cot_id, estado="RECHAZADA")
    resp = app_client.post(RUTA, json=_cuerpo(otro.id, sku.id, cot_id=cot_id), headers=_auth(admin_token))
    assert resp.status_code == 409, resp.text

    # Pedido vigente antes que el estado (Borrador) y la marca.
    cot_id = cot_confirmada_para_canonico(db, cliente.id)
    _cambiar_cot(db, cot_id, estado="BORRADOR", gate2_confirmed_at=None)
    _pedido_de_la_cot(db, cot_id, cliente.id, "PENDIENTE_ANTICIPO")
    resp = app_client.post(RUTA, json=_cuerpo(cliente.id, sku.id, cot_id=cot_id), headers=_auth(admin_token))
    assert resp.status_code == 409, resp.text
    assert "ya fue convertida al pedido" in resp.json()["detail"]

    # La marca antes que el cliente.
    cot_id = cot_confirmada_para_canonico(db, cliente.id)
    _cambiar_cot(db, cot_id, gate2_confirmed_at=None)
    resp = app_client.post(RUTA, json=_cuerpo(otro.id, sku.id, cot_id=cot_id), headers=_auth(admin_token))
    assert resp.status_code == 400, resp.text
    assert resp.json()["detail"] == TEXTO_SIN_MARCA
