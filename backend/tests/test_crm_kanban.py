"""B4 T20 (KANBAN-crm puntos 1 y 2 con R5, R21; RP73 punto 4; RP103): GET /crm/pipeline-stages para el ASESOR, GET
/crm/leads con `perdidos` (excluir | incluir | solo) y `sc_id` en los dicts de los leads.

Se corre SOLO con el runner de ROLLBACK (python tests/rollback_runner.py test_crm_kanban): cada prueba va en una
transaccion que se revierte. Los clientes llevan un apellido unico (uuid) y los leads se buscan por ese apellido
(`search`), asi la base compartida no estorba.
"""
import uuid

from app.api.v1.crm import PipelineStage
from app.models.customers import Customer
from app.models.erp_documents import CustomerRequest
from app.models.sales import SalesOrder

RUTA = "/api/v1/crm/leads"
ERROR_PERDIDOS = "El filtro de perdidos «{}» no existe: usa excluir, incluir o solo."
CONTROL = "La búsqueda no puede llevar caracteres de control."
CONTROL_PERDIDOS = "El filtro «perdidos» no puede llevar caracteres de control."   # T20 r1 (m11)


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _cliente(db):
    sufijo = uuid.uuid4().hex[:8]
    c = Customer(first_name="Kanban", last_name=f"Cliente{sufijo}", email=f"kanban-{sufijo}@test.nebulae")
    db.add(c)
    db.commit()
    return c, sufijo


def _lead(db, cliente, status="DRAFT", **campos):
    lead = SalesOrder(customer_id=cliente.id, status=status, sale_type="ON_DEMAND", **campos)
    db.add(lead)
    db.commit()
    return lead


def _leads(app_client, token, **params):
    resp = app_client.get(RUTA, params=params, headers=_auth(token))
    assert resp.status_code == 200, resp.text
    return resp.json()


# 1) El asesor lee las etapas (RP73 punto 4: la prueba crea su propia etapa dentro de la transaccion revertida).
def test_asesor_lee_las_etapas(app_client, db, vendedor_token):
    nombre = f"Etapa T20 {uuid.uuid4().hex[:8]}"
    db.add(PipelineStage(name=nombre, color="bg-teal-500", bg_color="bg-teal-50", position=9999,
                         maps_to_status="DRAFT"))
    db.commit()
    resp = app_client.get("/api/v1/crm/pipeline-stages", headers=_auth(vendedor_token))
    assert resp.status_code == 200, resp.text
    etapas = resp.json()["data"]
    assert etapas, "una lista no vacia"
    propia = [e for e in etapas if e["name"] == nombre]
    assert len(propia) == 1
    assert propia[0]["color"] == "bg-teal-500" and propia[0]["maps_to_status"] == "DRAFT"
    # /config sigue siendo solo del ADMIN (no se cambia)
    assert app_client.get("/api/v1/crm/pipeline-stages/config", headers=_auth(vendedor_token)).status_code == 403


# 2) Los leads perdidos (R21: validado a mano, 422 por igualdad)
def test_leads_perdidos(app_client, db, admin_token, vendedor_token):
    c, sufijo = _cliente(db)
    activo = _lead(db, c, "DRAFT")
    perdido = _lead(db, c, "CANCELLED")
    ids = lambda cuerpo: sorted(x["id"] for x in cuerpo["data"])

    sin = _leads(app_client, admin_token, search=sufijo)
    assert ids(sin) == [activo.id] and sin["total"] == 1                    # sin parametro: solo el activo (hoy)
    assert ids(_leads(app_client, admin_token, search=sufijo, perdidos="excluir")) == [activo.id]
    solo = _leads(app_client, admin_token, search=sufijo, perdidos="solo")
    assert ids(solo) == [perdido.id] and solo["total"] == 1
    assert solo["data"][0]["status"] == "CANCELLED"
    los_dos = _leads(app_client, admin_token, search=sufijo, perdidos="incluir")
    assert ids(los_dos) == sorted([activo.id, perdido.id]) and los_dos["total"] == 2
    # el valor se recorta y en blanco es el de siempre
    assert ids(_leads(app_client, admin_token, search=sufijo, perdidos="  solo ")) == [perdido.id]
    assert ids(_leads(app_client, admin_token, search=sufijo, perdidos="")) == [activo.id]
    # el ASESOR tambien
    assert ids(_leads(app_client, vendedor_token, search=sufijo, perdidos="incluir")) == sorted([activo.id, perdido.id])
    # limit=0 devuelve solo el total, tambien con perdidos
    solo_total = _leads(app_client, admin_token, search=sufijo, perdidos="incluir", limit=0)
    assert solo_total["data"] == [] and solo_total["total"] == 2

    casos = [("x", ERROR_PERDIDOS.format("x")), ("SOLO", ERROR_PERDIDOS.format("SOLO")),
             ("incluir,solo", ERROR_PERDIDOS.format("incluir,solo")),
             ("z" * 2000, ERROR_PERDIDOS.format("z" * 40)), ("so\x00lo", CONTROL_PERDIDOS), ("\x07", CONTROL_PERDIDOS)]
    for valor, texto in casos:
        resp = app_client.get(RUTA, params={"search": sufijo, "perdidos": valor}, headers=_auth(admin_token))
        assert resp.status_code == 422, (valor, resp.status_code, resp.text)
        assert resp.json()["detail"] == texto, valor


# 3) El lead trae sc_id (RP103: tambien el de POST /crm/leads)
def test_lead_trae_sc_id(app_client, db, admin_token):
    c, sufijo = _cliente(db)
    sc = CustomerRequest(numero=f"SC-T20{sufijo.upper()}", customer_name=f"Kanban {sufijo}", estado="BORRADOR",
                         tipo_solicitud="Cotizacion de Producto")
    db.add(sc)
    db.commit()
    con = _lead(db, c, "DRAFT", canonical_customer_request_id=sc.id, lead_description="con solicitud")
    sin = _lead(db, c, "DRAFT", lead_description="sin solicitud")
    por_id = {x["id"]: x for x in _leads(app_client, admin_token, search=sufijo)["data"]}
    assert por_id[con.id]["sc_id"] == sc.id
    assert "sc_id" in por_id[sin.id] and por_id[sin.id]["sc_id"] is None
    # la respuesta de POST /crm/leads tambien lo trae (el chip «Con solicitud» sin recargar)
    resp = app_client.post("/api/v1/crm/leads", json={"customer_id": c.id, "sc_id": sc.id,
                                                      "solicitud_tipo": "Cotizacion de Producto"},
                           headers=_auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["sc_id"] == sc.id
    resp = app_client.post("/api/v1/crm/leads", json={"customer_id": c.id, "solicitud_tipo": "Cotizacion de Producto"},
                           headers=_auth(admin_token))
    assert resp.json()["data"]["sc_id"] is None
