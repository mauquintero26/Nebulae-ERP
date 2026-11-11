"""B4 T24 (FINAL-C4-b): el PATCH por línea de una recepción (/compras/recepciones/{id}/lineas/{grl_id}), el que BODEGA ya
tiene, regenera el JSON g.productos desde las GRL en la misma transacción, igual que el PATCH en lote. El detalle de la
recepción lee ese JSON: sin esto, «Guardar» persistía las GRL pero al recargar la pantalla mostraba el conteo viejo.
No cambia ningún permiso.

Se corre SOLO con el runner de ROLLBACK (python tests/rollback_runner.py test_recepcion_conteo_por_linea).
"""
from app.models.erp_documents import GoodsReceipt
from tests.usuarios_de_prueba import bodega_token  # noqa: F401 (fixture por nombre)

RECEPCIONES = "/api/v1/compras/recepciones"


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _recepcion(app_client, admin_token, pec, sku):
    resp = app_client.post(RECEPCIONES, headers=_auth(admin_token), json={
        "pec_id": pec.id, "pec_numero": pec.numero, "warehouse_id": pec.warehouse_id,
        "productos": [{"sku_id": sku.id, "nombre": "Uno", "qty_esperada": 10},
                      {"sku_id": sku.id, "nombre": "Dos", "qty_esperada": 4}]})
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


def _detalle(app_client, token, eninv_id):
    resp = app_client.get(f"{RECEPCIONES}/{eninv_id}", headers=_auth(token))
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


def test_bodega_cuenta_por_linea_y_el_detalle_trae_el_conteo(app_client, db, admin_token, bodega_token, pec_10u, sku):
    rec = _recepcion(app_client, admin_token, pec_10u, sku)
    uno, dos = rec["productos"]
    resp = app_client.patch(f"{RECEPCIONES}/{rec['id']}/lineas/{uno['grl_id']}", headers=_auth(bodega_token),
                            json={"quantity_received": 7, "quantity_rejected": 1})
    assert resp.status_code == 200, resp.text
    resp = app_client.patch(f"{RECEPCIONES}/{rec['id']}/lineas/{dos['grl_id']}", headers=_auth(bodega_token),
                            json={"quantity_received": 0})
    assert resp.status_code == 200, resp.text
    productos = _detalle(app_client, bodega_token, rec["id"])["productos"]
    assert [(p["grl_id"], p["nombre"], p["qty_esperada"], p["qty_recibida"], p["qty_rechazada"], p["qty_cuarentena"],
             p["estado"]) for p in productos] == [
        (uno["grl_id"], "Uno", 10, 7, 1, 0, "PARCIAL"),
        (dos["grl_id"], "Dos", 4, 0, 0, 0, "PARCIAL"),   # 0 es un conteo explícito (Bloqueo 1)
    ]
    # El PATCH por línea solo toca lo que viene: el rechazo de la primera sigue en 1.
    resp = app_client.patch(f"{RECEPCIONES}/{rec['id']}/lineas/{uno['grl_id']}", headers=_auth(bodega_token),
                            json={"quantity_received": None})
    assert resp.status_code == 200, resp.text
    primera = _detalle(app_client, bodega_token, rec["id"])["productos"][0]
    assert (primera["qty_recibida"], primera["qty_rechazada"], primera["estado"]) == (None, 1, "PENDIENTE")


def test_con_la_recepcion_confirmada_sigue_el_422_sin_escribir(app_client, db, admin_token, bodega_token, pec_10u, sku,
                                                               contador_sql):
    rec = _recepcion(app_client, admin_token, pec_10u, sku)
    g = db.query(GoodsReceipt).filter(GoodsReceipt.id == rec["id"]).one()
    g.estado = "COMPLETADA"
    db.commit()
    with contador_sql.ventana() as v:
        resp = app_client.patch(f"{RECEPCIONES}/{rec['id']}/lineas/{rec['productos'][0]['grl_id']}",
                                headers=_auth(bodega_token), json={"quantity_received": 3})
    assert (resp.status_code, resp.json()["detail"]) == (
        422, "Solo se puede editar lineas de recepciones en BORRADOR. Estado actual: 'COMPLETADA'")
    assert v.commits == 0
    db.expire_all()
    assert db.query(GoodsReceipt.productos).filter(GoodsReceipt.id == rec["id"]).scalar() == rec["productos"]
