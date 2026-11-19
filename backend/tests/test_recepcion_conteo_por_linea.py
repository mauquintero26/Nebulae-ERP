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



# ─── B4 T24 r1 (m16): el PATCH por línea bloquea la recepción y valida las cantidades a mano ─────────────────────────

def _cantidad_invalida(nombre):
    return f"La cantidad {nombre} debe ser un número entero entre 0 y 99.999.999, o vacía."


def test_el_patch_por_linea_lee_la_recepcion_con_bloqueo(app_client, db, admin_token, bodega_token, pec_10u, sku,
                                                         contador_sql):
    """r1 (m16): update_grl lee la GoodsReceipt con FOR UPDATE ANTES de la guarda de BORRADOR: dos PATCH por línea de la
    misma recepción (o uno y la confirmación) quedan en serie, y tras una confirmación sale el 422 de siempre."""
    rec = _recepcion(app_client, admin_token, pec_10u, sku)
    ruta = f"{RECEPCIONES}/{rec['id']}/lineas/{rec['productos'][0]['grl_id']}"
    with contador_sql.ventana() as v:
        resp = app_client.patch(ruta, headers=_auth(bodega_token), json={"quantity_received": 3})
    assert resp.status_code == 200, resp.text
    lecturas = [s for s in v.sentencias if s.lstrip().upper().startswith("SELECT") and "FROM goods_receipts" in s]
    assert lecturas and "FOR UPDATE" in lecturas[0].upper(), lecturas[:1]


def test_las_cantidades_de_la_linea_se_validan_con_422_en_espanol(app_client, db, admin_token, bodega_token, pec_10u,
                                                                  sku, contador_sql):
    """r1 (m16): quantity_received, quantity_rejected y quantity_quarantine pasaban por int() sin validar: un texto daba
    500 y un negativo se guardaba. Ahora, entre 0 y el tope de la columna (Numeric(10, 2): 99.999.999), o null; si no,
    422 en español y nada escrito. Un null en rechazada o cuarentena sigue siendo 0, como hoy. Cierre de r1 (ruling): lo
    que int() truncaba en silencio (2.5, «2.5») o no leía («3.0», NaN, inf) también da 422; lo que leía sin pérdida sigue
    valiendo (test_lo_que_int_aceptaba_sin_perdida_sigue_valiendo)."""
    rec = _recepcion(app_client, admin_token, pec_10u, sku)
    ruta = f"{RECEPCIONES}/{rec['id']}/lineas/{rec['productos'][0]['grl_id']}"
    for campo, nombre in (("quantity_received", "recibida"), ("quantity_rejected", "rechazada"),
                          ("quantity_quarantine", "en cuarentena")):
        for malo in ("tres", "2.5", "3.0", "-1", "", -1, 2.5, True, False, 10 ** 8, "100000000", 1e8, [1], {"a": 1}):
            with contador_sql.ventana() as v:
                resp = app_client.patch(ruta, headers=_auth(bodega_token), json={campo: malo})
            assert (resp.status_code, resp.json()) == (422, {"detail": _cantidad_invalida(nombre)}), (campo, malo)
            assert v.commits == 0 and not [s for s in v.sentencias
                                           if s.lstrip().upper().startswith(("INSERT", "UPDATE"))], (campo, malo)
    db.expire_all()
    assert db.query(GoodsReceipt.productos).filter(GoodsReceipt.id == rec["id"]).scalar() == rec["productos"]
    resp = app_client.patch(ruta, headers=_auth(bodega_token), json={"quantity_received": 10 ** 8 - 1,
                                                                    "quantity_rejected": None, "quantity_quarantine": 0})
    assert resp.status_code == 200, resp.text
    primera = _detalle(app_client, bodega_token, rec["id"])["productos"][0]
    assert (primera["qty_recibida"], primera["qty_rechazada"], primera["qty_cuarentena"]) == (10 ** 8 - 1, 0, 0)



