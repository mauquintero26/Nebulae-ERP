"""U15 (Bloque 2, T2A): la solicitud cuenta solo su propia historia.

- Estados que se asignan: Nueva (BORRADOR), Asignada, Pendiente por confirmación, Confirmada y Cancelada. Los de antes
  (Cotizada, En espera de confirmación, Rechazada, Vencida) quedan como heredados: solo historial.
- Crear, enviar, confirmar o reabrir la cotización, o cancelar su pedido, NO cambia la solicitud. Dos excepciones:
  la COT confirmada por el cliente confirma una solicitud sin confirmar (o heredada), y rechazar la única COT activa
  con la solicitud Confirmada sin confirmación vigente (o en un estado heredado, R29) la devuelve a Asignada / Nueva.
- Actividad de la SC: COTIZACION_CREADA y COTIZACION_RECHAZADA (sin old/new); textos del rechazo por estado (R21).
- _sc_dict trae confirmacion_vigente (CONFIRMADA y gate1), con el helper _confirmacion_vigente_sc.
- update_solicitud: textos de C5 (400, 409 con 'reiniciar' y 'Estado cambiado a Nueva (asesor retirado)').
- scripts/ajustar_estados_solicitud.py: ajustar (estados heredados) y ajustar_leads (leads perdidos de solicitudes
  vivas), con la exclusion de los documentos reales (R32) y la CLI con --base (B9).
La prueba 2 de U15 (paridad con el frontend: frontend/src/lib/estados-solicitud.js) la agrego T6A (R16), junto con la
paridad de pctAnticipoDeModalidad (frontend/src/lib/etiquetas-solicitud.js) con ventas_dinero (C16).

Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_estados_solicitud
"""
import contextlib
import datetime
import hashlib
import io
import json
import shutil
import subprocess
import uuid
from pathlib import Path

import pytest

LINEA = {"product_name": "Cuna Colecho", "qty": 1}
LINEA_CON_PRECIO = {"product_name": "Cuna Colecho", "qty": 1, "unit_price_cop": 1000, "total_cop": 1000}
CREDITO = "Crédito 30 días"  # anticipo 0: crear el pedido no pide verificacion (N1)
TABLA_ESTADOS_TEST = "customer_requests_respaldo_estados_test"
TABLA_LEADS_TEST = "sales_orders_respaldo_leads_test"
AUTOR_AJUSTE = "Sistema (ajuste de estados)"
AHORA = datetime.datetime.utcnow


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _sc(db, numero, user_admin, con_asesor=True, **campos):
    from app.models.erp_documents import CustomerRequest
    campos.setdefault("estado", "CONFIRMADA")
    campos.setdefault("productos", [LINEA])
    if con_asesor:
        campos.setdefault("advisor_user_id", user_admin.id)
        campos.setdefault("advisor_name", user_admin.email)
    sc = CustomerRequest(numero=numero, customer_name="Cliente Prueba", **campos)
    db.add(sc); db.commit(); db.refresh(sc)
    return sc


def _cot(db, numero, sc, **campos):
    from app.models.erp_documents import SalesQuotation
    campos.setdefault("estado", "BORRADOR")
    cot = SalesQuotation(numero=numero, sc_id=sc.id, sc_numero=sc.numero, customer_name="Cliente Prueba", **campos)
    db.add(cot); db.commit(); db.refresh(cot)
    return cot


def _lead(db, sc, status="CANCELLED", pipeline_stage_id=None, **campos):
    from app.models.customers import Customer
    from app.models.sales import SalesOrder
    cliente = Customer(first_name="Cliente", last_name="U15", email=f"u15-{uuid.uuid4().hex[:8]}@test.nebulae")
    db.add(cliente); db.commit()
    lead = SalesOrder(customer_id=cliente.id, status=status, canonical_customer_request_id=sc.id, lead_source="SC",
                      lead_description=f"SC creada: {sc.numero}", pipeline_stage_id=pipeline_stage_id, **campos)
    db.add(lead); db.commit(); db.refresh(lead)
    return lead


def _cancelada_y_restaurada(db, sc):
    """La Actividad de una SC que se cancelo (lo que deja cancelar_solicitud) y despues se restauro."""
    from app.models.erp_documents import ActivityLog
    db.add(ActivityLog(entity_type="SC", entity_id=sc.id, entity_numero=sc.numero, action="CANCELLED",
                       description="Cancelada: prueba", old_estado="ASIGNADA", new_estado="CANCELADA", user_name="t"))
    db.add(ActivityLog(entity_type="SC", entity_id=sc.id, entity_numero=sc.numero, action="RESTORED",
                       description="Solicitud restaurada a Asignada", old_estado="CANCELADA", new_estado=sc.estado,
                       user_name="t"))
    db.commit()


def _crear_cot(app_client, token, sc_id):
    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc_id}/confirmar", json={"user_name": "t"},
                           headers=auth(token))
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["cotizacion"]


def _patch_cot(app_client, token, cot_id, **body):
    body.setdefault("updated_by", "t")
    return app_client.patch(f"/api/v1/ventas/cotizaciones/{cot_id}", json=body, headers=auth(token))


def _logs(db, entidad, entity_id, accion=None):
    from app.models.erp_documents import ActivityLog
    db.expire_all()
    q = db.query(ActivityLog).filter(ActivityLog.entity_type == entidad, ActivityLog.entity_id == entity_id)
    if accion:
        q = q.filter(ActivityLog.action == accion)
    return q.order_by(ActivityLog.id.asc()).all()


def _token_usado(db, raw):
    from app.models.confirmation import DocumentConfirmationToken
    db.expire_all()
    return db.query(DocumentConfirmationToken).filter(
        DocumentConfirmationToken.token_hash == hashlib.sha256(raw.encode()).hexdigest()).first().used_at is not None


def _etapa(db, status):
    from sqlalchemy import text
    return db.execute(text("SELECT id FROM pipeline_stages WHERE maps_to_status = :s ORDER BY position, id LIMIT 1"),
                      {"s": status}).scalar()


def _borrar_tabla(db, tabla):
    from sqlalchemy import text
    db.rollback()
    db.execute(text(f"DROP TABLE IF EXISTS {tabla}"))
    db.commit()


def _existe_tabla(db, tabla):
    from sqlalchemy import text
    return db.execute(text("SELECT to_regclass(:t)"), {"t": tabla}).scalar() is not None


# ─── 1) etiquetas ─────────────────────────────────────────────────────────────────────────────────────────────

def test_etiquetas_de_la_solicitud_son_las_del_usuario():
    from app.core.textos_actividad import ESTADOS_SC_HEREDADOS, PASOS_SC, etiqueta_estado
    assert etiqueta_estado("SC", "BORRADOR") == "Nueva"
    assert etiqueta_estado("SC", "PENDIENTE_CONFIRMACION") == "Pendiente por confirmación"
    assert [etiqueta_estado("SC", e) for e in ("ASIGNADA", "CONFIRMADA", "CANCELADA")] == [
        "Asignada", "Confirmada", "Cancelada"]
    assert PASOS_SC == ("BORRADOR", "ASIGNADA", "PENDIENTE_CONFIRMACION", "CONFIRMADA")
    assert ESTADOS_SC_HEREDADOS == ("COTIZADA", "EN_ESPERA_CONFIRMACION", "RECHAZADA", "VENCIDA")
    # Los heredados conservan su etiqueta para el historial; la COT conserva 'Borrador'.
    assert [etiqueta_estado("SC", e) for e in ESTADOS_SC_HEREDADOS] == [
        "Cotizada", "En espera de confirmación", "Rechazada", "Vencida"]
    assert etiqueta_estado("COT", "BORRADOR") == "Borrador"


# ─── 2) paridad con el espejo del frontend (R16, C5, C16) ───────────────────────────────────────────────────────────

_FRONTEND_LIB = Path(__file__).resolve().parents[2] / "frontend" / "src" / "lib"

