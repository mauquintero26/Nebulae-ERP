"""H36+H43 (y reglas R2/R3): el anticipo de la cotizacion sale de la modalidad de pago de la solicitud.

- R2: Contado -> 100%, 60/40 -> 60%, Credito -> 0%, "Otro" o vacia -> 60%. Siempre min(pct, 100). B2.1 (D7): credito
  es SOLO la lista exacta MODALIDADES_CREDITO ('credito', 'credito 30 dias', 'credito 60 dias', sin tildes ni
  mayusculas); 'Cruce de cuentas', 'Pago a credito', 'Credito 2 cuotas' o 'cr. 90 dias' caen en el 60% por defecto.
- Lo calcula el servidor: al re-cotizar (recotizacion=true) o cuando cambia el total. Cualquier anticipo_cop
  del body se ignora. Recalcular el anticipo no invalida la confirmacion del cliente.
- Si cambia la modalidad de la SC se recalculan sus COT abiertas sin pedido vigente (sin commit intermedio).
- R3: anticipo manual con nota obligatoria (PATCH anticipo_pct_manual / anticipo_manual_nota); todo recalculo
  lo respeta y null vuelve a la modalidad.

Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_anticipo_modalidad
"""
import datetime
from decimal import Decimal

from app.core.ventas_dinero import pct_anticipo_de_modalidad
from tests.usuarios_de_prueba import compras_token  # noqa: F401  (fixture)

MOD_60_40 = "60/40 (60% anticipo - 40% pendiente)"


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _sc(db, numero, modalidad, **campos):
    from app.models.erp_documents import CustomerRequest
    campos.setdefault("estado", "COTIZADA")
    sc = CustomerRequest(numero=numero, customer_name="Cliente Prueba", modalidad_pago=modalidad, **campos)
    db.add(sc); db.commit(); db.refresh(sc)
    return sc


def _cot(db, numero, sc=None, **campos):
    from app.models.erp_documents import SalesQuotation
    campos.setdefault("estado", "BORRADOR")
    if sc is not None:
        campos.setdefault("sc_id", sc.id)
        campos.setdefault("sc_numero", sc.numero)
    cot = SalesQuotation(numero=numero, customer_name="Cliente Prueba", **campos)
    db.add(cot); db.commit(); db.refresh(cot)
    return cot


def _linea(total):
    return [{"product_name": "Cuna Colecho", "qty": 1, "unit_price_cop": total, "total_cop": total}]


def _patch_cot(app_client, token, cot_id, body):
    body.setdefault("updated_by", "t")
    return app_client.patch(f"/api/v1/ventas/cotizaciones/{cot_id}", json=body, headers=auth(token))


def _logs(db, entidad, entity_id, accion=None):
    from app.models.erp_documents import ActivityLog
    db.expire_all()
    q = db.query(ActivityLog).filter(ActivityLog.entity_type == entidad, ActivityLog.entity_id == entity_id)
    if accion:
        q = q.filter(ActivityLog.action == accion)
    return q.order_by(ActivityLog.id.asc()).all()


# --- R2: porcentaje de la modalidad (puro) -------------------------------------------------------

def test_pct_anticipo_de_modalidad():
    assert pct_anticipo_de_modalidad(MOD_60_40) == Decimal("60")
    assert pct_anticipo_de_modalidad("Contado") == Decimal("100")
    assert pct_anticipo_de_modalidad("Credito 30 dias") == Decimal("0")
    assert pct_anticipo_de_modalidad("Crédito 60 Días") == Decimal("0")
    assert pct_anticipo_de_modalidad(None) is None
    assert pct_anticipo_de_modalidad("Otro") is None


def test_pct_anticipo_de_modalidad_sin_tildes_ni_mayusculas():
    assert pct_anticipo_de_modalidad("  CONTADO ") == Decimal("100")
    assert pct_anticipo_de_modalidad("CRÉDITO") == Decimal("0")
    assert pct_anticipo_de_modalidad("Credito 30 Dias") == Decimal("0")   # texto de la agenda
    assert pct_anticipo_de_modalidad("cr. 90 dias") is None               # D7: no esta en la lista exacta
    assert pct_anticipo_de_modalidad("") is None
    assert pct_anticipo_de_modalidad("   ") is None


