"""N5 (con los choques de R12): lista blanca de estados que se ponen a mano por PATCH.

- SC: solo 'Borrador' (gana N4: cancelar es POST /cancelar). Siguen los 400 de Gate 1 (CONFIRMADA, ASIGNADA,
  PENDIENTE_CONFIRMACION).
- COT: solo Borrador, Rechazada o Vencida (gana H50: ENVIADA -> 400). Siguen los 400 de CONFIRMADA y
  PENDIENTE_CONFIRMACION.
- Una COT con un pedido de venta no cancelado no cambia de estado (409). Reenviar el mismo estado nunca falla.

Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_estados_manuales_ventas
"""


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _sc(db, numero, **campos):
    """Sin asesor, para que la SC no se auto-promueva a ASIGNADA."""
    from app.models.erp_documents import CustomerRequest
    campos.setdefault("estado", "BORRADOR")
    sc = CustomerRequest(numero=numero, customer_name="Cliente Prueba", **campos)
    db.add(sc); db.commit(); db.refresh(sc)
    return sc


def _cot(db, numero, **campos):
    from app.models.erp_documents import SalesQuotation
    campos.setdefault("estado", "BORRADOR")
    cot = SalesQuotation(numero=numero, customer_name="Cliente Prueba", **campos)
    db.add(cot); db.commit(); db.refresh(cot)
    return cot


def _cambios_de_estado(db, entidad, entity_id):
    from app.models.erp_documents import ActivityLog
    db.expire_all()
    return db.query(ActivityLog).filter(ActivityLog.entity_type == entidad, ActivityLog.entity_id == entity_id,
                                        ActivityLog.action == "ESTADO_CHANGED").all()


def test_patch_solicitud_rechaza_un_estado_de_pedido(app_client, db, admin_token):
    sc = _sc(db, "SC-EST001")
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={"estado": "FACTURADO"}, headers=auth(admin_token))
    assert resp.status_code == 400, resp.text
    assert resp.json()["detail"] == "El estado «Facturado» no se puede asignar a mano a una solicitud; solo «Borrador»."
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={"estado": "COTIZADA"}, headers=auth(admin_token))
    assert resp.status_code == 400, resp.text
    db.refresh(sc)
    assert sc.estado == "BORRADOR"
    assert _cambios_de_estado(db, "SC", sc.id) == []


def test_patch_solicitud_sigue_permitiendo_borrador_y_el_mismo_estado(app_client, db, admin_token):
    sc = _sc(db, "SC-EST002")
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={"estado": "BORRADOR", "notas": "x"},
                            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    # Una SC en un estado del flujo (COTIZADA) acepta que se le reenvie su propio estado con otros cambios.
    sc2 = _sc(db, "SC-EST002B", estado="COTIZADA")
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc2.id}", json={"estado": "COTIZADA", "notas": "x"},
                            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text


def test_patch_cotizacion_rechaza_estados_de_pedido(app_client, db, admin_token):
    cot = _cot(db, "COT-EST003")
    for estado, etiqueta in (("ENTREGADO", "Entregado"), ("FACTURADO", "Facturado"), ("EN_PROCESO", "En proceso")):
        resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot.id}", json={"estado": estado},
                                headers=auth(admin_token))
        assert resp.status_code == 400, (estado, resp.text)
        assert resp.json()["detail"] == f"El estado «{etiqueta}» no se puede asignar a mano a una cotización."
    # Choque H50 vs N5: ENVIADA tampoco (gana H50).
    resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot.id}", json={"estado": "ENVIADA"}, headers=auth(admin_token))
    assert resp.status_code == 400, resp.text
    db.refresh(cot)
    assert cot.estado == "BORRADOR"
    for estado in ("VENCIDA", "BORRADOR", "RECHAZADA"):
        resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot.id}", json={"estado": estado},
                                headers=auth(admin_token))
        assert resp.status_code == 200, (estado, resp.text)


def test_no_se_puede_rechazar_una_cotizacion_con_pedido_vigente(app_client, db, admin_token):
    from app.models.erp_documents import SaleOrder
    sc = _sc(db, "SC-EST004", estado="CONFIRMADA")
    cot = _cot(db, "COT-EST004", estado="CONFIRMADA", sc_id=sc.id, sc_numero=sc.numero)
    ven = SaleOrder(numero="PVEN-EST004", cot_id=cot.id, sc_id=sc.id, customer_name="Cliente Prueba",
                    estado="PENDIENTE_COMPRA")
    db.add(ven); db.commit()
    resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot.id}", json={"estado": "RECHAZADA"}, headers=auth(admin_token))
    assert resp.status_code == 409, resp.text
    assert "PVEN-EST004" in resp.json()["detail"]
    db.refresh(cot); db.refresh(sc)
    assert cot.estado == "CONFIRMADA" and sc.estado == "CONFIRMADA"

    ven.estado = "CANCELADO"
    db.commit()
    resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot.id}", json={"estado": "RECHAZADA"}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text


def test_reenviar_el_mismo_estado_de_la_cotizacion_no_falla_aunque_tenga_pedido(app_client, db, admin_token):
    from app.models.erp_documents import SaleOrder
    cot = _cot(db, "COT-EST005", estado="ENVIADA")
    db.add(SaleOrder(numero="PVEN-EST005", cot_id=cot.id, customer_name="Cliente Prueba", estado="PENDIENTE_COMPRA"))
    db.commit()
    resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot.id}", json={"estado": "ENVIADA", "notas": "x"},
                            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    db.refresh(cot)
    assert cot.estado == "ENVIADA" and cot.notas == "x"
