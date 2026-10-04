"""H4: el Pedido de Venta no guarda asesor; la API lo entrega como `advisor_name`.

advisor_name = COT.cotizador (si el pedido tiene cot_id y no esta vacio); si no, SC.advisor_name (si tiene sc_id); si no,
None. Se calcula al leer (nada nuevo se guarda) y sin una consulta por fila: 2 consultas en bloque para la lista y una
por documento relacionado en el detalle.

Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_pedido_venta_asesor
"""
from app.models.erp_documents import CustomerRequest, SalesQuotation, SaleOrder


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _sc(db, numero, advisor_name):
    sc = CustomerRequest(numero=numero, customer_name="Cliente Asesor", advisor_name=advisor_name, estado="ASIGNADA")
    db.add(sc); db.commit(); db.refresh(sc)
    return sc


def _cot(db, numero, sc, cotizador):
    cot = SalesQuotation(numero=numero, sc_id=sc.id if sc else None, sc_numero=sc.numero if sc else None,
                         customer_name="Cliente Asesor", cotizador=cotizador, estado="CONFIRMADA")
    db.add(cot); db.commit(); db.refresh(cot)
    return cot


def _ven(db, numero, sc=None, cot=None):
    v = SaleOrder(numero=numero, customer_name="Cliente Asesor", estado="PENDIENTE_COMPRA",
                  sc_id=sc.id if sc else None, cot_id=cot.id if cot else None)
    db.add(v); db.commit(); db.refresh(v)
    return v


def _asesores_de_la_lista(app_client, token):
    resp = app_client.get("/api/v1/ventas/pedidos", params={"limit": 200}, headers=auth(token))
    assert resp.status_code == 200, resp.text
    return {d["id"]: d["advisor_name"] for d in resp.json()["data"]}


def test_la_lista_de_pedidos_trae_el_asesor_de_su_cotizacion_o_de_su_solicitud(app_client, db, admin_token):
    sc = _sc(db, "SC-ASE001", "asesora@test")
    cot = _cot(db, "COT-ASE001", sc, "cotizador@test")
    ven1 = _ven(db, "PVEN-ASE001", sc=sc, cot=cot)
    ven2 = _ven(db, "PVEN-ASE002", sc=sc)
    ven3 = _ven(db, "PVEN-ASE003")
    asesores = _asesores_de_la_lista(app_client, admin_token)
    assert asesores[ven1.id] == "cotizador@test"
    assert asesores[ven2.id] == "asesora@test"
    assert asesores[ven3.id] is None


def test_un_cotizador_vacio_cae_al_asesor_de_la_solicitud(app_client, db, admin_token):
    sc = _sc(db, "SC-ASE002", "asesora@test")
    cot_sin_cotizador = _cot(db, "COT-ASE002", sc, None)
    cot_en_blanco = _cot(db, "COT-ASE003", sc, "   ")
    ven_a = _ven(db, "PVEN-ASE004", sc=sc, cot=cot_sin_cotizador)
    ven_b = _ven(db, "PVEN-ASE005", sc=sc, cot=cot_en_blanco)
    asesores = _asesores_de_la_lista(app_client, admin_token)
    assert asesores[ven_a.id] == "asesora@test"
    assert asesores[ven_b.id] == "asesora@test"
    # Una COT con cotizador pero sin SC en el pedido tambien se lee (sin tocar la SC).
    cot_sola = _cot(db, "COT-ASE004", None, "solo.cot@test")
    ven_c = _ven(db, "PVEN-ASE006", cot=cot_sola)
    assert _asesores_de_la_lista(app_client, admin_token)[ven_c.id] == "solo.cot@test"


def test_el_detalle_del_pedido_trae_el_asesor(app_client, db, admin_token):
    sc = _sc(db, "SC-ASE003", "asesora@test")
    cot = _cot(db, "COT-ASE005", sc, "cotizador@test")
    ven1 = _ven(db, "PVEN-ASE007", sc=sc, cot=cot)
    ven2 = _ven(db, "PVEN-ASE008", sc=sc)
    ven3 = _ven(db, "PVEN-ASE009")
    for ven, esperado in ((ven1, "cotizador@test"), (ven2, "asesora@test"), (ven3, None)):
        resp = app_client.get(f"/api/v1/ventas/pedidos/{ven.id}", headers=auth(admin_token))
        assert resp.status_code == 200, resp.text
        assert resp.json()["data"]["advisor_name"] == esperado


def test_la_lista_busca_el_asesor_en_dos_consultas_sin_importar_cuantos_pedidos(app_client, db, admin_token,
                                                                                contador_sql):
    sc = _sc(db, "SC-ASE004", "asesora@test")
    cot = _cot(db, "COT-ASE006", sc, "cotizador@test")
    for i in range(5):
        _ven(db, f"PVEN-ASQ0{i}", sc=sc, cot=cot)
    with contador_sql.ventana() as v:
        resp = app_client.get("/api/v1/ventas/pedidos", params={"search": "PVEN-ASQ", "limit": 200},
                              headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert len(resp.json()["data"]) == 5
    assert len([s for s in v.sentencias if "FROM sales_quotations" in s]) == 1, v.sentencias
    assert len([s for s in v.sentencias if "FROM customer_requests" in s]) == 1, v.sentencias


def test_el_detalle_usa_una_consulta_por_documento_relacionado(app_client, db, admin_token, contador_sql):
    """H4 + H35 + H36: get_pedido lee la SC y la COT una sola vez cada una (para el asesor y para las notas)."""
    sc = _sc(db, "SC-ASE005", "asesora@test")
    cot = _cot(db, "COT-ASE007", sc, "cotizador@test")
    ven = _ven(db, "PVEN-ASE010", sc=sc, cot=cot)
    with contador_sql.ventana() as v:
        resp = app_client.get(f"/api/v1/ventas/pedidos/{ven.id}", headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert len([s for s in v.sentencias if "FROM sales_quotations" in s]) == 1, v.sentencias
    assert len([s for s in v.sentencias if "FROM customer_requests" in s]) == 1, v.sentencias