def test_d7_solo_la_lista_exacta_de_modalidades_a_credito_cobra_0():
    """B2.1 (D7, decision del usuario): ya no es credito todo lo que empiece por «cr» o diga «credito», sino solo la
    lista exacta (las dos modalidades a credito del formulario de la SC, mas 'credito' a secas), comparada sin tildes,
    sin mayusculas y sin los espacios de los bordes. Lo demas da None: el 60% por defecto de anticipo_cotizacion."""
    from app.core.ventas_dinero import MODALIDADES_CREDITO
    assert MODALIDADES_CREDITO == frozenset({"credito", "credito 30 dias", "credito 60 dias"})
    for modalidad in ("Credito 30 dias", "Crédito 60 días", "CREDITO 30 DIAS", "credito", "  Crédito 30 Días  ",
                      "Ｃｒｅｄｉｔｏ 60 dias",
                      # r1: los caracteres de formato (Cf) no cuentan, como en claveModalidad del frontend
                      "\ufeffCredito 30 dias", "Cre\u00addito 60 dias\u200b"):
        assert pct_anticipo_de_modalidad(modalidad) == Decimal("0"), ascii(modalidad)
    for modalidad in ("Cruce de cuentas", "Pago a credito", "Credito 2 cuotas", "cr. 90 dias", "Credito 30d",
                      "Credito 90 dias", "Credito  30 dias", "Descreditos"):
        assert pct_anticipo_de_modalidad(modalidad) is None, modalidad
    assert pct_anticipo_de_modalidad("Contado") == Decimal("100")
    assert pct_anticipo_de_modalidad(MOD_60_40) == Decimal("60")


# --- Re-cotizar y guardar la cotizacion ----------------------------------------------------------

def test_primer_calculo_de_cot_de_sc_60_40_pone_el_anticipo_al_60(app_client, db, admin_token):
    sc = _sc(db, "SC-ANT001", MOD_60_40)
    cot = _cot(db, "COT-ANT001", sc, total_cop=0, anticipo_cop=0)
    resp = _patch_cot(app_client, admin_token, cot.id, {
        "productos": _linea(2874000), "subtotal_cop": 2874000, "total_cop": 2874000, "recotizacion": True})
    assert resp.status_code == 200, resp.text
    db.refresh(cot)
    assert cot.anticipo_cop == Decimal("1724400")
    assert resp.json()["data"]["anticipo_cop"] == 1724400


def test_recotizar_recalcula_el_anticipo_e_ignora_el_del_body(app_client, db, admin_token):
    sc = _sc(db, "SC-ANT002", MOD_60_40)
    cot = _cot(db, "COT-ANT002", sc, total_cop=2874000, subtotal_cop=2874000, anticipo_cop=1724400,
               productos=_linea(2874000))
    resp = _patch_cot(app_client, admin_token, cot.id, {
        "productos": _linea(2786923), "subtotal_cop": 2786923, "total_cop": 2786923, "anticipo_cop": 1724400,
        "recotizacion": True})
    assert resp.status_code == 200, resp.text
    db.refresh(cot)
    assert cot.anticipo_cop == Decimal("1672154")


def test_contado_exige_100_y_credito_0(app_client, db, admin_token):
    sc_contado = _sc(db, "SC-ANT003", "Contado")
    sc_credito = _sc(db, "SC-ANT004", "Credito 30 dias")
    cot_contado = _cot(db, "COT-ANT003", sc_contado, total_cop=0, anticipo_cop=0)
    cot_credito = _cot(db, "COT-ANT004", sc_credito, total_cop=0, anticipo_cop=555)
    for cot in (cot_contado, cot_credito):
        resp = _patch_cot(app_client, admin_token, cot.id, {"total_cop": 1000000, "subtotal_cop": 1000000})
        assert resp.status_code == 200, resp.text
    db.refresh(cot_contado); db.refresh(cot_credito)
    assert cot_contado.anticipo_cop == Decimal("1000000")
    assert cot_credito.anticipo_cop == Decimal("0")


def test_modalidad_otro_o_vacia_pide_60(app_client, db, admin_token):
    for i, modalidad in enumerate(("Otro", None, "")):
        sc = _sc(db, f"SC-ANT02{i}", modalidad)
        if modalidad is None:  # el default del modelo ('Contado') se aplica al insertar un None: forzar NULL
            sc.modalidad_pago = None
            db.commit()
        cot = _cot(db, f"COT-ANT02{i}", sc, total_cop=0, anticipo_cop=0)
        resp = _patch_cot(app_client, admin_token, cot.id, {"total_cop": 1000000})
        assert resp.status_code == 200, resp.text
        db.refresh(cot)
        assert cot.anticipo_cop == Decimal("600000"), modalidad


