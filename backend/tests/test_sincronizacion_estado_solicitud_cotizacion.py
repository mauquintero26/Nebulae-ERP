import uuid
from app.models.erp_documents import SalesQuotation
from app.db.database import get_db
from sqlalchemy.orm import Session


def _headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


def _crear_solicitud_y_confirmar(client, admin_token):
    sc = client.post("/api/v1/ventas/solicitudes", json={
        "customer_name": f"Cliente-{uuid.uuid4().hex[:6]}",
        "tipo_solicitud": "Cotizacion de Producto",
    }, headers=_headers(admin_token)).json()["data"]
    r = client.post(f"/api/v1/ventas/solicitudes/{sc['id']}/confirmar", json={}, headers=_headers(admin_token))
    return sc, r.json()["data"]["cotizacion"]


class TestSincronizacionEstados:

    def test_crear_cotizacion_deja_solicitud_en_cotizada_no_confirmada(self, app_client, admin_token):
        sc, cot = _crear_solicitud_y_confirmar(app_client, admin_token)
        r = app_client.get(f"/api/v1/ventas/solicitudes/{sc['id']}", headers=_headers(admin_token))
        assert r.json()["data"]["estado"] == "COTIZADA"

    def test_enviar_cotizacion_deja_solicitud_en_espera_confirmacion(self, app_client, admin_token):
        sc, cot = _crear_solicitud_y_confirmar(app_client, admin_token)
        app_client.patch(f"/api/v1/ventas/cotizaciones/{cot['id']}", json={"estado": "ENVIADA"}, headers=_headers(admin_token))
        r = app_client.get(f"/api/v1/ventas/solicitudes/{sc['id']}", headers=_headers(admin_token))
        assert r.json()["data"]["estado"] == "EN_ESPERA_CONFIRMACION"

    def test_confirmar_cotizacion_manualmente_deja_solicitud_confirmada(self, app_client, admin_token):
        sc, cot = _crear_solicitud_y_confirmar(app_client, admin_token)
        app_client.patch(f"/api/v1/ventas/cotizaciones/{cot['id']}", json={"estado": "CONFIRMADA"}, headers=_headers(admin_token))
        r = app_client.get(f"/api/v1/ventas/solicitudes/{sc['id']}", headers=_headers(admin_token))
        assert r.json()["data"]["estado"] == "CONFIRMADA"

    def test_rechazar_cotizacion_deja_solicitud_rechazada(self, app_client, admin_token):
        sc, cot = _crear_solicitud_y_confirmar(app_client, admin_token)
        app_client.patch(f"/api/v1/ventas/cotizaciones/{cot['id']}", json={"estado": "RECHAZADA"}, headers=_headers(admin_token))
        r = app_client.get(f"/api/v1/ventas/solicitudes/{sc['id']}", headers=_headers(admin_token))
        assert r.json()["data"]["estado"] == "RECHAZADA"

    def test_sincronizacion_noop_cuando_cot_sin_sc_id(self, db: Session):
        """Verifica que _sincronizar no crashea cuando cotizacion no tiene sc_id"""
        from app.api.v1.erp_ventas import _sincronizar_estado_solicitud_desde_cotizacion

        # Crear cotizacion sin sc_id
        cot = SalesQuotation(
            numero="COT-TEST-NOOP-1",
            estado="BORRADOR",
            customer_name="Test Customer",
        )
        db.add(cot)
        db.commit()

        # No debe crashear
        _sincronizar_estado_solicitud_desde_cotizacion(cot, db)

        # Verificar que no cambio nada
        db.refresh(cot)
        assert cot.estado == "BORRADOR"

    def test_sincronizacion_noop_con_estado_no_reconocido(self, db: Session):
        """Verifica que _sincronizar no crashea con un estado no mapeado"""
        from app.api.v1.erp_ventas import _sincronizar_estado_solicitud_desde_cotizacion

        # Crear cotizacion con estado no mapeado
        cot = SalesQuotation(
            numero="COT-TEST-UNMAPPED",
            estado="ESTADO_INEXISTENTE",
            customer_name="Test Customer",
        )
        db.add(cot)
        db.commit()

        # No debe crashear
        _sincronizar_estado_solicitud_desde_cotizacion(cot, db)

        # Verificar que no cambio nada
        db.refresh(cot)
        assert cot.estado == "ESTADO_INEXISTENTE"
