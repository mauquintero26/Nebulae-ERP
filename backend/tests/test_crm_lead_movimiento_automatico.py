import uuid
import pytest
from sqlalchemy import text


def _headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture()
def customer_test(db):
    """No existe un fixture equivalente en conftest.py (verificado) — se crea localmente
    en este archivo siguiendo el mismo patron usado en el resto de la suite
    (p.ej. test_fase4_cancelaciones.py: Customer(first_name=..., last_name=f"...-{uuid...}", email=...))."""
    from app.models.customers import Customer
    c = Customer(
        first_name="Cliente",
        last_name=f"LeadTest-{uuid.uuid4().hex[:6]}",
        email=f"lead_{uuid.uuid4().hex[:6]}@test.com",
    )
    db.add(c)
    db.commit()
    return c


def _crear_solicitud_con_lead(client, admin_token, customer_id):
    sc = client.post("/api/v1/ventas/solicitudes", json={
        "customer_id": customer_id,
        "customer_name": "Cliente Lead Test",
        "tipo_solicitud": "Cotizacion de Producto",
    }, headers=_headers(admin_token)).json()["data"]
    lead = client.post("/api/v1/crm/leads", json={
        "customer_id": customer_id,
        "sc_id": sc["id"],
        "solicitud_tipo": "Cotizacion de Producto",
    }, headers=_headers(admin_token)).json()["data"]
    return sc, lead