def test_d7_una_modalidad_fuera_de_la_lista_pide_60_y_una_de_la_lista_0(app_client, db, admin_token):
    """B2.1 (D7): el anticipo que exige la COT. 'Cruce de cuentas' (empieza por «cr») y 'Pago a credito' (dice
    «credito») ya no se cobran sin anticipo: piden el 60% por defecto. 'CREDITO 30 DIAS' sigue en 0."""
    for i, (modalidad, anticipo) in enumerate((("Cruce de cuentas", "600000"), ("Pago a credito", "600000"),
                                               ("CREDITO 30 DIAS", "0"))):
        sc = _sc(db, f"SC-ANT06{i}", modalidad)
        cot = _cot(db, f"COT-ANT06{i}", sc, total_cop=0, anticipo_cop=0)
        resp = _patch_cot(app_client, admin_token, cot.id, {"total_cop": 1000000, "subtotal_cop": 1000000})
        assert resp.status_code == 200, resp.text
        db.refresh(cot)
        assert cot.anticipo_cop == Decimal(anticipo), modalidad


def test_patch_sin_total_no_toca_el_anticipo(app_client, db, admin_token):
    sc = _sc(db, "SC-ANT005", "Contado")
    cot = _cot(db, "COT-ANT005", sc, total_cop=1000000, anticipo_cop=600000)
    resp = _patch_cot(app_client, admin_token, cot.id, {"notas": "x"})
    assert resp.status_code == 200, resp.text
    resp = _patch_cot(app_client, admin_token, cot.id, {"anticipo_cop": 1})
    assert resp.status_code == 200, resp.text
    db.refresh(cot)
    assert cot.anticipo_cop == Decimal("600000")


def test_recalcular_el_anticipo_no_invalida_la_confirmacion(app_client, db, admin_token):
    sc = _sc(db, "SC-ANT006", "Contado")
    cot = _cot(db, "COT-ANT006", sc, estado="PENDIENTE_CONFIRMACION", total_cop=1000, anticipo_cop=0,
               productos=_linea(1000))
    resp = _patch_cot(app_client, admin_token, cot.id, {"total_cop": 1000, "recotizacion": True})
    assert resp.status_code == 200, resp.text
    db.refresh(cot)
    assert cot.estado == "PENDIENTE_CONFIRMACION"
    assert cot.anticipo_cop == Decimal("1000")


def test_cambiar_el_total_de_una_cot_confirmada_si_invalida_la_confirmacion(app_client, db, admin_token):
    sc = _sc(db, "SC-ANT016", MOD_60_40)
    cot = _cot(db, "COT-ANT016", sc, estado="CONFIRMADA", total_cop=1000, anticipo_cop=600,
               productos=_linea(1000), gate2_confirmed_at=datetime.datetime.utcnow())
    resp = _patch_cot(app_client, admin_token, cot.id, {"total_cop": 2000, "productos": _linea(2000),
                                                        "anular_confirmacion": True,  # H40 (B2-T4)
                                                        "motivo_recotizacion": "Prueba de cambio"})
    assert resp.status_code == 200, resp.text
    db.refresh(cot)
    assert cot.estado == "BORRADOR"
    assert cot.anticipo_cop == Decimal("1200")