# Casos de pct_anticipo_de_modalidad: los de test_anticipo_modalidad.py mas variantes de la agenda y de compras.
_MODALIDADES = ["60/40 (60% anticipo - 40% pendiente)", "Contado", "  CONTADO ", "Credito 30 dias", "Credito 60 dias",
                "Crédito 60 Días", "Credito 30 Dias", "Credito 30d", "cr. 90 dias", "CRÉDITO", "Otro", "", "   ",
                "Adelanto 50%", "Contra entrega", None,
                # R2 cobra como credito todo lo que empiece por 'cr' (tambien 'Cruce de cuentas'); ancho completo (NFKD)
                "Cruce de cuentas", "Ｃｒｅｄｉｔｏ 30 dias", "Credito 2 cuotas", "Pago a credito"]


def _node(archivo, cuerpo):
    """Importa frontend/src/lib/<archivo> con node y devuelve el JSON que imprime `cuerpo` (m = el modulo)."""
    node = shutil.which("node")
    lib = _FRONTEND_LIB / archivo
    if not node or not lib.exists():
        pytest.skip(f"sin node o sin frontend/src/lib/{archivo}: no se puede comprobar la paridad")
    script = "import(%s).then(m => { console.log(JSON.stringify(%s)); });" % (json.dumps(lib.as_uri()), cuerpo)
    r = subprocess.run([node, "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--input-type=module", "-e", script],
                       capture_output=True, text=True, encoding="utf-8", timeout=60)
    assert r.returncode == 0, f"node fallo:\n{r.stderr}"
    return json.loads(r.stdout)


def test_paridad_etiquetas_solicitud_con_el_frontend():
    from app.core.textos_actividad import ETIQUETAS_ESTADO, PASOS_SC, etiqueta_estado
    espejo = _node("estados-solicitud.js", """{
      labels: Object.fromEntries(Object.entries(m.ESTADOS_SC).map(([k, v]) => [k, v.label])),
      pasos: m.PASOS_SC.map(p => p.clave),
      desconocido: m.infoEstadoSolicitud('ALGO_NUEVO').label,
    }""")
    # Cada estado que el frontend etiqueta sale IGUAL del backend y por el mapa (no por el respaldo humanizado), y el
    # backend no etiqueta estados que el frontend desconoce.
    assert set(espejo["labels"]) == set(ETIQUETAS_ESTADO["SC"])
    for codigo, etiqueta_front in espejo["labels"].items():
        assert etiqueta_estado("SC", codigo) == etiqueta_front, \
            f'{codigo}: backend {etiqueta_estado("SC", codigo)!r}, frontend {etiqueta_front!r}'
    assert espejo["pasos"] == list(PASOS_SC)
    # el respaldo de una clave desconocida es el mismo en los dos lados
    assert espejo["desconocido"] == etiqueta_estado("SC", "ALGO_NUEVO")


def test_paridad_pct_anticipo_de_modalidad_con_el_frontend():
    from app.core.ventas_dinero import pct_anticipo_de_modalidad
    espejo = _node("etiquetas-solicitud.js", "%s.map(v => m.pctAnticipoDeModalidad(v))" % json.dumps(_MODALIDADES))
    backend = [None if (p := pct_anticipo_de_modalidad(v)) is None else int(p) for v in _MODALIDADES]
    assert espejo == backend, list(zip(_MODALIDADES, backend, espejo))
    assert backend[:4] == [60, 100, 100, 0]  # la prueba compara valores reales, no dos listas de None
    assert backend[-4:] == [0, 0, 0, 0]


def test_paridad_reglas_de_estados_solicitud_con_el_frontend():
    """Los demas espejos de estados-solicitud.js: que estados cuentan como heredados (en los pasos valen Confirmada),
    cuales estan sin confirmar y el minimo del motivo de /cotizar-sin-confirmacion."""
    from app.api.v1.erp_ventas import MOTIVO_SIN_CONFIRMACION_MIN
    from app.core.textos_actividad import ETIQUETAS_ESTADO, ESTADOS_SC_HEREDADOS, PASOS_SC
    espejo = _node("estados-solicitud.js", """{
      pasoDe: Object.fromEntries(Object.keys(m.ESTADOS_SC).map(k => [k, m.pasoSolicitud(k)])),
      sinConfirmar: m.ESTADOS_SC_SIN_CONFIRMAR,
      motivoMin: m.MOTIVO_SIN_CONFIRMACION_MIN,
    }""")
    ultimo = len(PASOS_SC) - 1
    # cada paso en su lugar; los heredados (y solo ellos, fuera de los pasos) en el ultimo; el resto sin pasos
    assert {e: espejo["pasoDe"][e] for e in PASOS_SC} == {e: i for i, e in enumerate(PASOS_SC)}
    assert {e for e, p in espejo["pasoDe"].items() if p == ultimo and e not in PASOS_SC} == set(ESTADOS_SC_HEREDADOS)
    fuera = set(ETIQUETAS_ESTADO["SC"]) - set(PASOS_SC) - set(ESTADOS_SC_HEREDADOS)
    assert fuera == {"CANCELADA", "N/A_SOPORTE"}
    assert all(espejo["pasoDe"][e] == -1 for e in fuera)
    assert espejo["sinConfirmar"] == list(PASOS_SC[:-1])
    assert espejo["motivoMin"] == MOTIVO_SIN_CONFIRMACION_MIN


# ─── 3-8) la SC no refleja a su COT ──────────────────────────────────────────────────────────────────────────

def test_crear_la_cotizacion_deja_la_solicitud_confirmada(app_client, db, admin_token, user_admin):
    sc = _sc(db, "SC-U15001", user_admin, gate1_confirmed_at=AHORA())
    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/confirmar", json={"user_name": "t"},
                           headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    cot = resp.json()["data"]["cotizacion"]
    assert resp.json()["data"]["sc"]["estado"] == "CONFIRMADA"
    db.refresh(sc)
    assert sc.estado == "CONFIRMADA" and sc.gate1_confirmed_at is not None
    ultimo = _logs(db, "SC", sc.id)[-1]
    assert ultimo.action == "COTIZACION_CREADA"
    assert ultimo.description == f"Cotización {cot['numero']} creada desde esta solicitud"
    assert (ultimo.old_estado, ultimo.new_estado, ultimo.user_name) == (None, None, "t")
    assert _logs(db, "SC", sc.id, "ESTADO_CHANGED") == []
    (creada,) = _logs(db, "COT", cot["id"], "CREATED")  # el CREATED de la COT no cambia
    assert creada.description == f"Cotización {cot['numero']} creada desde SC-U15001"


def test_enviar_y_confirmar_la_cotizacion_no_cambian_la_solicitud(app_client, db, admin_token, user_admin):
    from app.models.erp_documents import SalesQuotation
    sc = _sc(db, "SC-U15002", user_admin, gate1_confirmed_at=AHORA(), customer_email="cliente@test.com")
    cot = _crear_cot(app_client, admin_token, sc.id)
    fila = db.get(SalesQuotation, cot["id"])
    fila.productos = [LINEA_CON_PRECIO]
    fila.total_cop = 1000
    db.commit()
    resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot['id']}/enviar-confirmacion", json={"user_name": "t"},
                           headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    db.refresh(sc)
    assert sc.estado == "CONFIRMADA"
    raw = resp.json()["link_confirmacion"].rsplit("/", 1)[-1]
    resp = app_client.post("/api/v1/confirmar/confirmar", json={"token": raw}, headers={"Idempotency-Key": "u15-002"})
    assert resp.status_code == 200, resp.text
    db.refresh(sc)
    assert sc.estado == "CONFIRMADA" and sc.gate1_confirmed_at is not None
    assert db.get(SalesQuotation, cot["id"]).estado == "CONFIRMADA"
    assert _logs(db, "SC", sc.id, "ESTADO_CHANGED") == []