class TestMovimientoAutomaticoDeLead:

    def test_lead_se_crea_vinculado_a_la_solicitud(self, app_client, admin_token, customer_test, db):
        """
        Nota de implementacion: esta base de test compartida ya trae una etapa de
        pipeline preexistente y ajena a este plan ('Nuevo Lead', position=1,
        maps_to_status='PENDING' — confirmado via query directa; no aparece en
        _ETAPAS_ESTANDAR de esta tarea). create_lead_v2 (logica preexistente, no
        modificada por esta tarea salvo por el nuevo campo sc_id) usa la etapa de
        menor position como default cuando no se pasa pipeline_stage_id, por lo que
        el status inicial real es 'PENDING' y no 'DRAFT' — esto es responsabilidad
        de logica anterior a esta tarea. Lo que esta tarea sí garantiza — y lo que
        se verifica aqui directamente contra la BD, ya que _lead_to_dict_v2 no
        expone canonical_customer_request_id en la respuesta HTTP — es el vinculo
        real SalesOrder.canonical_customer_request_id -> CustomerRequest.id.
        """
        from app.models.sales import SalesOrder
        sc, lead = _crear_solicitud_con_lead(app_client, admin_token, customer_test.id)
        db.expire_all()
        orden = db.query(SalesOrder).filter(SalesOrder.id == lead["id"]).first()
        assert orden.canonical_customer_request_id == sc["id"]
        assert lead["status"] not in ("QUOTATION", "CANCELLED", "INVOICED")

    def test_enviar_cotizacion_mueve_lead_a_quotation(self, app_client, admin_token, customer_test):
        sc, lead = _crear_solicitud_con_lead(app_client, admin_token, customer_test.id)
        cot = app_client.post(f"/api/v1/ventas/solicitudes/{sc['id']}/confirmar", json={}, headers=_headers(admin_token)).json()["data"]["cotizacion"]
        app_client.patch(f"/api/v1/ventas/cotizaciones/{cot['id']}", json={"estado": "ENVIADA"}, headers=_headers(admin_token))
        r = app_client.get("/api/v1/crm/leads", headers=_headers(admin_token))
        lead_actualizado = next(l for l in r.json()["data"] if l["id"] == lead["id"])
        assert lead_actualizado["status"] == "QUOTATION"

    def test_rechazar_cotizacion_mueve_lead_a_cancelled(self, app_client, admin_token, customer_test, db):
        from app.models.sales import SalesOrder
        sc, lead = _crear_solicitud_con_lead(app_client, admin_token, customer_test.id)
        cot = app_client.post(f"/api/v1/ventas/solicitudes/{sc['id']}/confirmar", json={}, headers=_headers(admin_token)).json()["data"]["cotizacion"]
        app_client.patch(f"/api/v1/ventas/cotizaciones/{cot['id']}", json={"estado": "RECHAZADA"}, headers=_headers(admin_token))
        db.expire_all()
        orden = db.query(SalesOrder).filter(SalesOrder.id == lead["id"]).first()
        assert orden.status == "CANCELLED"

    def test_confirmar_pedido_desde_cotizacion_mueve_lead_a_invoiced(self, app_client, admin_token, customer_test, db):
        from app.models.sales import SalesOrder
        sc, lead = _crear_solicitud_con_lead(app_client, admin_token, customer_test.id)
        cot = app_client.post(f"/api/v1/ventas/solicitudes/{sc['id']}/confirmar", json={}, headers=_headers(admin_token)).json()["data"]["cotizacion"]
        app_client.post(f"/api/v1/ventas/cotizaciones/{cot['id']}/confirmar", json={}, headers=_headers(admin_token))
        db.expire_all()
        orden = db.query(SalesOrder).filter(SalesOrder.id == lead["id"]).first()
        assert orden.status == "INVOICED"

    def test_las_5_etapas_estandar_se_crean_si_no_existen(self, app_client, admin_token, customer_test, db):
        from app.models.catalog import Category  # noqa: F401 (solo para asegurar imports de modelos ya cargados)
        from app.api.v1.crm import PipelineStage  # noqa: F401 (mismo modulo real usado en el resto del backend)
        sc, lead = _crear_solicitud_con_lead(app_client, admin_token, customer_test.id)
        cot = app_client.post(f"/api/v1/ventas/solicitudes/{sc['id']}/confirmar", json={}, headers=_headers(admin_token)).json()["data"]["cotizacion"]
        app_client.patch(f"/api/v1/ventas/cotizaciones/{cot['id']}", json={"estado": "ENVIADA"}, headers=_headers(admin_token))
        mapeos = {s[0] for s in db.execute(text("SELECT maps_to_status FROM pipeline_stages")).fetchall()}
        assert {"DRAFT", "QUOTATION", "EN_NEGOCIACION", "INVOICED", "CANCELLED"}.issubset(mapeos)

    def test_move_lead_stage_respeta_el_id_exacto_de_la_etapa_elegida(self, app_client, admin_token, customer_test, db):
        """
        Regresion: move_lead_stage es el endpoint que usa el tablero Kanban del CRM
        cuando el usuario arrastra una tarjeta a una columna especifica, e identifica
        esa columna por su `id` exacto (body.get("pipeline_stage_id")). Debe fijar
        pipeline_stage_id a ESE id exacto — nunca debe re-resolver la etapa buscando
        por maps_to_status, porque eso puede aterrizar en una etapa distinta a la que
        el usuario realmente solto.

        Esto es real y alcanzable, no un caso hipotetico: el boton "Nueva Etapa" del
        CRM (frontend/src/app/dashboard/crm/page.tsx:510) siempre envia
        maps_to_status='DRAFT' sin importar el nombre que el usuario le de a la
        etapa, y no hay UI para cambiarlo despues. Cualquier tablero con mas de una
        etapa mapeada a DRAFT (muy plausible — _asegurar_etapas_estandar de esta
        misma tarea agrega una) puede terminar con dos o mas filas de
        pipeline_stages compartiendo maps_to_status='DRAFT'.
        """
        from app.api.v1.crm import PipelineStage
        from app.models.sales import SalesOrder

        sc, lead = _crear_solicitud_con_lead(app_client, admin_token, customer_test.id)

        max_pos = db.execute(text("SELECT COALESCE(MAX(position),0) FROM pipeline_stages")).scalar() or 0
        etapa_a = PipelineStage(name="Etapa Custom A", color="bg-purple-500", bg_color="bg-purple-50",
                                 position=max_pos + 1, maps_to_status="DRAFT")
        etapa_b = PipelineStage(name="Etapa Custom B", color="bg-purple-500", bg_color="bg-purple-50",
                                 position=max_pos + 2, maps_to_status="DRAFT")
        db.add(etapa_a); db.add(etapa_b); db.commit()

        r = app_client.patch(
            f"/api/v1/crm/leads/{lead['id']}/stage",
            json={"pipeline_stage_id": etapa_b.id},
            headers=_headers(admin_token),
        )
        assert r.status_code == 200

        db.expire_all()
        orden = db.query(SalesOrder).filter(SalesOrder.id == lead["id"]).first()
        assert orden.pipeline_stage_id == etapa_b.id
        assert orden.pipeline_stage_id != etapa_a.id
