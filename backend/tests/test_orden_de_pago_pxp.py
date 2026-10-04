"""H44+N6 y H45: la orden de pago (PXP) del Pedido de Venta (PVEN).

H44+N6 (crear): los montos salen del pedido (pagado = total - saldo, pendiente = saldo), nunca del body; la crean
Administracion, Finanzas y el asesor (tambien con los roles legacy Admin, Finanzas y Vendedor); no se crea en un
pedido cancelado, sin saldo o con otra PXP vigente; el autor de la Actividad es el usuario autenticado.
H45 (cancelar): cancelar el pedido, por PATCH o por POST /pedidos/{id}/cancelar, cancela sus PXP PENDIENTE en el mismo
commit, deja so.pxp_id / so.pxp_numero en None (R12) y no toca una PXP que ya esta pagada (deja un aviso).

Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_orden_de_pago_pxp
"""
import uuid

TOTAL, PAGADO, SALDO = 2786923, 1724400, 1062523


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _pven(db, numero, **campos):
    """Un PVEN a medio pagar: total 2.786.923, anticipo 1.724.400 y saldo 1.062.523 (el recorrido del usuario)."""
    from app.models.erp_documents import SaleOrder
    campos.setdefault("estado", "PENDIENTE_COMPRA")
    campos.setdefault("total_cop", TOTAL)
    campos.setdefault("anticipo_cop", PAGADO)
    campos.setdefault("saldo_cop", SALDO)
    ven = SaleOrder(numero=numero, customer_name="Cliente Prueba", **campos)
    db.add(ven); db.commit(); db.refresh(ven)
    return ven


def _pxp_directa(db, ven, estado, numero, pendiente=SALDO):
    from app.models.erp_documents import PaymentPending
    p = PaymentPending(numero=numero, ven_id=ven.id, ven_numero=ven.numero, customer_name=ven.customer_name,
                       monto_total=TOTAL, monto_anticipo=TOTAL - pendiente, monto_pendiente=pendiente, estado=estado)
    db.add(p); db.commit(); db.refresh(p)
    return p


def _token(db, role):
    from app.core.security import create_access_token
    from app.models.users import User
    u = User(email=f"pxp-{uuid.uuid4().hex[:8]}@test.nebulae", password_hash="x", role=role, is_active=True)
    db.add(u); db.commit()
    return create_access_token({"sub": str(u.id), "role": u.role})


def _crear(app_client, token, ven_id, **body):
    return app_client.post(f"/api/v1/ventas/pedidos/{ven_id}/crear-pxp", json=body, headers=auth(token))


def _patch(app_client, token, ven_id, **body):
    return app_client.patch(f"/api/v1/ventas/pedidos/{ven_id}", json=body, headers=auth(token))


def _pxps(db, ven_id):
    from app.models.erp_documents import PaymentPending
    db.expire_all()
    return db.query(PaymentPending).filter(PaymentPending.ven_id == ven_id).order_by(PaymentPending.id.asc()).all()


def _logs(db, tipo, entity_id, accion):
    from app.models.erp_documents import ActivityLog
    db.expire_all()
    return (db.query(ActivityLog)
            .filter(ActivityLog.entity_type == tipo, ActivityLog.entity_id == entity_id, ActivityLog.action == accion)
            .order_by(ActivityLog.id.asc()).all())


def _pxp_pendientes(app_client, token):
    resp = app_client.get("/api/v1/ventas/stats", headers=auth(token))
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["pxp_pendiente"]


# ─── H44+N6: crear la PXP ────────────────────────────────────────────────────────────────────────────────────────