def test_rechazar_con_confirmacion_vigente_deja_confirmada_y_lo_anota(app_client, db, admin_token, user_admin):
    sc = _sc(db, "SC-U15003", user_admin, gate1_confirmed_at=AHORA())
    cot1 = _crear_cot(app_client, admin_token, sc.id)
    resp = _patch_cot(app_client, admin_token, cot1["id"], estado="RECHAZADA")
    assert resp.status_code == 200, resp.text
    db.refresh(sc)
    assert sc.estado == "CONFIRMADA" and sc.gate1_confirmed_at is not None
    (aviso,) = _logs(db, "SC", sc.id, "COTIZACION_RECHAZADA")
    assert aviso.description == (f"La cotización {cot1['numero']} fue rechazada. La solicitud sigue activa: ya puedes "
                                 "crearle una nueva cotización.")
    assert (aviso.old_estado, aviso.new_estado, aviso.user_name) == (None, None, "t")
    assert _logs(db, "SC", sc.id, "ESTADO_CHANGED") == []
    # Se le crea otra sin reconfirmar, y la Actividad de la SC dice a cual reemplaza.
    cot2 = _crear_cot(app_client, admin_token, sc.id)
    ultimo = _logs(db, "SC", sc.id)[-1]
    assert ultimo.action == "COTIZACION_CREADA"
    assert ultimo.description == (f"Cotización {cot2['numero']} creada desde esta solicitud (reemplaza a la "
                                  f"cotización rechazada {cot1['numero']})")


def test_rechazar_sin_confirmacion_vigente_vuelve_a_asignada(app_client, db, admin_token, user_admin):
    sc = _sc(db, "SC-U15004", user_admin, gate1_confirmed_at=None)
    cot = _cot(db, "COT-U15004", sc)
    resp = _patch_cot(app_client, admin_token, cot.id, estado="RECHAZADA")
    assert resp.status_code == 200, resp.text
    db.refresh(sc)
    assert sc.estado == "ASIGNADA"
    (cambio,) = _logs(db, "SC", sc.id, "ESTADO_CHANGED")
    assert (cambio.old_estado, cambio.new_estado, cambio.user_name) == ("CONFIRMADA", "ASIGNADA", "t")
    assert cambio.description == ("La cotización COT-U15004 fue rechazada. La solicitud sigue activa; para crearle "
                                  "otra cotización, reenvíasela al cliente para que la confirme.")
    assert _logs(db, "SC", sc.id, "COTIZACION_RECHAZADA") == []
    # Sin asesor vuelve a Nueva (BORRADOR).
    sin_asesor = _sc(db, "SC-U15004B", user_admin, con_asesor=False)
    cot_b = _cot(db, "COT-U15004B", sin_asesor)
    assert _patch_cot(app_client, admin_token, cot_b.id, estado="RECHAZADA").status_code == 200
    db.refresh(sin_asesor)
    assert sin_asesor.estado == "BORRADOR"