def test_get_cotizacion_expone_pct_y_modalidad(app_client, db, admin_token):
    sc = _sc(db, "SC-ANT007", MOD_60_40)
    cot = _cot(db, "COT-ANT007", sc, total_cop=1000000, anticipo_cop=0)
    resp = app_client.get(f"/api/v1/ventas/cotizaciones/{cot.id}", headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    d = resp.json()["data"]
    assert d["anticipo_pct"] == 60.0
    assert d["sc_modalidad_pago"] == MOD_60_40
    # El requerido sale de la modalidad aunque el anticipo guardado este viejo (0).
    assert d["anticipo_requerido"] == 600000
    assert d["saldo_a_favor"] == 0
    assert d["saldo_a_favor_detalle"] == []
    assert d["anticipo_por_verificar"] == 600000
    assert d["anticipo_pct_manual"] is None
    assert d["anticipo_manual_nota"] is None


def test_cot_sin_sc_conserva_su_porcentaje(app_client, db, admin_token):
    cot = _cot(db, "COT-ANT008", total_cop=1000000, anticipo_cop=600000)
    resp = _patch_cot(app_client, admin_token, cot.id, {"total_cop": 2000000})
    assert resp.status_code == 200, resp.text
    db.refresh(cot)
    assert cot.anticipo_cop == Decimal("1200000")


def test_recotizar_sin_cambiar_el_total_conserva_el_anticipo_heredado(app_client, db, admin_token):
    """H36 (ronda 2): un % heredado raro (1.000.000 sobre 1.500.000) se conserva tal cual: re-cotizar sin cambiar
    el total no lo reescribe, tampoco en una COT confirmada; con otro total se aplica el mismo % exacto."""
    for i, estado in enumerate(("BORRADOR", "CONFIRMADA")):
        cot = _cot(db, f"COT-ANT03{i}", estado=estado, total_cop=1500000, anticipo_cop=1000000,
                   productos=_linea(1500000), gate2_confirmed_at=datetime.datetime.utcnow())
        resp = _patch_cot(app_client, admin_token, cot.id, {"total_cop": 1500000, "recotizacion": True})
        assert resp.status_code == 200, resp.text
        db.refresh(cot)
        assert cot.anticipo_cop == Decimal("1000000") and cot.estado == estado
    resp = _patch_cot(app_client, admin_token, cot.id, {"total_cop": 3000000, "productos": _linea(3000000),
                                                        "anular_confirmacion": True,  # H40 (B2-T4)
                                                        "motivo_recotizacion": "Prueba de cambio"})
    assert resp.status_code == 200, resp.text
    db.refresh(cot)
    assert cot.anticipo_cop == Decimal("2000000")


def test_cot_sin_sc_y_sin_total_arranca_en_60(app_client, db, admin_token):
    cot = _cot(db, "COT-ANT009", total_cop=0, anticipo_cop=0)
    resp = _patch_cot(app_client, admin_token, cot.id, {"total_cop": 1000000})
    assert resp.status_code == 200, resp.text
    db.refresh(cot)
    assert cot.anticipo_cop == Decimal("600000")


def test_cot_sin_sc_con_anticipo_mayor_que_el_total_se_limita_al_100(app_client, db, admin_token):
    cot = _cot(db, "COT-ANT017", total_cop=1000000, anticipo_cop=1200000)
    resp = app_client.get(f"/api/v1/ventas/cotizaciones/{cot.id}", headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["anticipo_pct"] == 100.0
    assert resp.json()["data"]["anticipo_requerido"] == 1000000
    resp = _patch_cot(app_client, admin_token, cot.id, {"total_cop": 2000000})
    assert resp.status_code == 200, resp.text
    db.refresh(cot)
    assert cot.anticipo_cop == Decimal("2000000")


def test_crear_la_cot_desde_una_sc_toma_el_porcentaje_de_la_modalidad(app_client, db, admin_token):
    from app.models.erp_documents import SalesQuotation
    # C7/R11 (Bloque 2, T3): POST /cotizaciones con sc_id exige la confirmacion vigente del cliente.
    sc = _sc(db, "SC-ANT018", MOD_60_40, estado="CONFIRMADA", gate1_confirmed_at=datetime.datetime.utcnow())
    resp = app_client.post("/api/v1/ventas/cotizaciones", json={
        "sc_id": sc.id, "total_cop": 1000000, "subtotal_cop": 1000000, "anticipo_cop": 1,
        "productos": _linea(1000000), "created_by": "t"}, headers=auth(admin_token))
    assert resp.status_code == 201, resp.text
    cot = db.query(SalesQuotation).filter(SalesQuotation.id == resp.json()["data"]["id"]).one()
    assert cot.anticipo_cop == Decimal("600000")
    # Sin SC (Cotizador Rapido) se respeta el anticipo que manda, en pesos enteros.
    resp = app_client.post("/api/v1/ventas/cotizaciones", json={
        "customer_name": "Cliente Prueba", "total_cop": 1000000, "anticipo_cop": 600000.4,
        "productos": _linea(1000000), "created_by": "t"}, headers=auth(admin_token))
    assert resp.status_code == 201, resp.text
    cot = db.query(SalesQuotation).filter(SalesQuotation.id == resp.json()["data"]["id"]).one()
    assert cot.anticipo_cop == Decimal("600000")


# --- Cambio de modalidad en la SC ------------------------------------------------------------------

def test_cambiar_la_modalidad_de_la_sc_recalcula_la_cot_abierta(app_client, db, admin_token):
    sc = _sc(db, "SC-ANT010", MOD_60_40)
    cot = _cot(db, "COT-ANT010", sc, total_cop=1000000, anticipo_cop=600000)
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={"modalidad_pago": "Contado", "updated_by": "t"},
                            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    db.refresh(cot)
    assert cot.anticipo_cop == Decimal("1000000")
    renglones = [l for l in _logs(db, "COT", cot.id, "UPDATED") if "Anticipo recalculado" in (l.description or "")]
    assert len(renglones) == 1
    assert renglones[0].description == (
        "Anticipo recalculado por cambio de modalidad de pago de SC-ANT010 (Contado): $600.000 → $1.000.000")


def test_cambiar_la_modalidad_no_toca_cot_cerradas_ni_con_pedido_vigente(app_client, db, admin_token):
    from app.models.erp_documents import SaleOrder
    sc = _sc(db, "SC-ANT011", MOD_60_40)
    rechazada = _cot(db, "COT-ANT011", sc, estado="RECHAZADA", total_cop=1000000, anticipo_cop=600000)
    con_pedido = _cot(db, "COT-ANT012", sc, estado="CONFIRMADA", total_cop=1000000, anticipo_cop=600000)
    db.add(SaleOrder(numero="PVEN-ANT012", cot_id=con_pedido.id, customer_name="Cliente Prueba",
                     estado="PENDIENTE_COMPRA", total_cop=1000000))
    con_pedido_cancelado = _cot(db, "COT-ANT013", sc, estado="CONFIRMADA", total_cop=1000000, anticipo_cop=600000)
    db.add(SaleOrder(numero="PVEN-ANT013", cot_id=con_pedido_cancelado.id, customer_name="Cliente Prueba",
                     estado="CANCELADO", total_cop=1000000))
    db.commit()
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={"modalidad_pago": "Credito 30 dias"},
                            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    db.refresh(rechazada); db.refresh(con_pedido); db.refresh(con_pedido_cancelado)
    assert rechazada.anticipo_cop == Decimal("600000")
    assert con_pedido.anticipo_cop == Decimal("600000")
    assert con_pedido_cancelado.anticipo_cop == Decimal("0")   # su pedido esta cancelado: cuenta como abierta


def test_cambiar_la_modalidad_no_agrega_commits_por_cotizacion(app_client, db, admin_token, contador_sql):
    """Choque H36/H29: el recalculo va antes del commit de update_solicitud y registra con commit=False."""
    sc_con = _sc(db, "SC-ANT014", MOD_60_40)
    cot_a = _cot(db, "COT-ANT014", sc_con, total_cop=1000000, anticipo_cop=600000)
    cot_b = _cot(db, "COT-ANT015", sc_con, total_cop=2000000, anticipo_cop=1200000)
    sc_sin = _sc(db, "SC-ANT015", MOD_60_40)
    with contador_sql.ventana() as con_cots:
        resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc_con.id}", json={"modalidad_pago": "Contado"},
                                headers=auth(admin_token))
        assert resp.status_code == 200, resp.text
    with contador_sql.ventana() as sin_cots:
        resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc_sin.id}", json={"modalidad_pago": "Contado"},
                                headers=auth(admin_token))
        assert resp.status_code == 200, resp.text
    assert con_cots.commits == sin_cots.commits
    db.refresh(cot_a); db.refresh(cot_b)
    assert (cot_a.anticipo_cop, cot_b.anticipo_cop) == (Decimal("1000000"), Decimal("2000000"))
    for cot in (cot_a, cot_b):
        assert [l for l in _logs(db, "COT", cot.id, "UPDATED") if "Anticipo recalculado" in (l.description or "")]


