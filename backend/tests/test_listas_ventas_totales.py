"""Resumenes y contadores de las listas de Ventas (API).

- H47: GET /ventas/pedidos trae `resumen` (monto, saldo, anticipo y conteo por estado) sobre TODO el filtro, sin
  sumar los pedidos CANCELADO ni DEVUELTO_TOTAL y sin el tope de la pagina. /ventas/stats y /ventas/analytics
  tampoco suman dinero de un pedido devuelto por completo.
- H32: GET /ventas/solicitudes trae `cotizaciones` (id, numero, estado) de cada solicitud, con una sola consulta.
- COT-LISTA: GET /ventas/cotizaciones trae `pedidos_venta` (id, numero, estado) de cada cotizacion.
- N8: GET /ventas/config lo lee cualquier rol, pero un no-admin solo ve las claves de la lista blanca.

Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_listas_ventas_totales
"""
import datetime
import uuid

from sqlalchemy import text

from app.models.erp_documents import CustomerRequest, SalesQuotation, SaleOrder


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _suf():
    return uuid.uuid4().hex[:8].upper()


def _pedido(db, numero, cliente, estado, total, anticipo, saldo):
    v = SaleOrder(numero=numero, customer_name=cliente, estado=estado,
                  total_cop=total, anticipo_cop=anticipo, saldo_cop=saldo)
    db.add(v); db.commit(); db.refresh(v)
    return v


def _tres_pedidos(db, suf):
    cliente = f"Cliente Totales {suf}"
    _pedido(db, f"PVEN-TA{suf}", cliente, "PENDIENTE_COMPRA", 1000000, 600000, 400000)
    _pedido(db, f"PVEN-TB{suf}", cliente, "ENTREGADO", 500000, 500000, 0)
    _pedido(db, f"PVEN-TC{suf}", cliente, "CANCELADO", 2000000, 0, 2000000)
    return cliente


# ─── H47: resumen de la lista de pedidos ──────────────────────────────────────────────────────────────────────