def test_cancelar_el_pedido_no_cambia_la_solicitud(app_client, db, admin_token, user_admin):
    from app.models.erp_documents import SalesQuotation
    sc = _sc(db, "SC-U15005", user_admin, modalidad_pago=CREDITO, gate1_confirmed_at=AHORA(),
             customer_email="cliente@test.com")
    cot = _cot(db, "COT-U15005", sc, estado="CONFIRMADA", gate2_confirmed_at=AHORA(), productos=[LINEA_CON_PRECIO],
               total_cop=1000, subtotal_cop=1000, anticipo_cop=0, customer_email="cliente@test.com")
    resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/confirmar", json={"user_name": "t"},
                           headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    pven_id = resp.json()["data"]["sale_order_id"]
    db.refresh(sc)
    assert sc.estado == "CONFIRMADA"
    resp = app_client.patch(f"/api/v1/ventas/pedidos/{pven_id}", json={
        "estado": "CANCELADO", "cancellation_reason": "Cliente cambió el pedido", "updated_by": "t"},
        headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    db.expire_all()
    assert db.get(SalesQuotation, cot.id).estado == "BORRADOR"  # H46: la COT se reabre
    db.refresh(sc)
    assert sc.estado == "CONFIRMADA"
    assert _logs(db, "SC", sc.id, "ESTADO_CHANGED") == []


def test_cotizacion_confirmada_promueve_una_solicitud_heredada(app_client, db, admin_token, user_admin):
    from app.core.confirmation_tokens import create_confirmation_token
    casos = (("COTIZADA", "SC-U15006A"), ("PENDIENTE_CONFIRMACION", "SC-U15006B"), ("ASIGNADA", "SC-U15006C"))
    for i, (estado, numero) in enumerate(casos):
        sc = _sc(db, numero, user_admin, estado=estado, gate1_confirmed_at=None)
        cot = _cot(db, f"COT-U15006{i}", sc, estado="PENDIENTE_CONFIRMACION", productos=[LINEA_CON_PRECIO],
                   total_cop=1000)
        enlace_sc = create_confirmation_token(db, "SC", sc.id)  # un enlace de la SC que hubiera quedado vivo
        raw = create_confirmation_token(db, "COT", cot.id)
        resp = app_client.post("/api/v1/confirmar/confirmar", json={"token": raw},
                               headers={"Idempotency-Key": f"u15-006-{i}"})
        assert resp.status_code == 200, (estado, resp.text)
        db.refresh(sc)
        assert sc.estado == "CONFIRMADA" and sc.gate1_confirmed_at is None, estado  # gate1 no se toca
        (cambio,) = _logs(db, "SC", sc.id, "ESTADO_CHANGED")
        assert cambio.description == f"La solicitud queda confirmada: el cliente confirmó la cotización {cot.numero}"
        assert (cambio.old_estado, cambio.new_estado, cambio.user_name) == (
            estado, "CONFIRMADA", "Cliente (confirmación por link)")
        assert _token_usado(db, enlace_sc), estado
        # Confirmada por la cotización, sin la marca de Gate 1: no se le puede crear otra cotización.
        datos = app_client.get(f"/api/v1/ventas/solicitudes/{sc.id}", headers=auth(admin_token)).json()["data"]
        assert datos["confirmacion_vigente"] is False


def test_rechazar_con_la_solicitud_sin_confirmar_no_cambia_su_estado(app_client, db, admin_token, user_admin):
    """R21: con la SC sin confirmar el rechazo no cambia su estado; el texto depende de si ya se le envio al cliente."""
    from app.core.confirmation_tokens import create_confirmation_token
    reenviar = "La solicitud sigue activa: envíasela al cliente para que la confirme o cotízala de nuevo."
    casos = (("ASIGNADA", True, reenviar),
             ("BORRADOR", False, reenviar),
             ("PENDIENTE_CONFIRMACION", True, "La solicitud sigue esperando la confirmación del cliente."))
    for i, (estado, con_asesor, cola) in enumerate(casos):
        sc = _sc(db, f"SC-U15007{i}", user_admin, con_asesor=con_asesor, estado=estado, gate1_confirmed_at=None)
        enlace = create_confirmation_token(db, "SC", sc.id)
        cot = _cot(db, f"COT-U15007{i}", sc)  # por ORM: la UI no crea COT sin confirmar hasta T3
        resp = _patch_cot(app_client, admin_token, cot.id, estado="RECHAZADA")
        assert resp.status_code == 200, (estado, resp.text)
        db.refresh(sc)
        assert sc.estado == estado
        (aviso,) = _logs(db, "SC", sc.id, "COTIZACION_RECHAZADA")
        assert aviso.description == f"La cotización {cot.numero} fue rechazada. {cola}", estado
        assert (aviso.old_estado, aviso.new_estado) == (None, None)
        assert _logs(db, "SC", sc.id, "ESTADO_CHANGED") == []
        assert not _token_usado(db, enlace), estado  # el cliente todavia puede confirmar la solicitud


def test_rechazar_con_solicitud_heredada_la_saca_del_estado_heredado(app_client, db, admin_token, user_admin):
    """R29: una SC vieja en un estado heredado (o ajeno, como 'ENTREGADO' del Hub viejo: B1 tambien la normalizaba) no
    se queda atascada al rechazar su unica COT activa. Su enlace pendiente se anula (defensa, como el script)."""
    from app.core.confirmation_tokens import create_confirmation_token
    from app.core.textos_actividad import ESTADOS_SC_HEREDADOS
    reenviar = "La solicitud sigue activa; para crearle otra cotización, reenvíasela al cliente para que la confirme."
    for i, heredado in enumerate(ESTADOS_SC_HEREDADOS + ("ENTREGADO", "FACTURADO")):
        sc = _sc(db, f"SC-U15008{i}", user_admin, estado=heredado, gate1_confirmed_at=None)
        enlace = create_confirmation_token(db, "SC", sc.id)
        cot = _cot(db, f"COT-U15008{i}", sc)
        assert _patch_cot(app_client, admin_token, cot.id, estado="RECHAZADA").status_code == 200
        db.refresh(sc)
        assert sc.estado == "ASIGNADA", heredado
        (cambio,) = _logs(db, "SC", sc.id, "ESTADO_CHANGED")
        assert (cambio.old_estado, cambio.new_estado) == (heredado, "ASIGNADA")
        assert cambio.description == f"La cotización {cot.numero} fue rechazada. {reenviar}"
        assert _token_usado(db, enlace), heredado
    # Sin asesor: Nueva.
    sin_asesor = _sc(db, "SC-U15008N", user_admin, con_asesor=False, estado="COTIZADA", gate1_confirmed_at=None)
    cot = _cot(db, "COT-U15008N", sin_asesor)
    assert _patch_cot(app_client, admin_token, cot.id, estado="RECHAZADA").status_code == 200
    db.refresh(sin_asesor)
    assert sin_asesor.estado == "BORRADOR"
    # Con la confirmacion del cliente vigente: Confirmada, lista para otra cotizacion.
    con_marca = _sc(db, "SC-U15008M", user_admin, estado="EN_ESPERA_CONFIRMACION", gate1_confirmed_at=AHORA())
    cot = _cot(db, "COT-U15008M", con_marca, estado="VENCIDA")
    assert _patch_cot(app_client, admin_token, cot.id, estado="RECHAZADA").status_code == 200
    db.refresh(con_marca)
    assert con_marca.estado == "CONFIRMADA" and con_marca.gate1_confirmed_at is not None
    (cambio,) = _logs(db, "SC", con_marca.id, "ESTADO_CHANGED")
    assert (cambio.old_estado, cambio.new_estado) == ("EN_ESPERA_CONFIRMACION", "CONFIRMADA")
    assert cambio.description == ("La cotización COT-U15008M fue rechazada. La solicitud sigue activa: ya puedes "
                                  "crearle una nueva cotización.")
    # Con otra COT activa no se toca (ni se anota).
    con_otra = _sc(db, "SC-U15008O", user_admin, estado="COTIZADA", gate1_confirmed_at=None)
    cot = _cot(db, "COT-U15008O1", con_otra)
    _cot(db, "COT-U15008O2", con_otra)
    assert _patch_cot(app_client, admin_token, cot.id, estado="RECHAZADA").status_code == 200
    db.refresh(con_otra)
    assert con_otra.estado == "COTIZADA"
    assert [l.action for l in _logs(db, "SC", con_otra.id)] == []


def test_la_sincronizacion_confirma_todo_en_un_solo_commit(db, user_admin, contador_sql):
    """C8: _log(commit=False), revoke_pending_tokens(commit=False) y un solo commit al final."""
    from app.api.v1.erp_ventas import _sincronizar_estado_solicitud_desde_cotizacion
    from app.core.confirmation_tokens import create_confirmation_token
    # Rechazo que cambia el estado
    sc = _sc(db, "SC-U15009A", user_admin, gate1_confirmed_at=None)
    cot = _cot(db, "COT-U15009A", sc, estado="RECHAZADA")
    with contador_sql.ventana() as v:
        _sincronizar_estado_solicitud_desde_cotizacion(cot, db, "t")
    assert v.commits == 1
    db.refresh(sc)
    assert sc.estado == "ASIGNADA" and len(_logs(db, "SC", sc.id, "ESTADO_CHANGED")) == 1
    # Rechazo que solo anota
    sc = _sc(db, "SC-U15009B", user_admin, gate1_confirmed_at=AHORA())
    cot = _cot(db, "COT-U15009B", sc, estado="RECHAZADA")
    with contador_sql.ventana() as v:
        _sincronizar_estado_solicitud_desde_cotizacion(cot, db, "t")
    assert v.commits == 1 and len(_logs(db, "SC", sc.id, "COTIZACION_RECHAZADA")) == 1
    # Confirmacion de la COT que confirma la SC y anula su enlace
    sc = _sc(db, "SC-U15009C", user_admin, estado="PENDIENTE_CONFIRMACION", gate1_confirmed_at=None)
    enlace = create_confirmation_token(db, "SC", sc.id)
    cot = _cot(db, "COT-U15009C", sc, estado="CONFIRMADA")
    with contador_sql.ventana() as v:
        _sincronizar_estado_solicitud_desde_cotizacion(cot, db)
    assert v.commits == 1
    db.refresh(sc)
    assert sc.estado == "CONFIRMADA" and _token_usado(db, enlace)
    # Una COT en otro estado no toca la SC (ni hace commit)
    sc = _sc(db, "SC-U15009D", user_admin, estado="ASIGNADA", gate1_confirmed_at=None)
    for estado in ("BORRADOR", "ENVIADA", "PENDIENTE_CONFIRMACION", "VENCIDA"):
        cot = _cot(db, f"COT-U15009D{estado[:3]}", sc, estado=estado)
        with contador_sql.ventana() as v:
            _sincronizar_estado_solicitud_desde_cotizacion(cot, db, "t")
        assert v.commits == 0, estado
        db.refresh(sc)
        assert sc.estado == "ASIGNADA", estado
    assert _logs(db, "SC", sc.id) == []
    # Una SC de Soporte no se toca: ni con la COT confirmada ni con la rechazada
    soporte = _sc(db, "SC-U15009E", user_admin, estado="N/A_SOPORTE", gate1_confirmed_at=None)
    cot = _cot(db, "COT-U15009E", soporte, estado="CONFIRMADA")
    for estado in ("CONFIRMADA", "RECHAZADA"):
        cot.estado = estado
        db.commit()
        with contador_sql.ventana() as v:
            _sincronizar_estado_solicitud_desde_cotizacion(cot, db, "t")
        assert v.commits == 0, estado
        db.refresh(soporte)
        assert soporte.estado == "N/A_SOPORTE", estado
    assert _logs(db, "SC", soporte.id) == []


# ─── confirmacion_vigente y textos de update_solicitud ────────────────────────────────────────────────────────

def test_confirmacion_vigente_de_la_solicitud(app_client, db, admin_token, user_admin):
    from app.api.v1.erp_ventas import _confirmacion_vigente_sc, _sc_dict
    casos = (("CONFIRMADA", AHORA(), True), ("CONFIRMADA", None, False), ("COTIZADA", AHORA(), False),
             ("ASIGNADA", None, False))
    for i, (estado, marca, esperado) in enumerate(casos):
        sc = _sc(db, f"SC-U15010{i}", user_admin, estado=estado, gate1_confirmed_at=marca)
        assert _confirmacion_vigente_sc(sc) is esperado, (estado, marca)
        assert _sc_dict(sc)["confirmacion_vigente"] is esperado, (estado, marca)
        datos = app_client.get(f"/api/v1/ventas/solicitudes/{sc.id}", headers=auth(admin_token)).json()["data"]
        assert datos["confirmacion_vigente"] is esperado
        assert "gate1_confirmed_at" not in datos  # solo el booleano, nunca la fecha


def test_los_textos_de_la_solicitud_usan_las_etiquetas_nuevas(app_client, db, admin_token, user_admin):
    sc = _sc(db, "SC-U15011A", user_admin, estado="ASIGNADA", gate1_confirmed_at=None)
    for estado, etiqueta in (("COTIZADA", "Cotizada"), ("FACTURADO", "Facturado")):
        resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={"estado": estado, "updated_by": "t"},
                                headers=auth(admin_token))
        assert resp.status_code == 400, resp.text
        assert resp.json()["detail"] == (f"El estado «{etiqueta}» no se puede asignar a mano a una solicitud: solo se "
                                         "puede reiniciar (vuelve a Nueva, o a Asignada si tiene asesor).")
    # R10: reiniciar con documentos activos
    con_cot = _sc(db, "SC-U15011B", user_admin, gate1_confirmed_at=AHORA())
    cot = _cot(db, "COT-U15011B", con_cot)
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{con_cot.id}", json={"estado": "BORRADOR", "updated_by": "t"},
                            headers=auth(admin_token))
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"] == (
        f"No se puede reiniciar la solicitud SC-U15011B: tiene documentos activos (cotización {cot.numero}). "
        "Primero rechaza la cotización; después podrás reiniciar la solicitud.")
    # Quitar el asesor: vuelve a Nueva
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={"advisor_user_id": "", "advisor_name": ""},
                            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    (cambio,) = _logs(db, "SC", sc.id, "ESTADO_CHANGED")
    assert cambio.description == "Estado cambiado a Nueva (asesor retirado)"
    assert (cambio.old_estado, cambio.new_estado) == ("ASIGNADA", "BORRADOR")