# --- R3: anticipo manual con nota obligatoria -------------------------------------------------------

def test_anticipo_manual_con_nota_cambia_el_anticipo_y_deja_su_renglon(app_client, db, admin_token):
    sc = _sc(db, "SC-MAN001", MOD_60_40)
    cot = _cot(db, "COT-MAN001", sc, total_cop=1000000, anticipo_cop=600000)
    resp = _patch_cot(app_client, admin_token, cot.id, {
        "anticipo_pct_manual": 50, "anticipo_manual_nota": "  Negociado con gerencia  "})
    assert resp.status_code == 200, resp.text
    db.refresh(cot)
    assert cot.anticipo_pct_manual == Decimal("50.00")
    assert cot.anticipo_manual_nota == "Negociado con gerencia"
    assert cot.anticipo_cop == Decimal("500000")
    data = resp.json()["data"]
    assert data["anticipo_pct_manual"] == 50.0 and data["anticipo_manual_nota"] == "Negociado con gerencia"
    renglones = _logs(db, "COT", cot.id)
    textos = [l.description for l in renglones]
    assert "Anticipo ajustado a mano: 50% (antes 60%). Nota: Negociado con gerencia" in textos
    # El ajuste no se registra ademas como una re-cotizacion.
    assert not [l for l in renglones if l.action == "RECOTIZADA"]


