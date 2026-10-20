"""Test for alertas resumen endpoint (global alert for late documents)."""
import pytest
from datetime import datetime, timedelta
from app.models.erp_documents import CustomerRequest, SalesQuotation, SaleOrder


def test_alertas_resumen_cuenta_atrasados(app_client, db, admin_token):
    """Test that alertas/resumen counts late documents across SC, COT, VEN."""
    # Create a late CustomerRequest (10 days old)
    viejo_sc = CustomerRequest(
        numero="SC-ALERTOLD",
        customer_name="X",
        estado="BORRADOR",
        updated_at=datetime.utcnow() - timedelta(days=10),
    )
    # Create a recent CustomerRequest (new)
    nuevo_sc = CustomerRequest(
        numero="SC-ALERTNEW",
        customer_name="Y",
        estado="BORRADOR",
        updated_at=datetime.utcnow(),
    )

    db.add_all([viejo_sc, nuevo_sc])
    db.commit()

    # Make request to endpoint with admin token
    headers = {"Authorization": f"Bearer {admin_token}"}
    resp = app_client.get("/api/v1/ventas/alertas/resumen", headers=headers)

    # Should return 200 and count at least the old SC
    assert resp.status_code == 200
    data = resp.json()
    assert "data" in data
    assert "atrasados" in data["data"]
    assert data["data"]["atrasados"] >= 1