# ─── 9) scripts/ajustar_estados_solicitud.py ──────────────────────────────────────────────────────────────────

def test_script_ajuste_estados_reporta_aplica_y_es_idempotente(db, user_admin):
    from sqlalchemy import text
    from app.models.erp_documents import CustomerRequest
    from scripts.ajustar_estados_solicitud import ajustar
    sc_a = _sc(db, "SC-U15S01", user_admin, estado="COTIZADA", gate1_confirmed_at=None)
    cot_a = _cot(db, "COT-U15S01", sc_a)                                          # COT activa -> Confirmada
    sc_b = _sc(db, "SC-U15S02", user_admin, estado="RECHAZADA", gate1_confirmed_at=None)   # sin docs -> Asignada
    sc_c = _sc(db, "SC-U15S03", user_admin, estado="EN_ESPERA_CONFIRMACION", gate1_confirmed_at=None)
    _cot(db, "COT-U15S03", sc_c, estado="PENDIENTE_CONFIRMACION")                 # COT activa -> Confirmada
    ids = [sc_a.id, sc_b.id, sc_c.id]
    try:
        res = ajustar(db, aplicar=False, ids=ids, tabla_respaldo=TABLA_ESTADOS_TEST)
        assert res["candidatas"] == 3 and res["ajustadas"] == 0
        nuevos = {e["numero"]: e["nuevo"] for e in res["ejemplos"]}
        assert nuevos == {"SC-U15S01": "CONFIRMADA", "SC-U15S02": "ASIGNADA", "SC-U15S03": "CONFIRMADA"}
        db.expire_all()
        assert [db.get(CustomerRequest, i).estado for i in ids] == ["COTIZADA", "RECHAZADA", "EN_ESPERA_CONFIRMACION"]
        assert not _existe_tabla(db, TABLA_ESTADOS_TEST)  # el reporte ni siquiera crea la tabla de respaldo
        assert all(_logs(db, "SC", i) == [] for i in ids)

        res = ajustar(db, aplicar=True, ids=ids, tabla_respaldo=TABLA_ESTADOS_TEST)
        assert res["candidatas"] == 3 and res["ajustadas"] == 3
        db.expire_all()
        assert [db.get(CustomerRequest, i).estado for i in ids] == ["CONFIRMADA", "ASIGNADA", "CONFIRMADA"]
        respaldo = {r[0]: (r[1], r[2]) for r in db.execute(
            text(f"SELECT id, estado_original, estado_nuevo FROM {TABLA_ESTADOS_TEST}")).all()}
        assert respaldo == {sc_a.id: ("COTIZADA", "CONFIRMADA"), sc_b.id: ("RECHAZADA", "ASIGNADA"),
                            sc_c.id: ("EN_ESPERA_CONFIRMACION", "CONFIRMADA")}
        for i in ids:
            (log,) = _logs(db, "SC", i, "ESTADO_CHANGED")
            assert log.user_name == AUTOR_AJUSTE
        (log_a,) = _logs(db, "SC", sc_a.id, "ESTADO_CHANGED")
        assert (log_a.old_estado, log_a.new_estado) == ("COTIZADA", "CONFIRMADA")
        assert log_a.description == ("Estado ajustado a Confirmada: la solicitud ya no cambia con su cotización; el "
                                     f"avance se ve en la cotización {cot_a.numero}")
        (log_b,) = _logs(db, "SC", sc_b.id, "ESTADO_CHANGED")
        assert log_b.description == ("Estado ajustado a Asignada: no tiene cotizaciones activas; para cotizarla, "
                                     "envíasela al cliente para que la confirme")

        res2 = ajustar(db, aplicar=True, ids=ids, tabla_respaldo=TABLA_ESTADOS_TEST)
        assert res2["candidatas"] == 0 and res2["ajustadas"] == 0
        assert db.execute(text(f"SELECT count(*) FROM {TABLA_ESTADOS_TEST}")).scalar() == 3
    finally:
        _borrar_tabla(db, TABLA_ESTADOS_TEST)


def test_script_ajuste_estados_aplica_la_regla_de_la_confirmacion(db, user_admin):
    """R29 en el script: heredada sin documentos y con la marca -> Confirmada (la marca se conserva); sin la marca ->
    Asignada / Nueva, con los enlaces de la SC anulados. Confirmada sin marca ni documentos -> Asignada / Nueva. El
    script nunca cambia gate1_confirmed_at. No son candidatas: Confirmada con marca, Confirmada sin marca con documentos
    activos ni Soporte Tecnico; una SC sin tipo (NULL) SI lo es (por eso el IS DISTINCT FROM)."""
    from sqlalchemy import text
    from app.core.confirmation_tokens import create_confirmation_token
    from app.models.erp_documents import CustomerRequest
    from scripts.ajustar_estados_solicitud import ajustar
    marca = AHORA()
    con_marca = _sc(db, "SC-U15T01", user_admin, estado="VENCIDA", gate1_confirmed_at=marca)
    rechazada = _sc(db, "SC-U15T02", user_admin, estado="COTIZADA", gate1_confirmed_at=None)
    _cot(db, "COT-U15T02", rechazada, estado="RECHAZADA")
    sin_marca = _sc(db, "SC-U15T03", user_admin, con_asesor=False, estado="CONFIRMADA", gate1_confirmed_at=None)
    enlace = create_confirmation_token(db, "SC", sin_marca.id)
    vigente = _sc(db, "SC-U15T04", user_admin, estado="CONFIRMADA", gate1_confirmed_at=AHORA())
    con_docs = _sc(db, "SC-U15T05", user_admin, estado="CONFIRMADA", gate1_confirmed_at=None)
    _cot(db, "COT-U15T05", con_docs)
    soporte = _sc(db, "SC-U15T06", user_admin, estado="COTIZADA", gate1_confirmed_at=None,
                  tipo_solicitud="Soporte Tecnico")
    sin_tipo = _sc(db, "SC-U15T07", user_admin, estado="RECHAZADA", gate1_confirmed_at=None)
    db.execute(text("UPDATE customer_requests SET tipo_solicitud = NULL WHERE id = :i"), {"i": sin_tipo.id})
    db.commit()
    db.refresh(sin_tipo)
    assert sin_tipo.tipo_solicitud is None
    ids = [con_marca.id, rechazada.id, sin_marca.id, vigente.id, con_docs.id, soporte.id, sin_tipo.id]
    try:
        res = ajustar(db, aplicar=False, ids=ids, tabla_respaldo=TABLA_ESTADOS_TEST)
        assert {e["numero"]: e["nuevo"] for e in res["ejemplos"]} == {
            "SC-U15T01": "CONFIRMADA", "SC-U15T02": "ASIGNADA", "SC-U15T03": "BORRADOR", "SC-U15T07": "ASIGNADA"}
        res = ajustar(db, aplicar=True, ids=ids, tabla_respaldo=TABLA_ESTADOS_TEST)
        assert res["ajustadas"] == 4
        db.expire_all()
        filas = {i: db.get(CustomerRequest, i) for i in ids}
        assert filas[con_marca.id].estado == "CONFIRMADA" and filas[con_marca.id].gate1_confirmed_at == marca
        assert filas[rechazada.id].estado == "ASIGNADA" and filas[rechazada.id].gate1_confirmed_at is None
        assert filas[sin_marca.id].estado == "BORRADOR" and _token_usado(db, enlace)
        assert filas[sin_tipo.id].estado == "ASIGNADA"
        assert [filas[i].estado for i in (vigente.id, con_docs.id, soporte.id)] == ["CONFIRMADA", "CONFIRMADA",
                                                                                     "COTIZADA"]
        respaldo = {r[0]: r[1] for r in db.execute(text(f"SELECT id, gate1_original FROM {TABLA_ESTADOS_TEST}"))}
        assert set(respaldo) == {con_marca.id, rechazada.id, sin_marca.id, sin_tipo.id}
        assert respaldo[con_marca.id] is not None and respaldo[sin_marca.id] is None  # informativa
        (log,) = _logs(db, "SC", con_marca.id, "ESTADO_CHANGED")
        assert log.description == ("Estado ajustado a Confirmada: la solicitud ya no cambia con su cotización; la "
                                   "confirmación del cliente sigue vigente y ya puedes crearle una nueva cotización")
        (log,) = _logs(db, "SC", rechazada.id, "ESTADO_CHANGED")
        assert log.description == ("Estado ajustado a Asignada: su cotización fue rechazada; para cotizar de nuevo, "
                                   "reenvíasela al cliente para que la confirme")
        (log,) = _logs(db, "SC", sin_marca.id, "ESTADO_CHANGED")
        assert log.description.startswith("Estado ajustado a Nueva: ")
    finally:
        _borrar_tabla(db, TABLA_ESTADOS_TEST)