def test_anticipo_manual_se_ve_en_el_get(app_client, db, admin_token):
    sc = _sc(db, "SC-MAN002", "Contado")
    cot = _cot(db, "COT-MAN002", sc, total_cop=1000000, anticipo_cop=1000000)
    resp = _patch_cot(app_client, admin_token, cot.id, {"anticipo_pct_manual": 12.5, "anticipo_manual_nota": "Cliente frecuente"})
    assert resp.status_code == 200, resp.text
    d = app_client.get(f"/api/v1/ventas/cotizaciones/{cot.id}", headers=auth(admin_token)).json()["data"]
    assert d["anticipo_pct_manual"] == 12.5
    assert d["anticipo_manual_nota"] == "Cliente frecuente"
    assert d["anticipo_pct"] == 12.5
    assert d["anticipo_requerido"] == 125000
    assert d["sc_modalidad_pago"] == "Contado"
    assert "Anticipo ajustado a mano: 12,5% (antes 100%). Nota: Cliente frecuente" in [
        a["description"] for a in d["actividades"]]


def test_anticipo_manual_valida_porcentaje_y_nota(app_client, db, admin_token):
    sc = _sc(db, "SC-MAN003", MOD_60_40)
    cot = _cot(db, "COT-MAN003", sc, total_cop=1000000, anticipo_cop=600000)
    malos = [
        ({"anticipo_pct_manual": 120, "anticipo_manual_nota": "Negociado"}, "entre 0% y 100%"),
        ({"anticipo_pct_manual": -1, "anticipo_manual_nota": "Negociado"}, "entre 0% y 100%"),
        ({"anticipo_pct_manual": "abc", "anticipo_manual_nota": "Negociado"}, "entre 0% y 100%"),
        ({"anticipo_pct_manual": True, "anticipo_manual_nota": "Negociado"}, "entre 0% y 100%"),
        ({"anticipo_pct_manual": 50}, "nota"),
        ({"anticipo_pct_manual": 50, "anticipo_manual_nota": "  ok  "}, "nota"),
        ({"anticipo_pct_manual": 50, "anticipo_manual_nota": None}, "nota"),
    ]
    for body, texto in malos:
        resp = _patch_cot(app_client, admin_token, cot.id, dict(body, notas="no debe guardarse"))
        assert resp.status_code == 422, (body, resp.text)
        assert texto in resp.json()["detail"], (body, resp.text)
    db.refresh(cot)
    assert cot.anticipo_pct_manual is None and cot.anticipo_manual_nota is None
    assert cot.anticipo_cop == Decimal("600000")
    assert cot.notas != "no debe guardarse"


def test_anticipo_manual_en_los_limites_0_y_100(app_client, db, admin_token):
    sc = _sc(db, "SC-MAN004", MOD_60_40)
    cot = _cot(db, "COT-MAN004", sc, total_cop=1000000, anticipo_cop=600000)
    resp = _patch_cot(app_client, admin_token, cot.id, {"anticipo_pct_manual": 0, "anticipo_manual_nota": "Cliente corporativo"})
    assert resp.status_code == 200, resp.text
    db.refresh(cot)
    assert cot.anticipo_pct_manual == Decimal("0") and cot.anticipo_cop == Decimal("0")
    resp = _patch_cot(app_client, admin_token, cot.id, {"anticipo_pct_manual": "100", "anticipo_manual_nota": "Pago completo"})
    assert resp.status_code == 200, resp.text
    db.refresh(cot)
    assert cot.anticipo_pct_manual == Decimal("100") and cot.anticipo_cop == Decimal("1000000")


def test_anticipo_manual_no_se_ajusta_en_cot_cerrada_o_con_pedido_vigente(app_client, db, admin_token):
    from app.models.erp_documents import SaleOrder
    sc = _sc(db, "SC-MAN005", MOD_60_40)
    body = {"anticipo_pct_manual": 50, "anticipo_manual_nota": "Negociado con gerencia"}
    for i, estado in enumerate(("RECHAZADA", "CANCELADA")):
        cot = _cot(db, f"COT-MAN05{i}", sc, estado=estado, total_cop=1000000, anticipo_cop=600000)
        resp = _patch_cot(app_client, admin_token, cot.id, dict(body))
        assert resp.status_code == 409, resp.text
        db.refresh(cot)
        assert cot.anticipo_pct_manual is None and cot.anticipo_cop == Decimal("600000")
    convertida = _cot(db, "COT-MAN053", sc, estado="CONFIRMADA", total_cop=1000000, anticipo_cop=600000)
    db.add(SaleOrder(numero="PVEN-MAN053", cot_id=convertida.id, customer_name="Cliente Prueba",
                     estado="PENDIENTE_COMPRA", total_cop=1000000))
    db.commit()
    resp = _patch_cot(app_client, admin_token, convertida.id, dict(body))
    assert resp.status_code == 409, resp.text
    assert "PVEN-MAN053" in resp.json()["detail"]