def test_resumen_de_pedidos_no_suma_los_cancelados(app_client, db, admin_token):
    suf = _suf()
    cliente = _tres_pedidos(db, suf)
    resp = app_client.get("/api/v1/ventas/pedidos", params={"search": cliente, "limit": 200}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 3
    assert body["resumen"] == {"monto_cop": 1500000, "saldo_cop": 400000, "anticipo_cop": 1100000,
                               "por_estado": {"PENDIENTE_COMPRA": 1, "ENTREGADO": 1, "CANCELADO": 1}}


def test_resumen_de_pedidos_no_suma_los_devueltos_por_completo(app_client, db, admin_token):
    """Decision del usuario: un pedido devuelto por completo tampoco suma (pero si cuenta en por_estado)."""
    suf = _suf()
    cliente = _tres_pedidos(db, suf)
    _pedido(db, f"PVEN-TD{suf}", cliente, "DEVUELTO_TOTAL", 700000, 700000, 0)
    resp = app_client.get("/api/v1/ventas/pedidos", params={"search": cliente, "limit": 200}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 4
    assert body["resumen"] == {"monto_cop": 1500000, "saldo_cop": 400000, "anticipo_cop": 1100000,
                               "por_estado": {"PENDIENTE_COMPRA": 1, "ENTREGADO": 1, "CANCELADO": 1,
                                              "DEVUELTO_TOTAL": 1}}


def test_resumen_de_pedidos_cubre_todos_no_solo_la_pagina(app_client, db, admin_token):
    suf = _suf()
    cliente = _tres_pedidos(db, suf)
    resp = app_client.get("/api/v1/ventas/pedidos", params={"search": cliente, "limit": 1}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert len(body["data"]) == 1
    assert body["resumen"]["monto_cop"] == 1500000
    # Sin pedidos que cumplan el filtro: ceros y sin estados (no nulos).
    resp = app_client.get("/api/v1/ventas/pedidos", params={"search": f"inexistente-{suf}", "limit": 200},
                          headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["resumen"] == {"monto_cop": 0, "saldo_cop": 0, "anticipo_cop": 0, "por_estado": {}}


def test_resumen_de_pedidos_respeta_el_filtro_por_estado(app_client, db, admin_token):
    suf = _suf()
    cliente = _tres_pedidos(db, suf)
    resp = app_client.get("/api/v1/ventas/pedidos", params={"search": cliente, "estado": "CANCELADO"},
                          headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 1
    assert body["resumen"] == {"monto_cop": 0, "saldo_cop": 0, "anticipo_cop": 0, "por_estado": {"CANCELADO": 1}}


def test_el_dinero_total_de_ventas_no_suma_cancelados_ni_devueltos(app_client, db, admin_token):
    """H47 (revision de otros resumenes): /ventas/stats y /ventas/analytics usaban solo `!= CANCELADO`, asi que un
    pedido devuelto por completo seguia sumando. Se compara contra lo que ya habia en la base (es compartida)."""
    suf = _suf()
    stats_antes = app_client.get("/api/v1/ventas/stats", headers=auth(admin_token)).json()["data"]
    analytics_antes = app_client.get("/api/v1/ventas/analytics", headers=auth(admin_token)).json()["data"]
    cliente = _tres_pedidos(db, suf)
    _pedido(db, f"PVEN-TD{suf}", cliente, "DEVUELTO_TOTAL", 700000, 700000, 0)

    stats = app_client.get("/api/v1/ventas/stats", headers=auth(admin_token)).json()["data"]
    # Suman los dos vigentes (1.000.000 + 500.000); el cancelado y el devuelto no.
    assert stats["ven_monto_total"] - stats_antes["ven_monto_total"] == 1500000
    # El numero de pedidos si cuenta todos.
    assert stats["ven_total"] - stats_antes["ven_total"] == 4

    analytics = app_client.get("/api/v1/ventas/analytics", headers=auth(admin_token)).json()["data"]
    assert analytics["total_revenue"] - analytics_antes["total_revenue"] == 1500000
    assert analytics["total_count"] - analytics_antes["total_count"] == 2
    assert "DEVUELTO_TOTAL" not in analytics["ven_por_estado"] or (
        analytics["ven_por_estado"]["DEVUELTO_TOTAL"] == analytics_antes["ven_por_estado"].get("DEVUELTO_TOTAL", 0))


# ─── H32: cotizaciones de cada solicitud ──────────────────────────────────────────────────────────────────────

def test_lista_de_solicitudes_trae_sus_cotizaciones(app_client, db, admin_token):
    suf = _suf()
    cliente = f"Cliente H32 {suf}"
    sc_a = CustomerRequest(numero=f"SC-HA{suf}", customer_name=cliente, estado="CONFIRMADA",
                           gate1_confirmed_at=datetime.datetime.utcnow())
    db.add(sc_a)
    sc_b = CustomerRequest(numero=f"SC-HB{suf}", customer_name=cliente, estado="COTIZADA")
    db.add(sc_b)
    sc_c = CustomerRequest(numero=f"SC-HC{suf}", customer_name=cliente, estado="ASIGNADA")
    db.add(sc_c)
    db.commit()
    cot_b = SalesQuotation(numero=f"COT-HB{suf}", sc_id=sc_b.id, sc_numero=sc_b.numero, customer_name=cliente,
                           estado="BORRADOR")
    db.add(cot_b)
    cot_c = SalesQuotation(numero=f"COT-HC{suf}", sc_id=sc_c.id, sc_numero=sc_c.numero, customer_name=cliente,
                           estado="RECHAZADA")
    db.add(cot_c)
    db.commit()

    resp = app_client.get("/api/v1/ventas/solicitudes", params={"search": cliente, "limit": 200},
                          headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    por_numero = {d["numero"]: d["cotizaciones"] for d in data}
    assert por_numero[f"SC-HA{suf}"] == []
    assert por_numero[f"SC-HB{suf}"] == [{"id": cot_b.id, "numero": cot_b.numero, "estado": "BORRADOR"}]
    assert por_numero[f"SC-HC{suf}"][0]["estado"] == "RECHAZADA"
    # Version ligera: exactamente id, numero y estado.
    for cotizaciones in por_numero.values():
        for c in cotizaciones:
            assert set(c) == {"id", "numero", "estado"}


def test_lista_de_solicitudes_sin_resultados_no_falla(app_client, db, admin_token):
    resp = app_client.get("/api/v1/ventas/solicitudes", params={"search": f"inexistente-{_suf()}"},
                          headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"] == []


def test_lista_de_solicitudes_usa_una_sola_consulta_para_las_cotizaciones(app_client, db, admin_token, contador_sql):
    """Sin N+1: con 6 solicitudes con cotizacion, la lista pide lo mismo que con 1 mas la consulta de cotizaciones."""
    suf = _suf()
    cliente = f"Cliente H32q {suf}"
    for i in range(6):
        sc = CustomerRequest(numero=f"SC-Q{i}{suf}", customer_name=cliente, estado="COTIZADA")
        db.add(sc); db.commit()
        db.add(SalesQuotation(numero=f"COT-Q{i}{suf}", sc_id=sc.id, sc_numero=sc.numero, customer_name=cliente,
                              estado="BORRADOR"))
        db.commit()
    with contador_sql.ventana() as cuenta:
        resp = app_client.get("/api/v1/ventas/solicitudes", params={"search": cliente, "limit": 200},
                              headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert len(resp.json()["data"]) == 6
    consultas_a_cotizaciones = [s for s in cuenta.sentencias if "FROM sales_quotations" in s]
    assert len(consultas_a_cotizaciones) == 1, consultas_a_cotizaciones


# ─── COT-LISTA: pedidos de cada cotizacion ────────────────────────────────────────────────────────────────────

def test_lista_de_cotizaciones_trae_sus_pedidos_con_estado(app_client, db, admin_token):
    suf = _suf()
    cliente = f"Cliente COTL {suf}"
    cots = {}
    for letra in ("LA", "LB", "LC"):
        cot = SalesQuotation(numero=f"COT-{letra}{suf}", customer_name=cliente, estado="CONFIRMADA")
        db.add(cot)
        db.commit()
        cots[letra] = cot
    pv_a = SaleOrder(numero=f"PVEN-LA{suf}", customer_name=cliente, cot_id=cots["LA"].id, estado="CANCELADO")
    db.add(pv_a); db.commit()
    pv_b = SaleOrder(numero=f"PVEN-LB{suf}", customer_name=cliente, cot_id=cots["LB"].id, estado="CANCELADO")
    db.add(pv_b); db.commit()
    pv_d = SaleOrder(numero=f"PVEN-LD{suf}", customer_name=cliente, cot_id=cots["LB"].id, estado="PENDIENTE_COMPRA")
    db.add(pv_d); db.commit()

    resp = app_client.get("/api/v1/ventas/cotizaciones", params={"search": cliente, "limit": 200},
                          headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    por_numero = {d["numero"]: d["pedidos_venta"] for d in resp.json()["data"]}
    assert por_numero[f"COT-LA{suf}"] == [{"id": pv_a.id, "numero": pv_a.numero, "estado": "CANCELADO"}]
    assert [p["estado"] for p in por_numero[f"COT-LB{suf}"]] == ["CANCELADO", "PENDIENTE_COMPRA"]
    assert por_numero[f"COT-LC{suf}"] == []
    for pedidos in por_numero.values():
        for p in pedidos:
            assert set(p) == {"id", "numero", "estado"}


# ─── N8: dias de alerta legibles por todos los roles ──────────────────────────────────────────────────────────

def _valor_de_config(db, clave):
    fila = db.execute(text("SELECT value FROM admin_config WHERE key = :k"), {"k": clave}).fetchone()
    return fila[0] if fila else None


def _guardar_config(db, clave, valor):
    db.execute(text("INSERT INTO admin_config (key, value, updated_at) VALUES (:k, :v, NOW()) "
                    "ON CONFLICT (key) DO UPDATE SET value = :v, updated_at = NOW()"), {"k": clave, "v": valor})
    db.commit()


def _restaurar_config(db, clave, previo):
    """admin_config NO se trunca en las pruebas y es compartida: se deja como estaba."""
    db.rollback()
    if previo is None:
        db.execute(text("DELETE FROM admin_config WHERE key = :k"), {"k": clave})
    else:
        db.execute(text("INSERT INTO admin_config (key, value, updated_at) VALUES (:k, :v, NOW()) "
                        "ON CONFLICT (key) DO UPDATE SET value = :v, updated_at = NOW()"), {"k": clave, "v": previo})
    db.commit()


def _token_de_rol(db, rol):
    from app.core.security import create_access_token
    from app.models.users import User
    u = User(email=f"{rol.lower()}-{_suf()}@test.nebulae", password_hash="x", role=rol, is_active=True)
    db.add(u); db.commit()
    return create_access_token({"sub": str(u.id), "role": u.role})


def test_un_asesor_lee_los_dias_de_alerta_pero_no_otras_claves(app_client, db, admin_token, vendedor_token):
    previo = _valor_de_config(db, "alerta_sc_dias")
    try:
        _guardar_config(db, "alerta_sc_dias", "5")
        _guardar_config(db, "clave_interna_test_n8", "no-para-asesores")
        resp = app_client.get("/api/v1/ventas/config", headers=auth(vendedor_token))
        assert resp.status_code == 200, resp.text
        data = resp.json()["data"]
        assert data["alerta_sc_dias"]["value"] == "5"
        assert "clave_interna_test_n8" not in data
        # El admin sigue viendo todo.
        resp = app_client.get("/api/v1/ventas/config", headers=auth(admin_token))
        assert resp.status_code == 200, resp.text
        assert resp.json()["data"]["clave_interna_test_n8"]["value"] == "no-para-asesores"
    finally:
        db.rollback()
        db.execute(text("DELETE FROM admin_config WHERE key = 'clave_interna_test_n8'"))
        db.commit()
        _restaurar_config(db, "alerta_sc_dias", previo)


def test_todos_los_roles_leen_los_dias_de_alerta_y_ninguno_ve_claves_internas(app_client, db):
    previo = _valor_de_config(db, "alerta_cot_dias")
    try:
        _guardar_config(db, "alerta_cot_dias", "4")
        _guardar_config(db, "clave_interna_test_n8", "no-para-nadie-mas")
        for rol in ("ASESOR", "COMPRAS", "BODEGA", "FINANZAS", "CONSULTA"):
            token = _token_de_rol(db, rol)
            resp = app_client.get("/api/v1/ventas/config", headers=auth(token))
            assert resp.status_code == 200, (rol, resp.text)
            data = resp.json()["data"]
            assert data["alerta_cot_dias"]["value"] == "4", rol
            assert "clave_interna_test_n8" not in data, rol
    finally:
        db.rollback()
        db.execute(text("DELETE FROM admin_config WHERE key = 'clave_interna_test_n8'"))
        db.commit()
        _restaurar_config(db, "alerta_cot_dias", previo)


def test_un_asesor_no_puede_cambiar_la_config(app_client, db, vendedor_token):
    previo = _valor_de_config(db, "alerta_sc_dias")
    try:
        resp = app_client.patch("/api/v1/ventas/config", json={"alerta_sc_dias": "9"}, headers=auth(vendedor_token))
        assert resp.status_code == 403, resp.text
        assert _valor_de_config(db, "alerta_sc_dias") == previo
    finally:
        _restaurar_config(db, "alerta_sc_dias", previo)


def test_sin_sesion_la_config_sigue_cerrada(app_client):
    assert app_client.get("/api/v1/ventas/config").status_code in (401, 403)