def test_ajustar_leads_reporta_y_aplica(db, user_admin):
    """R26: un lead 'Perdido' de una SC que se cancelo y ya no esta cancelada vuelve a cotizacion (COT activa) o a
    nuevo lead (sin ella). Se elige el lead por su id: otro lead de la misma SC no se toca. Un lead que alguien paso a
    'Perdido' a mano en el CRM, de una SC que nunca se cancelo, NO se revive."""
    from sqlalchemy import text
    from app.models.sales import SalesOrder
    from scripts.ajustar_estados_solicitud import ajustar_leads
    perdido = _etapa(db, "CANCELLED")
    sc_a = _sc(db, "SC-U15L01", user_admin, estado="ASIGNADA", gate1_confirmed_at=None)
    _cancelada_y_restaurada(db, sc_a)
    lead_a = _lead(db, sc_a, pipeline_stage_id=perdido)                                    # -> DRAFT
    otro_a = _lead(db, sc_a, status="DRAFT")                                               # no es candidato
    sc_b = _sc(db, "SC-U15L02", user_admin, gate1_confirmed_at=AHORA())
    _cancelada_y_restaurada(db, sc_b)
    _cot(db, "COT-U15L02", sc_b)
    lead_b = _lead(db, sc_b, pipeline_stage_id=perdido)                                    # -> QUOTATION
    sc_c = _sc(db, "SC-U15L03", user_admin, estado="CANCELADA")
    _cancelada_y_restaurada(db, sc_c)
    lead_c = _lead(db, sc_c, pipeline_stage_id=perdido)                                    # SC cancelada: no
    sc_d = _sc(db, "SC-U15L04", user_admin, estado="ASIGNADA", tipo_solicitud="Soporte Tecnico")
    _cancelada_y_restaurada(db, sc_d)
    lead_d = _lead(db, sc_d, pipeline_stage_id=perdido)                                    # Soporte: no
    sc_e = _sc(db, "SC-U15L05", user_admin, estado="ASIGNADA", gate1_confirmed_at=None)   # nunca se cancelo
    lead_e = _lead(db, sc_e, pipeline_stage_id=perdido)                                    # perdido a mano: no
    ids = [sc_a.id, sc_b.id, sc_c.id, sc_d.id, sc_e.id]
    try:
        res = ajustar_leads(db, aplicar=False, ids=ids, tabla_respaldo=TABLA_LEADS_TEST)
        assert res["candidatos"] == 2 and res["movidos"] == 0
        assert {e["lead_id"]: e["nuevo"] for e in res["ejemplos"]} == {lead_a.id: "DRAFT", lead_b.id: "QUOTATION"}
        assert all(e["ultima_cancelacion"] is not None and e["ultima_restauracion"] is not None
                   for e in res["ejemplos"])
        db.expire_all()
        assert db.get(SalesOrder, lead_a.id).status == "CANCELLED"
        assert not _existe_tabla(db, TABLA_LEADS_TEST)

        res = ajustar_leads(db, aplicar=True, ids=ids, tabla_respaldo=TABLA_LEADS_TEST)
        assert res["candidatos"] == 2 and res["movidos"] == 2
        db.expire_all()
        a, b = db.get(SalesOrder, lead_a.id), db.get(SalesOrder, lead_b.id)
        assert (a.status, a.pipeline_stage_id) == ("DRAFT", _etapa(db, "DRAFT"))
        assert (b.status, b.pipeline_stage_id) == ("QUOTATION", _etapa(db, "QUOTATION"))
        assert db.get(SalesOrder, otro_a.id).status == "DRAFT"
        assert [db.get(SalesOrder, l.id).status for l in (lead_c, lead_d, lead_e)] == ["CANCELLED"] * 3
        respaldo = {r[0]: (r[1], r[2], r[3]) for r in db.execute(text(
            f"SELECT id, status_original, pipeline_stage_id_original, status_nuevo FROM {TABLA_LEADS_TEST}"))}
        assert respaldo == {lead_a.id: ("CANCELLED", perdido, "DRAFT"), lead_b.id: ("CANCELLED", perdido, "QUOTATION")}

        res2 = ajustar_leads(db, aplicar=True, ids=ids, tabla_respaldo=TABLA_LEADS_TEST)
        assert res2["candidatos"] == 0 and res2["movidos"] == 0
    finally:
        _borrar_tabla(db, TABLA_LEADS_TEST)