def test_anticipo_manual_no_invalida_la_confirmacion(app_client, db, admin_token):
    sc = _sc(db, "SC-MAN006", MOD_60_40)
    cot = _cot(db, "COT-MAN006", sc, estado="CONFIRMADA", total_cop=1000000, anticipo_cop=600000,
               productos=_linea(1000000), gate2_confirmed_at=datetime.datetime.utcnow())
    resp = _patch_cot(app_client, admin_token, cot.id, {"anticipo_pct_manual": 50, "anticipo_manual_nota": "Negociado con gerencia"})
    assert resp.status_code == 200, resp.text
    db.refresh(cot)
    assert cot.estado == "CONFIRMADA" and cot.gate2_confirmed_at is not None
    assert cot.anticipo_cop == Decimal("500000")


def test_recotizar_y_cambiar_la_modalidad_respetan_el_anticipo_manual(app_client, db, admin_token):
    sc = _sc(db, "SC-MAN007", MOD_60_40)
    cot = _cot(db, "COT-MAN007", sc, total_cop=1000000, anticipo_cop=600000)
    resp = _patch_cot(app_client, admin_token, cot.id, {"anticipo_pct_manual": 50, "anticipo_manual_nota": "Negociado con gerencia"})
    assert resp.status_code == 200, resp.text
    resp = _patch_cot(app_client, admin_token, cot.id, {"total_cop": 2000000, "recotizacion": True})
    assert resp.status_code == 200, resp.text
    db.refresh(cot)
    assert cot.anticipo_cop == Decimal("1000000")
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={"modalidad_pago": "Contado"},
                            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    db.refresh(cot)
    assert cot.anticipo_cop == Decimal("1000000")
    assert cot.anticipo_pct_manual == Decimal("50.00")


def test_quitar_el_anticipo_manual_vuelve_a_la_modalidad(app_client, db, admin_token):
    sc = _sc(db, "SC-MAN008", MOD_60_40)
    cot = _cot(db, "COT-MAN008", sc, total_cop=1000000, anticipo_cop=600000)
    _patch_cot(app_client, admin_token, cot.id, {"anticipo_pct_manual": 50, "anticipo_manual_nota": "Negociado con gerencia"})
    resp = _patch_cot(app_client, admin_token, cot.id, {"anticipo_pct_manual": None})
    assert resp.status_code == 200, resp.text
    db.refresh(cot)
    assert cot.anticipo_pct_manual is None and cot.anticipo_manual_nota is None
    assert cot.anticipo_cop == Decimal("600000")
    textos = [l.description for l in _logs(db, "COT", cot.id)]
    assert "Anticipo vuelve a la modalidad (60%)" in textos
    # Quitarlo otra vez no hace nada ni deja otro renglon.
    resp = _patch_cot(app_client, admin_token, cot.id, {"anticipo_pct_manual": None})
    assert resp.status_code == 200, resp.text
    assert [l.description for l in _logs(db, "COT", cot.id)].count("Anticipo vuelve a la modalidad (60%)") == 1


def test_quitar_el_anticipo_manual_de_una_cot_sin_sc_vuelve_al_60(app_client, db, admin_token):
    cot = _cot(db, "COT-MAN009", total_cop=1000000, anticipo_cop=1000000)
    _patch_cot(app_client, admin_token, cot.id, {"anticipo_pct_manual": 30, "anticipo_manual_nota": "Negociado con gerencia"})
    db.refresh(cot)
    assert cot.anticipo_cop == Decimal("300000")
    resp = _patch_cot(app_client, admin_token, cot.id, {"anticipo_pct_manual": None})
    assert resp.status_code == 200, resp.text
    db.refresh(cot)
    assert cot.anticipo_cop == Decimal("600000")


def test_el_asesor_puede_ajustar_el_anticipo(app_client, db, vendedor_token):
    sc = _sc(db, "SC-MAN010", MOD_60_40)
    cot = _cot(db, "COT-MAN010", sc, total_cop=1000000, anticipo_cop=600000)
    resp = _patch_cot(app_client, vendedor_token, cot.id, {"anticipo_pct_manual": 40, "anticipo_manual_nota": "Negociado con gerencia"})
    assert resp.status_code == 200, resp.text
    db.refresh(cot)
    assert cot.anticipo_cop == Decimal("400000")


