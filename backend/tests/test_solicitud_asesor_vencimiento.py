import datetime
import uuid


def _headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


class TestAsesorYVencimiento:

    def test_vencimiento_por_defecto_es_5_dias(self, app_client, admin_token):
        r = app_client.post("/api/v1/ventas/solicitudes", json={
            "customer_name": f"Cliente-{uuid.uuid4().hex[:6]}",
            "tipo_solicitud": "Cotizacion de Producto",
        }, headers=_headers(admin_token))
        assert r.status_code == 201
        venc = datetime.datetime.fromisoformat(r.json()["data"]["fecha_vencimiento"].replace("Z", ""))
        esperado = datetime.datetime.utcnow() + datetime.timedelta(days=5)
        assert abs((venc - esperado).total_seconds()) < 60

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