def test_alertas_resumen_multiple_documentos(app_client, db, admin_token):
    """Test counting across all three document types."""
    # Create old documents across all three types
    viejo_sc = CustomerRequest(
        numero="SC-OLD-001",
        customer_name="Test",
        estado="PENDIENTE_CONFIRMACION",
        updated_at=datetime.utcnow() - timedelta(days=5),
    )
    viejo_cot = SalesQuotation(
        numero="COT-OLD-001",
        customer_name="Test",
        estado="ENVIADA",
        updated_at=datetime.utcnow() - timedelta(days=5),
    )
    viejo_ven = SaleOrder(
        numero="VEN-OLD-001",
        customer_name="Test",
        estado="EN_PROCESO",
        updated_at=datetime.utcnow() - timedelta(days=5),
    )

    db.add_all([viejo_sc, viejo_cot, viejo_ven])
    db.commit()

    headers = {"Authorization": f"Bearer {admin_token}"}
    resp = app_client.get("/api/v1/ventas/alertas/resumen", headers=headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data["data"]["atrasados"] >= 3


def test_alertas_resumen_cuenta_confirmados_sin_accion_del_asesor(app_client, db, admin_token):
    """Final whole-branch review (hallazgo #4): antes, no_resolucion trataba CONFIRMADA
    como "resuelto" para SC y COT -- pero una SC/COT CONFIRMADA con la marca de
    procedencia (gate1_confirmed_at/gate2_confirmed_at) todavia puesta es exactamente
    el documento donde el cliente YA actuo y el asesor todavia no -- la prioridad mas
    alta posible, y el badge no las veia. Se usa un umbral viejo (updated_at antiguo,
    mismo criterio que el resto de este archivo) para que cuenten como atrasadas."""
    viejo = datetime.utcnow() - timedelta(days=10)

    sc_confirmada = CustomerRequest(
        numero="SC-ALERTCONF1", customer_name="Test", estado="CONFIRMADA",
        gate1_confirmed_at=viejo, updated_at=viejo,
    )
    cot_confirmada_sin_pven = SalesQuotation(
        numero="COT-ALERTCONF1", customer_name="Test", estado="CONFIRMADA",
        gate2_confirmed_at=viejo, updated_at=viejo,
    )
    db.add_all([sc_confirmada, cot_confirmada_sin_pven])
    db.commit(); db.refresh(cot_confirmada_sin_pven)

    # Negativo: COT CONFIRMADA con marca, pero YA tiene un Pedido de Venta vinculado --
    # el asesor YA actuo, no deberia contar como "sin accion".
    cot_confirmada_con_pven = SalesQuotation(
        numero="COT-ALERTCONF2", customer_name="Test", estado="CONFIRMADA",
        gate2_confirmed_at=viejo, updated_at=viejo,
    )
    db.add(cot_confirmada_con_pven)
    db.commit(); db.refresh(cot_confirmada_con_pven)
    so = SaleOrder(numero="PVEN-ALERTCONF1", cot_id=cot_confirmada_con_pven.id,
                    customer_name="Test", estado="PENDIENTE_COMPRA")
    db.add(so); db.commit()

    headers = {"Authorization": f"Bearer {admin_token}"}
    resp_antes = app_client.get("/api/v1/ventas/alertas/resumen", headers=headers)
    assert resp_antes.status_code == 200
    atrasados_antes = resp_antes.json()["data"]["atrasados"]

    # Elimina las dos que SI deberian contar y vuelve a consultar -- la diferencia debe
    # ser exactamente 2 (no cuenta la tercera, que ya tiene PVEN).
    db.delete(sc_confirmada); db.delete(cot_confirmada_sin_pven); db.commit()
    resp_despues = app_client.get("/api/v1/ventas/alertas/resumen", headers=headers)
    atrasados_despues = resp_despues.json()["data"]["atrasados"]

    assert atrasados_antes - atrasados_despues == 2


def test_alertas_resumen_separa_los_cambios_de_solicitudes_y_cotizaciones(app_client, db, admin_token, user_admin,
                                                                          user_vendedor, vendedor_token):
    """B3 T18 r1: alertas_resumen trae cambios_cliente_sc y cambios_cliente_cot por separado (la pastilla del menu
    lleva a la lista de cada uno); cambios_cliente sigue siendo la suma, por compatibilidad. Mismo filtro que la
    cuenta unica (C9): la SC en Asignada o Nueva y la COT en Borrador con la marca, y un asesor ve solo las suyas (la
    SC por su advisor_user_id; la COT por el asesor de su SC). Es una cuenta aparte de 'atrasados' (C22)."""
    import uuid
    sufijo = uuid.uuid4().hex[:8].upper()
    headers = lambda token: {"Authorization": f"Bearer {token}"}

    def resumen(token):
        resp = app_client.get("/api/v1/ventas/alertas/resumen", headers=headers(token))
        assert resp.status_code == 200, resp.text
        return resp.json()["data"]

    antes, antes_asesor = resumen(admin_token), resumen(vendedor_token)
    ahora = datetime.utcnow()
    marca = dict(cambios_cliente_at=ahora, cambios_cliente_tipo="CAMBIOS", cambios_cliente_comentario="Son 8, no 6")
    sc_propia = CustomerRequest(numero=f"SC-R1A{sufijo}", customer_name="X", estado="ASIGNADA",
                                advisor_user_id=user_vendedor.id, **marca)
    sc_ajena = CustomerRequest(numero=f"SC-R1B{sufijo}", customer_name="Y", estado="ASIGNADA",
                               advisor_user_id=user_admin.id, **marca)
    sc_de_la_cot = CustomerRequest(numero=f"SC-R1C{sufijo}", customer_name="Z", estado="CONFIRMADA",
                                   advisor_user_id=user_vendedor.id)
    db.add_all([sc_propia, sc_ajena, sc_de_la_cot])
    db.commit()
    cot = SalesQuotation(numero=f"COT-R1A{sufijo}", customer_name="Z", estado="BORRADOR", sc_id=sc_de_la_cot.id,
                         sc_numero=sc_de_la_cot.numero, **marca)
    # Con la marca pero ya reenviada (fuera de Borrador): no cuenta.
    cot_reenviada = SalesQuotation(numero=f"COT-R1B{sufijo}", customer_name="Z", estado="PENDIENTE_CONFIRMACION",
                                   sc_id=sc_de_la_cot.id, sc_numero=sc_de_la_cot.numero, **marca)
    db.add_all([cot, cot_reenviada])
    db.commit()

    d = resumen(admin_token)
    assert d["cambios_cliente_sc"] == antes["cambios_cliente_sc"] + 2
    assert d["cambios_cliente_cot"] == antes["cambios_cliente_cot"] + 1
    assert d["cambios_cliente"] == d["cambios_cliente_sc"] + d["cambios_cliente_cot"]
    assert d["atrasados"] == antes["atrasados"]
    a = resumen(vendedor_token)
    assert a["cambios_cliente_sc"] == antes_asesor["cambios_cliente_sc"] + 1
    assert a["cambios_cliente_cot"] == antes_asesor["cambios_cliente_cot"] + 1
    assert a["cambios_cliente"] == a["cambios_cliente_sc"] + a["cambios_cliente_cot"]