def test_lo_que_int_aceptaba_sin_perdida_sigue_valiendo(app_client, db, admin_token, bodega_token, pec_10u, sku,
                                                       contador_sql):
    """Cierre de r1 (ruling de m16): m16 pedía validar (422 en vez de 500), no estrechar lo que ya funcionaba. int("3") y
    int(3.0) daban 3 sin perder nada: siguen valiendo (un texto entero, con espacios o no, y un float entero). NaN e inf
    (JSON los trae como números) dan 422 sin escribir, como 2.5."""
    rec = _recepcion(app_client, admin_token, pec_10u, sku)
    uno, dos = rec["productos"]
    ruta = f"{RECEPCIONES}/{rec['id']}/lineas/{uno['grl_id']}"
    resp = app_client.patch(ruta, headers=_auth(bodega_token),
                            json={"quantity_received": "3", "quantity_rejected": " 1 ", "quantity_quarantine": 2.0})
    assert resp.status_code == 200, resp.text
    resp = app_client.patch(f"{RECEPCIONES}/{rec['id']}/lineas/{dos['grl_id']}", headers=_auth(bodega_token),
                            json={"quantity_received": 4.0})
    assert resp.status_code == 200, resp.text
    productos = _detalle(app_client, bodega_token, rec["id"])["productos"]
    assert [(p["qty_recibida"], p["qty_rechazada"], p["qty_cuarentena"]) for p in productos] == [(3, 1, 2), (4, 0, 0)]
    cabecera = {**_auth(bodega_token), "Content-Type": "application/json"}
    for crudo in ("NaN", "Infinity", "-Infinity"):
        with contador_sql.ventana() as v:
            resp = app_client.patch(ruta, headers=cabecera, content=f'{{"quantity_received": {crudo}}}')
        assert (resp.status_code, resp.json()) == (422, {"detail": _cantidad_invalida("recibida")}), crudo
        assert v.commits == 0, crudo
    assert _detalle(app_client, bodega_token, rec["id"])["productos"][0]["qty_recibida"] == 3



def test_el_patch_en_lote_lee_la_recepcion_con_bloqueo(app_client, db, admin_token, pec_10u, sku, contador_sql):
    """r2 (m5): update_recepcion (el PATCH en lote) lee la GoodsReceipt con FOR UPDATE antes de su guarda de BORRADOR, como
    update_grl (m16): tras una confirmación, el PATCH que esperaba ve COMPLETADA y no reescribe las GRL."""
    rec = _recepcion(app_client, admin_token, pec_10u, sku)
    with contador_sql.ventana() as v:
        resp = app_client.patch(f"{RECEPCIONES}/{rec['id']}", headers=_auth(admin_token), json={"notas": "r2 m5"})
    assert resp.status_code == 200, resp.text
    lecturas = [s for s in v.sentencias if s.lstrip().upper().startswith("SELECT") and "FROM goods_receipts" in s]
    assert lecturas and "FOR UPDATE" in lecturas[0].upper(), lecturas[:1]


def test_las_observaciones_de_la_linea_se_guardan_y_vuelven_en_el_detalle(app_client, db, admin_token, bodega_token, pec_10u, sku):
    rec = _recepcion(app_client, admin_token, pec_10u, sku)
    uno = rec["productos"][0]
    linea = f"{RECEPCIONES}/{rec['id']}/lineas/{uno['grl_id']}"
    r = app_client.patch(linea, headers=_auth(bodega_token), json={"quantity_received": 7, "notes": "  Caja rota  "})
    assert (r.status_code, r.json()["data"]["notes"]) == (200, "Caja rota"), r.text
    assert _detalle(app_client, bodega_token, rec["id"])["productos"][0]["observaciones"] == "Caja rota"
    app_client.patch(linea, headers=_auth(bodega_token), json={"quantity_received": 8})            # sin notes: no cambia
    assert _detalle(app_client, bodega_token, rec["id"])["productos"][0]["observaciones"] == "Caja rota"
    app_client.patch(linea, headers=_auth(bodega_token), json={"notes": "   "})
    assert _detalle(app_client, bodega_token, rec["id"])["productos"][0]["observaciones"] is None


def test_observaciones_de_la_linea_se_validan_sin_escribir(app_client, db, admin_token, bodega_token, pec_10u, sku, contador_sql):
    """Review Focus 4."""
    rec = _recepcion(app_client, admin_token, pec_10u, sku)
    linea = f"{RECEPCIONES}/{rec['id']}/lineas/{rec['productos'][0]['grl_id']}"
    for valor, texto in (("x" * 501, "Las observaciones de la línea pueden tener hasta 500 caracteres."),
                         ("a\x07b", "Las observaciones de la línea no pueden llevar caracteres de control."),
                         (5, "Las observaciones de la línea deben ser un texto.")):
        with contador_sql.ventana() as v:
            r = app_client.patch(linea, headers=_auth(bodega_token), json={"quantity_received": 9, "notes": valor})
        assert (r.status_code, r.json()["detail"]) == (422, texto), repr(valor)
        escrituras = [s for s in v.sentencias if s.lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE"))]
        assert escrituras == [], (repr(valor), escrituras)
    assert _detalle(app_client, bodega_token, rec["id"])["productos"][0]["qty_recibida"] is None
