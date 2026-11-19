import datetime
import uuid

from app.core.fechas import hoy_colombia


def _headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


class TestAsesorYVencimiento:

    def test_vencimiento_por_defecto_es_5_dias(self, app_client, admin_token):
        r = app_client.post("/api/v1/ventas/solicitudes", json={"customer_name": f"Cliente-{uuid.uuid4().hex[:6]}",
                            "tipo_solicitud": "Cotizacion de Producto"}, headers=_headers(admin_token))
        assert r.status_code == 201
        # B4.1 (P8): un dia de negocio, las 00:00 del dia de Colombia + 5 (antes, utcnow + 5 dias: un instante).
        assert r.json()["data"]["fecha_vencimiento"] == f"{hoy_colombia() + datetime.timedelta(days=5)}T00:00:00"

    def test_vencimiento_de_una_sc_creada_de_noche_es_el_dia_de_colombia(self, app_client, admin_token, monkeypatch):
        """Review Focus 2: el 19 de noviembre a las 22:30 en Colombia (20 a las 03:30 UTC) vence el 24, no el 25."""
        from app.api.v1 import erp_ventas
        monkeypatch.setattr(erp_ventas, "ahora_utc", lambda: datetime.datetime(2026, 11, 20, 3, 30))
        r = app_client.post("/api/v1/ventas/solicitudes", json={"customer_name": f"Cliente-{uuid.uuid4().hex[:6]}"},
                            headers=_headers(admin_token))
        assert r.json()["data"]["fecha_vencimiento"] == "2026-11-24T00:00:00", r.text

    def test_advisor_user_id_se_guarda_y_se_devuelve(self, app_client, admin_token, user_admin):
        r = app_client.post("/api/v1/ventas/solicitudes", json={
            "customer_name": f"Cliente-{uuid.uuid4().hex[:6]}",
            "tipo_solicitud": "Cotizacion de Producto",
            "advisor_user_id": user_admin.id,
        }, headers=_headers(admin_token))
        assert r.status_code == 201
        assert r.json()["data"]["advisor_user_id"] == user_admin.id

    def test_advisor_user_id_vacio_no_causa_500(self, app_client, admin_token):
        """Reproduce el bug reportado: el formulario de 'Nueva Solicitud' envia
        advisor_user_id: '' (string vacio) cuando no se selecciona asesor, porque
        es un campo opcional. El endpoint debe tratarlo como ausente (None), no
        intentar insertarlo tal cual en una columna Integer."""
        r = app_client.post("/api/v1/ventas/solicitudes", json={
            "customer_name": f"Cliente-{uuid.uuid4().hex[:6]}",
            "tipo_solicitud": "Cotizacion de Producto",
            "advisor_user_id": "",
            "asignado_a_user_id": "",
        }, headers=_headers(admin_token))
        assert r.status_code == 201, r.text
        assert r.json()["data"]["advisor_user_id"] is None