def test_ajustar_leads_informa_salidas_viejas_de_cancelada_y_perdidas_manuales(db, user_admin, monkeypatch):
    """Ronda 2: el reporte de ajustar_leads informa al usuario (la seleccion no cambia por esto).
    - Una SC cuya unica evidencia de cancelacion es un ESTADO_CHANGED viejo -> CANCELADA (pastilla vieja) es candidata,
      y su salida por el PATCH viejo (old_estado CANCELADA) cuenta como ultima restauracion.
    - Una SC con solo el renglon CANCELLED (sin new_estado) tambien es candidata (mismo filtro en la seleccion y en la
      fecha de la ultima cancelacion).
    - Si el lead cambio despues de la ultima restauracion se marca 'revisar' (restaurar ya reabre el lead).
    - Un CANCELLED CANCELADA -> CANCELADA ('enviar a la papelera' otra vez) no es una salida de CANCELADA."""
    from app.models.erp_documents import ActivityLog
    from scripts import ajustar_estados_solicitud as modulo
    t0 = (datetime.datetime.utcnow() - datetime.timedelta(days=10)).replace(microsecond=0)
    dia = datetime.timedelta(days=1)

    def _renglon(sc, accion, viejo, nuevo, cuando):
        db.add(ActivityLog(entity_type="SC", entity_id=sc.id, entity_numero=sc.numero, action=accion,
                           description="renglon de prueba", old_estado=viejo, new_estado=nuevo, user_name="t",
                           created_at=cuando))
        db.commit()

    vieja = _sc(db, "SC-U15V01", user_admin, estado="ASIGNADA", gate1_confirmed_at=None)
    _renglon(vieja, "ESTADO_CHANGED", "ASIGNADA", "CANCELADA", t0)            # pastilla vieja
    _renglon(vieja, "ESTADO_CHANGED", "CANCELADA", "BORRADOR", t0 + dia)      # salida por el PATCH viejo
    lead_vieja = _lead(db, vieja, updated_at=t0 + dia / 2)                    # perdido antes de salir: sin marca
    manual = _sc(db, "SC-U15V02", user_admin, estado="ASIGNADA", gate1_confirmed_at=None)
    _renglon(manual, "CANCELLED", "ASIGNADA", None, t0)                       # CANCELLED sin new_estado
    _renglon(manual, "RESTORED", "CANCELADA", "ASIGNADA", t0 + dia)
    lead_manual = _lead(db, manual, updated_at=t0 + 2 * dia)                  # cambio despues de restaurar: revisar
    revivida = _sc(db, "SC-U15V03", user_admin, estado="COTIZADA", gate1_confirmed_at=None)
    _renglon(revivida, "CANCELLED", "ASIGNADA", "CANCELADA", t0)
    _renglon(revivida, "CANCELLED", "CANCELADA", "CANCELADA", t0 + dia)       # papelera otra vez: no es salida
    lead_revivida = _lead(db, revivida, updated_at=t0 + 2 * dia)             # la sincronizacion vieja la revivio
    ids = [vieja.id, manual.id, revivida.id]

    res = modulo.ajustar_leads(db, aplicar=False, ids=ids)
    por_lead = {e["lead_id"]: e for e in res["ejemplos"]}
    assert set(por_lead) == {lead_vieja.id, lead_manual.id, lead_revivida.id}
    resumen = {lead: (e["ultima_cancelacion"], e["ultima_restauracion"], e["lead_updated_at"], e["revisar"])
               for lead, e in por_lead.items()}
    assert resumen[lead_vieja.id] == (t0, t0 + dia, t0 + dia / 2, False)
    assert resumen[lead_manual.id] == (t0, t0 + dia, t0 + 2 * dia, True)
    assert resumen[lead_revivida.id] == (t0 + dia, None, t0 + 2 * dia, False)

    # El reporte imprime la fecha del lead y la marca, solo en el candidato que la lleva.
    monkeypatch.setattr(modulo, "ajustar", lambda db, aplicar=False, **kw: {
        "candidatas": 0, "ajustadas": 0, "excluidas": 0, "ejemplos": [], "por_regla": {}})
    monkeypatch.setattr(modulo, "ajustar_leads", lambda db, aplicar=False, **kw: res)
    salida = io.StringIO()
    with contextlib.redirect_stdout(salida):
        assert modulo.main([]) == 0
    lineas = {linea.split(" de ")[0].strip(): linea for linea in salida.getvalue().splitlines()
              if linea.strip().startswith("lead #")}
    marca = "posible pérdida manual después de restaurar: revisar"
    assert marca in lineas[f"lead #{lead_manual.id}"]
    assert marca not in lineas[f"lead #{lead_vieja.id}"] and marca not in lineas[f"lead #{lead_revivida.id}"]
    assert "lead actualizado: " in lineas[f"lead #{lead_vieja.id}"]
    assert "restaurada por última vez: nunca" in lineas[f"lead #{lead_revivida.id}"]


def test_scripts_excluyen_documentos_reales(db, user_admin, monkeypatch):
    """R32: DOCUMENTOS_REALES trae exactamente los cuatro numeros reales, y lo que se le agregue (y todo lo vinculado:
    aqui una SC por el numero de su COT) no sale en las candidatas de ajustar ni de ajustar_leads."""
    from app.models.erp_documents import CustomerRequest
    from scripts import ajustar_estados_solicitud as modulo
    assert modulo.DOCUMENTOS_REALES == ("SC-20260731", "COT-20260449", "PVEN-20262799", "SC-20260746")
    por_numero = _sc(db, "SC-U15X01", user_admin, estado="COTIZADA", gate1_confirmed_at=None)
    por_cot = _sc(db, "SC-U15X02", user_admin, estado="RECHAZADA", gate1_confirmed_at=None)
    cot = _cot(db, "COT-U15X02", por_cot, estado="RECHAZADA")
    for sc in (por_numero, por_cot):
        _cancelada_y_restaurada(db, sc)
        _lead(db, sc)
    ids = [por_numero.id, por_cot.id]
    # Sin agregarlos a la lista, las dos SC y sus leads son candidatos (la prueba si prueba algo).
    assert {e["numero"] for e in modulo.ajustar(db, aplicar=False, ids=ids)["ejemplos"]} == {"SC-U15X01", "SC-U15X02"}
    assert modulo.ajustar_leads(db, aplicar=False, ids=ids)["candidatos"] == 2
    monkeypatch.setattr(modulo, "DOCUMENTOS_REALES", modulo.DOCUMENTOS_REALES + (por_numero.numero, cot.numero))
    try:
        res = modulo.ajustar(db, aplicar=False, ids=ids)
        assert res["candidatas"] == 0 and res["ejemplos"] == []
        assert res["excluidas"] == 2
        res_leads = modulo.ajustar_leads(db, aplicar=False, ids=ids)
        assert res_leads["candidatos"] == 0 and res_leads["ejemplos"] == []
        res = modulo.ajustar(db, aplicar=True, ids=ids, tabla_respaldo=TABLA_ESTADOS_TEST)
        assert res["ajustadas"] == 0
        db.expire_all()
        assert [db.get(CustomerRequest, i).estado for i in ids] == ["COTIZADA", "RECHAZADA"]
    finally:
        _borrar_tabla(db, TABLA_ESTADOS_TEST)