def test_crear_pxp_toma_los_montos_del_pedido_y_no_del_body(app_client, db, admin_token, user_admin):
    ven = _pven(db, "PVEN-PXP001")
    # El payload viejo del boton mandaba monto_anticipo = lo que falta: por eso salian invertidos.
    resp = _crear(app_client, admin_token, ven.id, monto_anticipo=SALDO)
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert (data["monto_total"], data["monto_anticipo"], data["monto_pendiente"]) == (TOTAL, PAGADO, SALDO)
    assert data["estado"] == "PENDIENTE" and data["ven_id"] == ven.id and data["ven_numero"] == "PVEN-PXP001"

    pxp = _pxps(db, ven.id)[0]
    assert (int(pxp.monto_total), int(pxp.monto_anticipo), int(pxp.monto_pendiente)) == (TOTAL, PAGADO, SALDO)
    db.refresh(ven)
    assert ven.pxp_id == pxp.id and ven.pxp_numero == pxp.numero

    resp = app_client.get(f"/api/v1/ventas/pedidos/{ven.id}", headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    pedido = resp.json()["data"]
    assert [p["id"] for p in pedido["pxps"]] == [pxp.id]
    creada = [a for a in pedido["actividades"] if a["action"] == "PXP_CREATED"]
    assert len(creada) == 1
    assert creada[0]["description"] == f"Orden de pago {pxp.numero} creada. Pendiente: $1.062.523"
    assert creada[0]["user_name"] == user_admin.email
    assert not creada[0]["description"].endswith("COP")

    log_pxp = _logs(db, "PXP", pxp.id, "CREATED")
    assert len(log_pxp) == 1
    assert log_pxp[0].description == f"Orden de pago creada para el pedido {ven.numero}"
    assert log_pxp[0].user_name == user_admin.email and log_pxp[0].new_estado == "PENDIENTE"


def test_el_autor_es_el_usuario_autenticado_y_no_el_del_body(app_client, db, admin_token, user_admin):
    ven = _pven(db, "PVEN-PXP002")
    resp = _crear(app_client, admin_token, ven.id, user_name="otra.persona@test", notas="Pagar por PSE")
    assert resp.status_code == 200, resp.text
    pxp = _pxps(db, ven.id)[0]
    assert pxp.notas == "Pagar por PSE"
    for log in _logs(db, "VEN", ven.id, "PXP_CREATED") + _logs(db, "PXP", pxp.id, "CREATED"):
        assert log.user_name == user_admin.email


def test_el_asesor_puede_crear_la_pxp(app_client, db, vendedor_token, user_vendedor):
    ven = _pven(db, "PVEN-PXP003")
    resp = _crear(app_client, vendedor_token, ven.id)
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["monto_pendiente"] == SALDO
    assert _logs(db, "VEN", ven.id, "PXP_CREATED")[0].user_name == user_vendedor.email


def test_finanzas_y_los_roles_legacy_pueden_crear_la_pxp(app_client, db):
    for i, rol in enumerate(("FINANZAS", "Finanzas", "Admin", "Vendedor", "ASESOR", "ADMIN")):
        ven = _pven(db, f"PVEN-PXP004{i}")
        resp = _crear(app_client, _token(db, rol), ven.id)
        assert resp.status_code == 200, (rol, resp.text)


def test_los_demas_roles_no_pueden_crear_la_pxp(app_client, db):
    ven = _pven(db, "PVEN-PXP005")
    for rol in ("COMPRAS", "ERP", "BODEGA", "CONSULTA", "Mercadeo"):
        resp = _crear(app_client, _token(db, rol), ven.id)
        assert resp.status_code == 403, (rol, resp.text)
    resp = app_client.post(f"/api/v1/ventas/pedidos/{ven.id}/crear-pxp", json={})
    assert resp.status_code in (401, 403)
    assert _pxps(db, ven.id) == []


def test_no_se_crea_pxp_de_un_pedido_cancelado(app_client, db, admin_token):
    ven = _pven(db, "PVEN-PXP006", estado="CANCELADO", cancellation_reason="El cliente desistió")
    resp = _crear(app_client, admin_token, ven.id)
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"] == "No se puede crear una orden de pago para un pedido cancelado."
    assert _pxps(db, ven.id) == []


def test_no_se_crea_una_segunda_pxp_vigente(app_client, db, admin_token):
    ven = _pven(db, "PVEN-PXP007")
    primera = _crear(app_client, admin_token, ven.id)
    assert primera.status_code == 200, primera.text
    numero = primera.json()["data"]["numero"]
    resp = _crear(app_client, admin_token, ven.id)
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"] == f"El pedido ya tiene la orden de pago {numero}."
    assert "ya tiene la orden de pago" in resp.json()["detail"]
    assert len(_pxps(db, ven.id)) == 1


def test_una_pxp_pagada_tambien_cuenta_como_vigente(app_client, db, admin_token):
    ven = _pven(db, "PVEN-PXP008")
    pagada = _pxp_directa(db, ven, "PAGADA", "PXP-TST0081")
    resp = _crear(app_client, admin_token, ven.id)
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"] == f"El pedido ya tiene la orden de pago {pagada.numero}."


def test_no_se_crea_pxp_sin_saldo(app_client, db, admin_token):
    for i, saldo in enumerate((0, -5)):
        ven = _pven(db, f"PVEN-PXP009{i}", saldo_cop=saldo)
        resp = _crear(app_client, admin_token, ven.id)
        assert resp.status_code == 409, (saldo, resp.text)
        assert resp.json()["detail"] == "El pedido no tiene saldo pendiente; no hace falta una orden de pago."
        assert _pxps(db, ven.id) == []


def test_no_se_crea_pxp_si_el_saldo_es_mayor_que_el_total(app_client, db, admin_token):
    ven = _pven(db, "PVEN-PXP0095", saldo_cop=TOTAL + 1)
    resp = _crear(app_client, admin_token, ven.id)
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"] == "Los montos del pedido no cuadran: el saldo es mayor que el total."
    assert _pxps(db, ven.id) == []
    db.refresh(ven)
    assert ven.pxp_id is None and ven.pxp_numero is None


def test_se_puede_crear_otra_si_la_anterior_esta_cancelada(app_client, db, admin_token):
    ven = _pven(db, "PVEN-PXP010")
    vieja = _pxp_directa(db, ven, "CANCELADA", "PXP-TST0101")
    resp = _crear(app_client, admin_token, ven.id)
    assert resp.status_code == 200, resp.text
    nueva = resp.json()["data"]
    assert nueva["numero"] != vieja.numero and nueva["estado"] == "PENDIENTE"
    db.refresh(ven)
    assert ven.pxp_id == nueva["id"] and ven.pxp_numero == nueva["numero"]
    assert sorted(p.estado for p in _pxps(db, ven.id)) == ["CANCELADA", "PENDIENTE"]
    pedido = app_client.get(f"/api/v1/ventas/pedidos/{ven.id}", headers=auth(admin_token)).json()["data"]
    assert [p["estado"] for p in pedido["pxps"]] == ["CANCELADA", "PENDIENTE"]  # del mas viejo al mas nuevo


def test_body_vacio_es_valido(app_client, db, admin_token):
    ven = _pven(db, "PVEN-PXP011")
    resp = _crear(app_client, admin_token, ven.id)
    assert resp.status_code == 200, resp.text
    # Y sin cuerpo del todo.
    ven2 = _pven(db, "PVEN-PXP012")
    resp = app_client.post(f"/api/v1/ventas/pedidos/{ven2.id}/crear-pxp", headers=auth(admin_token))
    assert resp.status_code == 200, resp.text


def test_pedido_inexistente_da_404(app_client, admin_token):
    resp = _crear(app_client, admin_token, 2147480000)
    assert resp.status_code == 404, resp.text


def test_los_montos_con_centavos_quedan_en_pesos_enteros(app_client, db, admin_token):
    ven = _pven(db, "PVEN-PXP013", total_cop="2786923.40", saldo_cop="1062523.49")
    resp = _crear(app_client, admin_token, ven.id)
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert (data["monto_total"], data["monto_anticipo"], data["monto_pendiente"]) == (TOTAL, PAGADO, SALDO)


def test_crear_la_pxp_bloquea_el_pedido_y_confirma_una_sola_vez(app_client, db, admin_token, contador_sql):
    ven = _pven(db, "PVEN-PXP014")
    with contador_sql.ventana() as v:
        resp = _crear(app_client, admin_token, ven.id)
    assert resp.status_code == 200, resp.text
    lectura = next(s for s in v.sentencias if "FROM sale_orders" in s and "sale_orders.id =" in s)
    assert "FOR UPDATE" in lectura
    assert v.commits == 1  # la PXP, el vinculo del pedido y los dos renglones de Actividad van juntos


# ─── H45: cancelar el pedido cancela su PXP ──────────────────────────────────────────────────────────────────────

def test_cancelar_el_pedido_cancela_su_pxp_pendiente(app_client, db, admin_token):
    ven = _pven(db, "PVEN-PXP020")
    resp = _crear(app_client, admin_token, ven.id)
    assert resp.status_code == 200, resp.text
    pxp_id, pxp_numero = resp.json()["data"]["id"], resp.json()["data"]["numero"]
    db.refresh(ven)
    assert ven.pxp_id == pxp_id
    n0 = _pxp_pendientes(app_client, admin_token)

    resp = _patch(app_client, admin_token, ven.id, estado="CANCELADO", cancellation_reason="Cliente desistió",
                  updated_by="asesor@test")
    assert resp.status_code == 200, resp.text

    pxp = _pxps(db, ven.id)[0]
    assert pxp.estado == "CANCELADA"
    assert "Cancelada por la cancelación del pedido PVEN-PXP020: Cliente desistió" in pxp.notas
    assert _pxp_pendientes(app_client, admin_token) == n0 - 1

    pedido = app_client.get(f"/api/v1/ventas/pedidos/{ven.id}", headers=auth(admin_token)).json()["data"]
    assert [p["estado"] for p in pedido["pxps"]] == ["CANCELADA"]
    cancelada = [a for a in pedido["actividades"] if a["action"] == "PXP_CANCELADA"]
    assert len(cancelada) == 1
    assert cancelada[0]["description"] == f"Orden de pago {pxp_numero} cancelada (pendiente: $1.062.523)"
    assert cancelada[0]["user_name"] == "asesor@test"
    assert not [a for a in pedido["actividades"] if a["action"] == "PXP_REVISAR"]

    cambio = _logs(db, "PXP", pxp_id, "ESTADO_CHANGED")
    assert len(cambio) == 1
    assert (cambio[0].old_estado, cambio[0].new_estado) == ("PENDIENTE", "CANCELADA")
    assert cambio[0].description == "Orden de pago cancelada por la cancelación del pedido PVEN-PXP020"
    assert cambio[0].user_name == "asesor@test"

    # R12: el pedido ya no apunta a la PXP cancelada (la lista y el detalle no se contradicen).
    db.refresh(ven)
    assert ven.estado == "CANCELADO"
    assert ven.pxp_id is None and ven.pxp_numero is None

    # Efecto colateral: cambios_documento rastrea pxp_numero, asi que el renglon 'Pedido actualizado' (UPDATED) del
    # PATCH lista que el pedido dejo de apuntar a la PXP. Se fija el campo y sus valores, no su etiqueta (la renombra T12).
    editado = _logs(db, "VEN", ven.id, "UPDATED")
    assert len(editado) == 1
    cambios = {c["campo"]: c for c in editado[0].extra_data["cambios"]}
    assert cambios["pxp_numero"]["antes"] == pxp_numero and cambios["pxp_numero"]["despues"] is None


def test_cancelar_no_toca_una_pxp_pagada(app_client, db, admin_token):
    ven = _pven(db, "PVEN-PXP021")
    pagada = _pxp_directa(db, ven, "PAGADA", "PXP-TST0211")
    ven.pxp_id, ven.pxp_numero = pagada.id, pagada.numero
    db.commit()
    resp = _patch(app_client, admin_token, ven.id, estado="CANCELADO", cancellation_reason="Cliente desistió")
    assert resp.status_code == 200, resp.text

    assert [p.estado for p in _pxps(db, ven.id)] == ["PAGADA"]
    avisos = _logs(db, "VEN", ven.id, "PXP_REVISAR")
    assert len(avisos) == 1
    assert avisos[0].description == (f"La orden de pago {pagada.numero} está pagada: revisar devolución o saldo a "
                                     f"favor del cliente")
    assert "PAGADA" not in avisos[0].description  # la etiqueta del estado, nunca el codigo crudo
    assert not _logs(db, "VEN", ven.id, "PXP_CANCELADA")
    assert not _logs(db, "PXP", pagada.id, "ESTADO_CHANGED")
    # R12: solo se limpia el vinculo cuando apuntaba a una PXP que se canceló; esta sigue viva.
    db.refresh(ven)
    assert ven.estado == "CANCELADO" and ven.pxp_id == pagada.id and ven.pxp_numero == pagada.numero


def test_con_una_pagada_y_una_pendiente_solo_se_cancela_la_pendiente(app_client, db, admin_token):
    ven = _pven(db, "PVEN-PXP022")
    pagada = _pxp_directa(db, ven, "PAGADA", "PXP-TST0221")
    pendiente = _pxp_directa(db, ven, "PENDIENTE", "PXP-TST0222")
    ven.pxp_id, ven.pxp_numero = pendiente.id, pendiente.numero
    db.commit()
    resp = _patch(app_client, admin_token, ven.id, estado="CANCELADO", cancellation_reason="Cliente desistió")
    assert resp.status_code == 200, resp.text
    estados = {p.numero: p.estado for p in _pxps(db, ven.id)}
    assert estados == {"PXP-TST0221": "PAGADA", "PXP-TST0222": "CANCELADA"}
    assert len(_logs(db, "VEN", ven.id, "PXP_CANCELADA")) == 1
    assert len(_logs(db, "VEN", ven.id, "PXP_REVISAR")) == 1
    db.refresh(ven)
    assert ven.pxp_id is None and ven.pxp_numero is None


def test_cancelar_por_la_ruta_fase4_tambien_cancela_la_pxp(app_client, db, admin_token, user_admin):
    ven = _pven(db, "PVEN-PXP023", estado="CONFIRMADO")
    resp = _crear(app_client, admin_token, ven.id)
    assert resp.status_code == 200, resp.text
    pxp_id = resp.json()["data"]["id"]
    n0 = _pxp_pendientes(app_client, admin_token)

    resp = app_client.post(f"/api/v1/ventas/pedidos/{ven.id}/cancelar", json={"motivo": "Cliente desistió"},
                           headers=auth(admin_token))
    assert resp.status_code == 200, resp.text

    pxp = _pxps(db, ven.id)[0]
    assert pxp.estado == "CANCELADA"
    assert "Cancelada por la cancelación del pedido PVEN-PXP023: Cliente desistió" in pxp.notas
    assert _pxp_pendientes(app_client, admin_token) == n0 - 1
    cambio = _logs(db, "PXP", pxp_id, "ESTADO_CHANGED")
    assert [(c.old_estado, c.new_estado, c.user_name) for c in cambio] == [("PENDIENTE", "CANCELADA", user_admin.email)]
    aviso = _logs(db, "VEN", ven.id, "PXP_CANCELADA")
    assert len(aviso) == 1 and "(pendiente: $1.062.523)" in aviso[0].description
    assert aviso[0].user_name == user_admin.email
    db.refresh(ven)
    assert ven.estado == "CANCELADO" and ven.pxp_id is None and ven.pxp_numero is None


def test_cancelar_por_la_ruta_fase4_no_toca_una_pxp_pagada(app_client, db, admin_token):
    ven = _pven(db, "PVEN-PXP024", estado="CONFIRMADO")
    pagada = _pxp_directa(db, ven, "PAGADA", "PXP-TST0241")
    resp = app_client.post(f"/api/v1/ventas/pedidos/{ven.id}/cancelar", json={"motivo": "Cliente desistió"},
                           headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert [p.estado for p in _pxps(db, ven.id)] == ["PAGADA"]
    assert len(_logs(db, "VEN", ven.id, "PXP_REVISAR")) == 1


def test_editar_un_pedido_sin_cancelarlo_no_toca_la_pxp(app_client, db, admin_token):
    ven = _pven(db, "PVEN-PXP025")
    assert _crear(app_client, admin_token, ven.id).status_code == 200
    resp = _patch(app_client, admin_token, ven.id, notas="x")
    assert resp.status_code == 200, resp.text
    resp = _patch(app_client, admin_token, ven.id, estado="EN_PROCESO")
    assert resp.status_code == 200, resp.text
    assert [p.estado for p in _pxps(db, ven.id)] == ["PENDIENTE"]
    db.refresh(ven)
    assert ven.pxp_id is not None and ven.pxp_numero is not None
    assert not _logs(db, "VEN", ven.id, "PXP_CANCELADA")


def test_una_cancelacion_rechazada_no_toca_la_pxp(app_client, db, admin_token):
    """Sin motivo la cancelacion da 422 (T4) y la PXP sigue PENDIENTE y enlazada, por las dos rutas."""
    ven = _pven(db, "PVEN-PXP026", estado="CONFIRMADO")
    assert _crear(app_client, admin_token, ven.id).status_code == 200
    resp = _patch(app_client, admin_token, ven.id, estado="CANCELADO")
    assert resp.status_code == 422, resp.text
    resp = app_client.post(f"/api/v1/ventas/pedidos/{ven.id}/cancelar", json={"motivo": "no"},
                           headers=auth(admin_token))
    assert resp.status_code == 422, resp.text
    assert [p.estado for p in _pxps(db, ven.id)] == ["PENDIENTE"]
    db.refresh(ven)
    assert ven.estado == "CONFIRMADO" and ven.pxp_id is not None


def test_cancelar_dos_veces_no_repite_los_renglones(app_client, db, admin_token):
    ven = _pven(db, "PVEN-PXP027")
    assert _crear(app_client, admin_token, ven.id).status_code == 200
    resp = _patch(app_client, admin_token, ven.id, estado="CANCELADO", cancellation_reason="Cliente desistió")
    assert resp.status_code == 200, resp.text
    resp = _patch(app_client, admin_token, ven.id, estado="CANCELADO", cancellation_reason="Cliente desistió")
    assert resp.status_code == 200, resp.text
    assert len(_logs(db, "VEN", ven.id, "PXP_CANCELADA")) == 1
    assert [p.estado for p in _pxps(db, ven.id)] == ["CANCELADA"]


def test_despues_de_cancelar_no_se_crea_otra_pxp(app_client, db, admin_token):
    """Con la PXP cancelada y el pedido cancelado no se crea otra: gana la guarda del pedido cancelado."""
    ven = _pven(db, "PVEN-PXP028")
    assert _crear(app_client, admin_token, ven.id).status_code == 200
    assert _patch(app_client, admin_token, ven.id, estado="CANCELADO",
                  cancellation_reason="Cliente desistió").status_code == 200
    resp = _crear(app_client, admin_token, ven.id)
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"] == "No se puede crear una orden de pago para un pedido cancelado."


def _commits_al_anular(monkeypatch, contador_sql, modulo, ejecutar):
    """Corre `ejecutar()` espiando modulo.anular_pxps_de_pedido: devuelve [(commits que ya habia en la peticion,
    estado del pedido)] de cada llamada, y los commits totales de la peticion."""
    visto = []
    real = modulo.anular_pxps_de_pedido
    with contador_sql.ventana() as ventana:
        def espia(db_, so, autor, motivo=None):
            visto.append((ventana.commits, so.estado))
            return real(db_, so, autor, motivo)
        monkeypatch.setattr(modulo, "anular_pxps_de_pedido", espia)
        ejecutar()
    return visto, ventana.commits


def test_el_patch_anula_la_pxp_antes_del_commit_del_pedido(app_client, db, admin_token, contador_sql, monkeypatch):
    """H45: la PXP y el pedido quedan en el mismo commit (no hay un instante con el pedido cancelado y su PXP
    pendiente): anular_pxps_de_pedido corre cuando la peticion todavia no ha confirmado nada."""
    import app.api.v1.erp_ventas as m_ventas
    ven = _pven(db, "PVEN-PXP029")
    assert _crear(app_client, admin_token, ven.id).status_code == 200
    visto, commits = _commits_al_anular(
        monkeypatch, contador_sql, m_ventas,
        lambda: _patch(app_client, admin_token, ven.id, estado="CANCELADO", cancellation_reason="Cliente desistió"))
    assert visto == [(0, "CANCELADO")]
    assert commits >= 1
    assert [p.estado for p in _pxps(db, ven.id)] == ["CANCELADA"]


def test_la_ruta_fase4_anula_la_pxp_antes_del_commit_del_pedido(app_client, db, admin_token, contador_sql,
                                                               monkeypatch):
    import app.api.v1.erp_ventas_fase4 as m_fase4
    ven = _pven(db, "PVEN-PXP030", estado="CONFIRMADO")
    assert _crear(app_client, admin_token, ven.id).status_code == 200
    visto, commits = _commits_al_anular(
        monkeypatch, contador_sql, m_fase4,
        lambda: app_client.post(f"/api/v1/ventas/pedidos/{ven.id}/cancelar", json={"motivo": "Cliente desistió"},
                                headers=auth(admin_token)))
    assert visto == [(0, "CANCELADO")]
    assert commits >= 1
    assert [p.estado for p in _pxps(db, ven.id)] == ["CANCELADA"]


# ─── B6 (revision final): cancelar la PXP desde su PATCH suelta el vinculo del pedido ──────────────────────────

def _patch_pxp(app_client, token, pxp_id, **body):
    return app_client.patch(f"/api/v1/ventas/pxp/{pxp_id}", json=body, headers=auth(token))


def test_cancelar_la_pxp_por_patch_limpia_el_vinculo_del_pedido_en_el_mismo_commit(app_client, db, admin_token,
                                                                                    contador_sql):
    from sqlalchemy import event
    from sqlalchemy.orm import Session
    ven = _pven(db, "PVEN-PXP031")
    assert _crear(app_client, admin_token, ven.id).status_code == 200
    pxp = _pxps(db, ven.id)[0]
    db.refresh(ven)
    assert (ven.pxp_id, ven.pxp_numero) == (pxp.id, pxp.numero)
    escrito_al_confirmar = []  # por cada commit: (UPDATE de la PXP, UPDATE del pedido) ya enviados hasta ese momento

    with contador_sql.ventana() as v:
        def _foto(_session):
            escrito_al_confirmar.append((any(s.startswith("UPDATE payment_pendings") for s in v.sentencias),
                                         any(s.startswith("UPDATE sale_orders") for s in v.sentencias)))
        event.listen(Session, "after_commit", _foto)
        try:
            resp = _patch_pxp(app_client, admin_token, pxp.id, estado="CANCELADA", updated_by="t")
        finally:
            event.remove(Session, "after_commit", _foto)
    assert resp.status_code == 200, resp.text
    db.expire_all()
    db.refresh(ven)
    assert (ven.pxp_id, ven.pxp_numero) == (None, None)
    assert [p.estado for p in _pxps(db, ven.id)] == ["CANCELADA"]
    # El primer commit de la peticion ya lleva la PXP cancelada Y el pedido suelto (no uno aparte despues).
    assert escrito_al_confirmar[0] == (True, True), escrito_al_confirmar
    # Ya se puede crear otra orden de pago.
    assert _crear(app_client, admin_token, ven.id).status_code == 200


def test_cancelar_una_pxp_a_la_que_el_pedido_no_apunta_no_toca_el_pedido(app_client, db, admin_token):
    ven = _pven(db, "PVEN-PXP032")
    vieja = _pxp_directa(db, ven, "PENDIENTE", "PXP-T032A")
    actual = _pxp_directa(db, ven, "PENDIENTE", "PXP-T032B")
    ven.pxp_id, ven.pxp_numero = actual.id, actual.numero
    db.commit()
    resp = _patch_pxp(app_client, admin_token, vieja.id, estado="CANCELADA")
    assert resp.status_code == 200, resp.text
    db.expire_all()
    db.refresh(ven)
    assert (ven.pxp_id, ven.pxp_numero) == (actual.id, actual.numero)


def test_otro_cambio_de_la_pxp_no_suelta_el_pedido(app_client, db, admin_token):
    ven = _pven(db, "PVEN-PXP033")
    assert _crear(app_client, admin_token, ven.id).status_code == 200
    pxp = _pxps(db, ven.id)[0]
    resp = _patch_pxp(app_client, admin_token, pxp.id, notas="Llamar el viernes")
    assert resp.status_code == 200, resp.text
    db.expire_all()
    db.refresh(ven)
    assert (ven.pxp_id, ven.pxp_numero) == (pxp.id, pxp.numero)