def test_compras_no_puede_ajustar_el_anticipo(app_client, db, compras_token):
    """Fix 9: el ajuste manual lo hace quien edita la COT (asesor o administracion)."""
    sc = _sc(db, "SC-MAN011", MOD_60_40)
    cot = _cot(db, "COT-MAN011", sc, total_cop=1000000, anticipo_cop=600000)
    resp = _patch_cot(app_client, compras_token, cot.id, {"anticipo_pct_manual": 0, "anticipo_manual_nota": "Negociado con gerencia"})
    assert resp.status_code == 403, resp.text
    db.refresh(cot)
    assert cot.anticipo_pct_manual is None and cot.anticipo_cop == Decimal("600000")


def test_reenviar_el_mismo_anticipo_manual_no_bloquea_el_patch(app_client, db, admin_token):
    """Fix 6: el 409 solo salta si el anticipo manual de verdad cambia; reenviar lo guardado no bloquea el resto."""
    from app.models.erp_documents import SaleOrder
    sc = _sc(db, "SC-MAN012", MOD_60_40)
    convertida = _cot(db, "COT-MAN012", sc, estado="CONFIRMADA", total_cop=1000000, anticipo_cop=600000)
    db.add(SaleOrder(numero="PVEN-MAN012", cot_id=convertida.id, customer_name="Cliente Prueba",
                     estado="PENDIENTE_COMPRA", total_cop=1000000))
    db.commit()
    resp = _patch_cot(app_client, admin_token, convertida.id, {"notas": "x", "anticipo_pct_manual": None})
    assert resp.status_code == 200, resp.text
    db.refresh(convertida)
    assert convertida.notas == "x"

    nota = "Negociado con gerencia"
    rechazada = _cot(db, "COT-MAN013", sc, estado="RECHAZADA", total_cop=1000000, anticipo_cop=500000,
                     anticipo_pct_manual=Decimal("50"), anticipo_manual_nota=nota)
    for body in ({"notas": "y", "anticipo_pct_manual": 50, "anticipo_manual_nota": nota},
                 {"notas": "w", "anticipo_pct_manual": 50, "anticipo_manual_nota": None},
                 {"notas": "v", "anticipo_pct_manual": 50, "anticipo_manual_nota": "  "},
                 {"notas": "z", "anticipo_pct_manual": "50.00"}):
        resp = _patch_cot(app_client, admin_token, rechazada.id, body)
        assert resp.status_code == 200, (body, resp.text)
    db.refresh(rechazada)
    assert rechazada.notas == "z" and rechazada.anticipo_cop == Decimal("500000")
    for body in ({"anticipo_pct_manual": 40, "anticipo_manual_nota": "Otra negociación"},
                 {"anticipo_pct_manual": 50, "anticipo_manual_nota": "Otra negociación"},
                 {"anticipo_pct_manual": None}):
        resp = _patch_cot(app_client, admin_token, rechazada.id, body)
        assert resp.status_code == 409, (body, resp.text)
    db.refresh(rechazada)
    assert rechazada.anticipo_pct_manual == Decimal("50.00") and rechazada.anticipo_manual_nota == nota


def test_guardar_otra_vez_el_mismo_anticipo_manual_no_repite_el_renglon(app_client, db, admin_token):
    sc = _sc(db, "SC-MAN014", MOD_60_40)
    cot = _cot(db, "COT-MAN014", sc, total_cop=1000000, anticipo_cop=600000)
    for _ in range(2):
        resp = _patch_cot(app_client, admin_token, cot.id, {"anticipo_pct_manual": 50, "anticipo_manual_nota": "Negociado con gerencia"})
        assert resp.status_code == 200, resp.text
    assert len(_logs(db, "COT", cot.id, "ANTICIPO_MANUAL")) == 1
    # Mismo % con otra nota: se guarda la nota nueva y queda su renglon.
    resp = _patch_cot(app_client, admin_token, cot.id, {"anticipo_pct_manual": 50, "anticipo_manual_nota": "Aprobado por gerencia"})
    assert resp.status_code == 200, resp.text
    db.refresh(cot)
    assert cot.anticipo_manual_nota == "Aprobado por gerencia"
    assert len(_logs(db, "COT", cot.id, "ANTICIPO_MANUAL")) == 2