def test_script_aplicar_revierte_todo_si_falla_a_mitad(db, user_admin):
    """Una transaccion por parte: si algo falla a mitad de --aplicar / --aplicar-leads no queda nada escrito. La tabla de
    respaldo de prueba se crea antes con un CHECK que rechaza la SEGUNDA fila: cuando la segunda falla, la primera ya
    cambio su estado, guardo su respaldo y anulo su enlace (y su renglon de Actividad esta pendiente), y todo eso tiene
    que deshacerse."""
    from sqlalchemy import text
    from app.core.confirmation_tokens import create_confirmation_token
    from app.models.erp_documents import CustomerRequest
    from app.models.sales import SalesOrder
    from scripts.ajustar_estados_solicitud import ajustar, ajustar_leads
    primera = _sc(db, "SC-U15F01", user_admin, estado="COTIZADA", gate1_confirmed_at=None)      # -> ASIGNADA
    enlace = create_confirmation_token(db, "SC", primera.id)
    segunda = _sc(db, "SC-U15F02", user_admin, con_asesor=False, estado="VENCIDA", gate1_confirmed_at=None)  # -> BORRADOR
    perdido = _etapa(db, "CANCELLED")
    sc_l1 = _sc(db, "SC-U15F03", user_admin, estado="ASIGNADA", gate1_confirmed_at=None)
    sc_l2 = _sc(db, "SC-U15F04", user_admin, estado="ASIGNADA", gate1_confirmed_at=None)
    _cot(db, "COT-U15F04", sc_l2)
    for sc in (sc_l1, sc_l2):
        _cancelada_y_restaurada(db, sc)
    lead_1 = _lead(db, sc_l1, pipeline_stage_id=perdido)                                   # -> DRAFT
    _lead(db, sc_l2, pipeline_stage_id=perdido)                                            # -> QUOTATION
    db.execute(text(f"CREATE TABLE {TABLA_ESTADOS_TEST} (id INTEGER PRIMARY KEY, estado_original VARCHAR(50), "
                    "estado_nuevo VARCHAR(50) CHECK (estado_nuevo <> 'BORRADOR'), gate1_original TIMESTAMP, "
                    "ajustado_at TIMESTAMP DEFAULT now())"))
    db.execute(text(f"CREATE TABLE {TABLA_LEADS_TEST} (id INTEGER PRIMARY KEY, status_original VARCHAR, "
                    "pipeline_stage_id_original INTEGER, status_nuevo VARCHAR CHECK (status_nuevo <> 'QUOTATION'), "
                    "ajustado_at TIMESTAMP DEFAULT now())"))
    db.commit()
    try:
        with pytest.raises(Exception):
            ajustar(db, aplicar=True, ids=[primera.id, segunda.id], tabla_respaldo=TABLA_ESTADOS_TEST)
        db.expire_all()
        assert [db.get(CustomerRequest, i).estado for i in (primera.id, segunda.id)] == ["COTIZADA", "VENCIDA"]
        assert not _token_usado(db, enlace)
        assert _logs(db, "SC", primera.id, "ESTADO_CHANGED") == [] and _logs(db, "SC", segunda.id) == []
        assert db.execute(text(f"SELECT count(*) FROM {TABLA_ESTADOS_TEST}")).scalar() == 0

        with pytest.raises(Exception):
            ajustar_leads(db, aplicar=True, ids=[sc_l1.id, sc_l2.id], tabla_respaldo=TABLA_LEADS_TEST)
        db.expire_all()
        fila = db.get(SalesOrder, lead_1.id)
        assert (fila.status, fila.pipeline_stage_id) == ("CANCELLED", perdido)
        assert db.execute(text(f"SELECT count(*) FROM {TABLA_LEADS_TEST}")).scalar() == 0
    finally:
        _borrar_tabla(db, TABLA_ESTADOS_TEST)
        _borrar_tabla(db, TABLA_LEADS_TEST)


def test_script_rechaza_un_nombre_de_tabla_de_respaldo_peligroso(db):
    from scripts.ajustar_estados_solicitud import ajustar, ajustar_leads
    for funcion in (ajustar, ajustar_leads):
        for nombre in ("x; DROP TABLE users", "Tabla-Con-Guion", "1abc", "", "a b", "abc\n", "abc\r\n"):
            try:
                funcion(db, aplicar=False, ids=[1], tabla_respaldo=nombre)
            except ValueError:
                continue
            raise AssertionError(f"{funcion.__name__} debio rechazar {nombre!r}")


# ─── CLI del script (B9): --aplicar / --aplicar-leads exigen --base igual a current_database() ──────────────────

def _correr_main(monkeypatch, argv):
    """main() con ajustar y ajustar_leads reemplazados por funciones que solo anotan la llamada."""
    from scripts import ajustar_estados_solicitud as modulo
    llamadas = []

    def _ajustar(db, aplicar=False, **kwargs):
        llamadas.append(("ajustar", aplicar))
        return {"candidatas": 0, "ajustadas": 0, "excluidas": 0, "ejemplos": [], "por_regla": {}}

    def _ajustar_leads(db, aplicar=False, **kwargs):
        llamadas.append(("leads", aplicar))
        return {"candidatos": 0, "movidos": 0, "excluidos": 0, "ejemplos": []}

    monkeypatch.setattr(modulo, "ajustar", _ajustar)
    monkeypatch.setattr(modulo, "ajustar_leads", _ajustar_leads)
    salida, errores = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(salida), contextlib.redirect_stderr(errores):
        try:
            codigo = modulo.main(argv)
        except SystemExit as exc:  # argparse
            codigo = exc.code
    return codigo, llamadas, salida.getvalue(), errores.getvalue()


def test_script_sin_flags_reporta_estados_y_leads_sin_escribir(monkeypatch):
    codigo, llamadas, salida, _ = _correr_main(monkeypatch, [])
    assert codigo == 0 and llamadas == [("ajustar", False), ("leads", False)]
    assert "--aplicar --base <nombre de la base>" in salida and "--aplicar-leads --base <nombre de la base>" in salida


def test_script_aplicar_sin_base_no_corre(monkeypatch):
    for flag in ("--aplicar", "--aplicar-leads"):
        codigo, llamadas, _, errores = _correr_main(monkeypatch, [flag])
        assert codigo == 2 and llamadas == [], flag
        assert "exigen --base" in errores, flag


def test_script_no_acepta_aplicar_y_aplicar_leads_juntos(monkeypatch):
    """Cada parte con su propio OK y su propia corrida (un commit por corrida)."""
    codigo, llamadas, _, errores = _correr_main(monkeypatch, ["--aplicar", "--aplicar-leads", "--base", "erp_test"])
    assert codigo == 2 and llamadas == []
    assert "not allowed with argument" in errores


def test_script_aplicar_con_otra_base_aborta_sin_escribir(db, monkeypatch):
    from sqlalchemy import text
    actual = db.execute(text("SELECT current_database()")).scalar()
    for flag in ("--aplicar", "--aplicar-leads"):
        codigo, llamadas, salida, errores = _correr_main(monkeypatch, [flag, "--base", actual + "_otra"])
        assert codigo == 2 and llamadas == [], flag
        assert f"SELECT current_database() -> {actual}" in salida
        assert "ABORTADO" in errores and "no se escribió nada" in errores


def test_script_aplicar_con_la_base_correcta_aplica_solo_lo_pedido(db, monkeypatch):
    from sqlalchemy import text
    actual = db.execute(text("SELECT current_database()")).scalar()
    codigo, llamadas, salida, _ = _correr_main(monkeypatch, ["--aplicar", "--base", actual])
    assert codigo == 0 and llamadas == [("ajustar", True)]
    assert "Ajustadas: 0" in salida
    codigo, llamadas, salida, _ = _correr_main(monkeypatch, ["--aplicar-leads", "--base", actual])
    assert codigo == 0 and llamadas == [("leads", True)]
    assert "Movidos: 0" in salida


# ─── Al final del modulo: SET TRANSACTION READ ONLY dura lo que queda de la transaccion ──────────────────────────

def test_el_reporte_del_script_no_escribe_nada(db, user_admin, contador_sql):
    """El modo reporte, tal como lo corre main(): READ ONLY primero y despues solo lecturas, sin ningun commit. Se
    cuentan las sentencias reales (el rollback final del reporte taparia cualquier escritura)."""
    from scripts.ajustar_estados_solicitud import _solo_lectura, ajustar, ajustar_leads
    heredada = _sc(db, "SC-U15Z01", user_admin, estado="COTIZADA", gate1_confirmed_at=None)   # candidata de ajustar
    _cot(db, "COT-U15Z01", heredada)
    restaurada = _sc(db, "SC-U15Z02", user_admin, estado="ASIGNADA", gate1_confirmed_at=None)
    _cancelada_y_restaurada(db, restaurada)
    _lead(db, restaurada)                                                                  # candidato de ajustar_leads
    sin_documentos = _sc(db, "SC-U15Z03", user_admin, estado="RECHAZADA", gate1_confirmed_at=None)
    ids = [heredada.id, restaurada.id, sin_documentos.id]
    contador_sql.reset()
    _solo_lectura(db)
    res = ajustar(db, aplicar=False, ids=ids)
    _solo_lectura(db)
    res_leads = ajustar_leads(db, aplicar=False, ids=ids)
    assert res["candidatas"] == 2 and res_leads["candidatos"] == 1  # recorrio los dos caminos completos
    sentencias = [s.lstrip().upper() for s in contador_sql.sentencias]
    assert sentencias[0].startswith("SET TRANSACTION READ ONLY"), sentencias[0]
    escrituras = [s for s in sentencias if s.startswith(("INSERT", "UPDATE", "DELETE", "CREATE", "DROP", "ALTER"))]
    assert escrituras == []
    assert contador_sql.commits == 0
