"""B4 T6C (KPI-ventas punto 3 con R5, R7 y R21; C3, C6, C12; RP3, RP29, RP79, RP83): GET /api/v1/ventas/stats con
todos los roles del ERP, el período validado a mano, las claves de hoy, ven_por_estado, los indicadores de las tarjetas
(kpis, con los filtros f_* de core/resolucion_ventas.py y los resúmenes de las listas) y los bloques periodo y flujo.

Se corre SOLO con el runner de ROLLBACK (python tests/rollback_runner.py test_kpis_ventas): cada prueba va en una
transacción que se revierte. erp_test es compartida y ya tiene datos, así que las pruebas 1 a 4 afirman DIFERENCIAS entre
un GET antes y otro después de crear sus documentos (sufijo uuid y un db.add por objeto). Las del bloque flujo con
números absolutos fijan «hoy» en 2001 (monkeypatch de fechas.hoy_colombia), donde erp_test no tiene documentos. La
prueba 6 de paridad del diseño es de T2 (test_paridad_reglas_ventas.py).
"""
import uuid
from datetime import date, datetime, timedelta

from app.models.erp_documents import CustomerRequest, PaymentPending, SaleOrder, SalesQuotation
from tests.usuarios_de_prueba import bodega_token  # noqa: F401 (fixture por nombre, RP79)

RUTA = "/api/v1/ventas/stats"
CLAVES_VIEJAS = {"sc_total", "cot_total", "ven_total", "pxp_pendiente", "ven_monto_total", "sc_por_estado",
                 "cot_por_estado"}
CLAVES_KPIS = ("sc_activas", "sc_esperan_cotizacion", "sc_confirmadas", "sc_canceladas", "sc_total", "cot_activas",
               "cot_sin_precio", "cot_confirmadas", "cot_con_pedido", "cot_por_convertir", "cot_monto_confirmado",
               "cot_rechazadas", "cot_total", "pven_total", "pven_en_curso", "pven_saldo_en_curso",
               "pven_pendiente_compra", "pven_cancelados", "pven_con_dinero", "pven_monto_vendido",
               "pven_monto_entregado", "pven_saldo_por_cobrar", "pven_anticipo")
CLAVES_FLUJO = ("vendido_cop", "pedidos_nuevos", "ticket_promedio_cop", "cot_conversion_pct", "solicitudes_nuevas",
                "cotizaciones_nuevas")


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _ahora():
    from app.core.fechas import ahora_utc
    return ahora_utc()


def _stats(app_client, token, **params):
    resp = app_client.get(RUTA, params=params, headers=_auth(token))
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


def _diferencia(antes: dict, despues: dict, claves) -> dict:
    return {c: despues[c] - antes[c] for c in claves}


def _fijar_hoy(monkeypatch, dia: date):
    """«Hoy» en Colombia para resolver_periodo (core/periodos.py llama fechas.hoy_colombia): los períodos de las
    tarjetas caen en 2000-2001, donde erp_test no tiene documentos."""
    from app.core import fechas
    monkeypatch.setattr(fechas, "hoy_colombia", lambda ahora_utc=None: dia)


class _Fabrica:
    """Documentos con un sufijo único y created_at = updated_at = `cuando` (por defecto, ahora). Un db.add por objeto."""

    def __init__(self, db):
        self.db = db
        self.sufijo = uuid.uuid4().hex[:8].upper()
        self.cliente = f"KPI {self.sufijo}"
        self.n = 0

    def _numero(self, prefijo):
        self.n += 1
        return f"{prefijo}{self.sufijo}{self.n:02d}"

    def _guardar(self, objeto):
        self.db.add(objeto)
        self.db.commit()
        return objeto

    def sc(self, estado="BORRADOR", cuando=None, **campos):
        t = cuando or _ahora()
        campos.setdefault("tipo_solicitud", "Cotizacion de Producto")
        return self._guardar(CustomerRequest(numero=self._numero("SC-K"), customer_name=self.cliente, estado=estado,
                                             created_at=t, updated_at=t, **campos))

    def cot(self, estado="BORRADOR", cuando=None, sc=None, **campos):
        t = cuando or _ahora()
        return self._guardar(SalesQuotation(numero=self._numero("COT-K"), customer_name=self.cliente,
                                            sc_id=sc.id if sc is not None else None, estado=estado,
                                            created_at=t, updated_at=t, **campos))

    def pven(self, estado="PENDIENTE_COMPRA", cuando=None, cot=None, **campos):
        t = cuando or _ahora()
        return self._guardar(SaleOrder(numero=self._numero("PV-K"), customer_name=self.cliente,
                                       cot_id=cot.id if cot is not None else None, estado=estado,
                                       created_at=t, updated_at=t, **campos))


# ─── 1) Solicitudes: activas sin Soporte (R8) ─────────────────────────────────────────────────────────────────────────

def test_stats_solicitudes_activas_sin_soporte(app_client, db, admin_token):
    """sc_activas, sc_esperan_cotizacion, sc_confirmadas y sc_canceladas son las de las pestañas (RP3); kpis.sc_total es
    el total de la lista, sin Soporte (R8: Soporte queda fuera de las tarjetas), y la clave vieja sc_total sigue
    contando todas (+4)."""
    f = _Fabrica(db)
    antes = _stats(app_client, admin_token)
    f.sc("BORRADOR", tipo_solicitud="Cotizacion de Producto")
    f.sc("ASIGNADA", tipo_solicitud="Soporte Tecnico")
    f.sc("CONFIRMADA")
    f.sc("CANCELADA")
    despues = _stats(app_client, admin_token)

    assert _diferencia(antes["kpis"], despues["kpis"], ("sc_activas", "sc_esperan_cotizacion", "sc_confirmadas",
                                                        "sc_canceladas", "sc_total")) == {
        "sc_activas": 1, "sc_esperan_cotizacion": 1, "sc_confirmadas": 1, "sc_canceladas": 1, "sc_total": 3}
    assert despues["sc_total"] - antes["sc_total"] == 4
    for estado, n in (("BORRADOR", 1), ("ASIGNADA", 1), ("CONFIRMADA", 1), ("CANCELADA", 1)):
        assert despues["sc_por_estado"][estado] - antes["sc_por_estado"].get(estado, 0) == n, estado


def test_stats_solicitud_confirmada_con_cotizacion_no_espera(app_client, db, admin_token):
    """f_sc_espera_cot (H32, RP3): una SC CONFIRMADA con una COT que no está RECHAZADA ya no espera; con su única COT
    RECHAZADA, sí."""
    f = _Fabrica(db)
    antes = _stats(app_client, admin_token)
    con_cot = f.sc("CONFIRMADA")
    f.cot("BORRADOR", sc=con_cot)
    con_rechazada = f.sc("CONFIRMADA")
    f.cot("RECHAZADA", sc=con_rechazada)
    despues = _stats(app_client, admin_token)
    assert despues["kpis"]["sc_esperan_cotizacion"] - antes["kpis"]["sc_esperan_cotizacion"] == 1
    assert despues["kpis"]["sc_confirmadas"] - antes["kpis"]["sc_confirmadas"] == 2


# ─── 2) Cotizaciones: la del pedido caído cuenta como activa (COT-LISTA, RP3) ───────────────────────────────────────

def test_stats_cotizacion_con_pedido_cancelado_cuenta_como_activa(app_client, db, admin_token):
    """RP3: COT-A CONFIRMADA sin gate2 y con su pedido CANCELADO es «Activas»; COT-B CONFIRMADA de 2.000.000 con un
    pedido vigente es «Confirmadas» y con pedido."""
    f = _Fabrica(db)
    antes = _stats(app_client, admin_token)
    cot_a = f.cot("CONFIRMADA", total_cop=1_000_000, gate2_confirmed_at=None)
    f.pven("CANCELADO", cot=cot_a, total_cop=1_000_000)
    cot_b = f.cot("CONFIRMADA", total_cop=2_000_000)
    f.pven("PENDIENTE_COMPRA", cot=cot_b, total_cop=2_000_000)
    f.cot("BORRADOR", total_cop=0)            # activa sin precio
    f.cot("RECHAZADA", total_cop=500_000)
    despues = _stats(app_client, admin_token)

    assert _diferencia(antes["kpis"], despues["kpis"], (
        "cot_activas", "cot_sin_precio", "cot_confirmadas", "cot_con_pedido", "cot_por_convertir",
        "cot_monto_confirmado", "cot_rechazadas", "cot_total")) == {
        "cot_activas": 2, "cot_sin_precio": 1, "cot_confirmadas": 1, "cot_con_pedido": 1, "cot_por_convertir": 0,
        "cot_monto_confirmado": 2_000_000, "cot_rechazadas": 1, "cot_total": 4}
    assert despues["cot_total"] - antes["cot_total"] == 4
    assert despues["cot_por_estado"]["CONFIRMADA"] - antes["cot_por_estado"].get("CONFIRMADA", 0) == 2


# ─── 3) Pedidos: en curso y dinero (H47 y R7) ─────────────────────────────────────────────────────────────────────────

def test_stats_pedidos_en_curso_y_dinero(app_client, db, admin_token):
    """RP83: el ENTREGADO va con saldo 0. Ni el CANCELADO ni el DEVUELTO_TOTAL suman dinero (ESTADOS_VEN_SIN_DINERO), pero
    sí cuentan en pven_total, en pven_cancelados (la pestaña «Cancelado») y en ven_por_estado."""
    f = _Fabrica(db)
    antes = _stats(app_client, admin_token)
    f.pven("PENDIENTE_COMPRA", total_cop=1_000_000, anticipo_cop=600_000, saldo_cop=400_000)
    f.pven("ENTREGADO", total_cop=500_000, anticipo_cop=500_000, saldo_cop=0)
    f.pven("CANCELADO", total_cop=2_000_000, anticipo_cop=0, saldo_cop=2_000_000)
    f.pven("DEVUELTO_TOTAL", total_cop=300_000, anticipo_cop=300_000, saldo_cop=300_000)
    despues = _stats(app_client, admin_token)

    assert _diferencia(antes["kpis"], despues["kpis"], (
        "pven_total", "pven_en_curso", "pven_saldo_en_curso", "pven_pendiente_compra", "pven_cancelados",
        "pven_con_dinero", "pven_monto_vendido", "pven_monto_entregado", "pven_saldo_por_cobrar",
        "pven_anticipo")) == {
        "pven_total": 4, "pven_en_curso": 1, "pven_saldo_en_curso": 400_000, "pven_pendiente_compra": 1,
        "pven_cancelados": 2, "pven_con_dinero": 2, "pven_monto_vendido": 1_500_000, "pven_monto_entregado": 500_000,
        "pven_saldo_por_cobrar": 400_000, "pven_anticipo": 1_100_000}
    assert despues["ven_total"] - antes["ven_total"] == 4
    assert despues["ven_monto_total"] - antes["ven_monto_total"] == 1_500_000
    for estado in ("PENDIENTE_COMPRA", "ENTREGADO", "CANCELADO", "DEVUELTO_TOTAL"):
        assert despues["ven_por_estado"][estado] - antes["ven_por_estado"].get(estado, 0) == 1, estado


def test_stats_saldo_por_cobrar_no_resta_los_saldos_a_favor(app_client, db, admin_token):
    """R7: Saldo por cobrar = Σ max(0, saldo_cop): un pedido con saldo a favor (negativo) no resta lo que deben otros."""
    f = _Fabrica(db)
    antes = _stats(app_client, admin_token)
    f.pven("LISTO_ENTREGA", total_cop=100_000, saldo_cop=-20_000)
    f.pven("FACTURADO", total_cop=250_000, saldo_cop=50_000)   # facturado que todavía debe: sigue por cobrar
    despues = _stats(app_client, admin_token)
    assert despues["kpis"]["pven_saldo_por_cobrar"] - antes["kpis"]["pven_saldo_por_cobrar"] == 50_000
    assert despues["kpis"]["pven_saldo_en_curso"] - antes["kpis"]["pven_saldo_en_curso"] == 0
    assert despues["kpis"]["pven_monto_entregado"] - antes["kpis"]["pven_monto_entregado"] == 250_000


def test_stats_pendientes_de_compra_son_los_de_la_pestana(app_client, db, admin_token):
    """C3: la tarjeta abre la pestaña «Pend. Compra» (estados_de_vista('pend_compra')), así que cuenta lo mismo que ella:
    también PENDIENTE_PAGO (de la tienda)."""
    f = _Fabrica(db)
    antes = _stats(app_client, admin_token)
    f.pven("PENDIENTE_COMPRA")
    f.pven("PENDIENTE_PAGO")
    f.pven("EN_PROCESO")
    despues = _stats(app_client, admin_token)
    assert despues["kpis"]["pven_pendiente_compra"] - antes["kpis"]["pven_pendiente_compra"] == 2
    assert despues["kpis"]["pven_en_curso"] - antes["kpis"]["pven_en_curso"] == 3


# ─── 4) Flujo: período contra el anterior (R7) ────────────────────────────────────────────────────────────────────────

def test_stats_flujo_compara_con_el_periodo_anterior(app_client, db, admin_token):
    """Pedidos de 700.000 (hace 5 días), 300.000 (hace 40 días) y 900.000 CANCELADO (hace 3 días): con 30d el actual
    sube 700.000 y el anterior 300.000; con 7d el anterior no cambia."""
    f = _Fabrica(db)
    ahora = _ahora()
    antes_30 = _stats(app_client, admin_token, periodo="30d")
    antes_7 = _stats(app_client, admin_token, periodo="7d")
    f.pven("PENDIENTE_COMPRA", cuando=ahora - timedelta(days=5), total_cop=700_000)
    f.pven("ENTREGADO", cuando=ahora - timedelta(days=40), total_cop=300_000)
    f.pven("CANCELADO", cuando=ahora - timedelta(days=3), total_cop=900_000)
    despues_30 = _stats(app_client, admin_token, periodo="30d")
    despues_7 = _stats(app_client, admin_token, periodo="7d")

    def cambio(antes, despues, clave):
        return {v: despues["flujo"][clave][v] - antes["flujo"][clave][v] for v in ("actual", "anterior")}

    assert cambio(antes_30, despues_30, "vendido_cop") == {"actual": 700_000, "anterior": 300_000}
    assert cambio(antes_30, despues_30, "pedidos_nuevos") == {"actual": 1, "anterior": 1}
    assert cambio(antes_7, despues_7, "vendido_cop") == {"actual": 700_000, "anterior": 0}
    assert cambio(antes_7, despues_7, "pedidos_nuevos") == {"actual": 1, "anterior": 0}
    assert despues_30["periodo"]["clave"] == "30d" and despues_7["periodo"]["clave"] == "7d"


def test_stats_flujo_ticket_y_conversion_con_su_anterior(app_client, db, admin_token, monkeypatch):
    """R7 con números absolutos (hoy = 2001-01-20: 30d = 2000-12-22..2001-01-20 contra 2000-11-22..2000-12-21):
    - Vendido 1.000.000 (600.000 + 400.000; el CANCELADO no) contra 300.000; Ticket 500.000 contra 300.000 (+66,7 %).
    - % de cotizaciones que terminan en pedido: 2 COT en el período, una con un pedido vigente (50,0) contra una sin
      pedido (0,0) en el anterior: «Nuevo» (variacion_pct None). Una COT con solo un pedido CANCELADO no cuenta.
    - Solicitudes nuevas sin Soporte (R8) y cotizaciones nuevas, cada una con {actual, anterior, variacion_pct}."""
    _fijar_hoy(monkeypatch, date(2001, 1, 20))
    f = _Fabrica(db)
    cot_con_pedido = f.cot("CONFIRMADA", cuando=datetime(2001, 1, 9, 15, 0))
    cot_caida = f.cot("CONFIRMADA", cuando=datetime(2001, 1, 9, 16, 0))
    f.cot("ENVIADA", cuando=datetime(2000, 12, 5, 15, 0))
    f.pven("PENDIENTE_COMPRA", cuando=datetime(2001, 1, 10, 15, 0), cot=cot_con_pedido, total_cop=600_000)
    f.pven("ENTREGADO", cuando=datetime(2001, 1, 15, 15, 0), total_cop=400_000)
    f.pven("CANCELADO", cuando=datetime(2001, 1, 12, 15, 0), cot=cot_caida, total_cop=900_000)
    f.pven("FACTURADO", cuando=datetime(2000, 12, 1, 15, 0), total_cop=300_000)
    f.sc("BORRADOR", cuando=datetime(2001, 1, 3, 15, 0))
    f.sc("ASIGNADA", cuando=datetime(2001, 1, 3, 16, 0), tipo_solicitud="Soporte Tecnico")

    data = _stats(app_client, admin_token)
    assert data["flujo"] == {
        "vendido_cop": {"actual": 1_000_000, "anterior": 300_000, "variacion_pct": 233.3},
        "pedidos_nuevos": {"actual": 2, "anterior": 1, "variacion_pct": 100.0},
        "ticket_promedio_cop": {"actual": 500_000, "anterior": 300_000, "variacion_pct": 66.7},
        "cot_conversion_pct": {"actual": 50.0, "anterior": 0.0, "variacion_pct": None},
        "solicitudes_nuevas": {"actual": 1, "anterior": 0, "variacion_pct": None},
        "cotizaciones_nuevas": {"actual": 2, "anterior": 1, "variacion_pct": 100.0},
    }
    # RP29: bloque_periodo con instantes ISO con Z; `hasta` es el inicio (exclusivo) del día siguiente en Colombia.
    assert data["periodo"]["clave"] == "30d"
    assert data["periodo"]["actual"] == {"desde": "2000-12-22T05:00:00Z", "hasta": "2001-01-21T05:00:00Z"}
    assert data["periodo"]["anterior"] == {"desde": "2000-11-22T05:00:00Z", "hasta": "2000-12-22T05:00:00Z"}


def test_stats_flujo_sin_documentos_no_inventa_cifras(app_client, admin_token, monkeypatch):
    """Un período sin pedidos ni cotizaciones: Vendido 0 («Sin cambio», 0.0), Ticket y conversión None (nunca 0)."""
    _fijar_hoy(monkeypatch, date(2000, 6, 30))
    data = _stats(app_client, admin_token, periodo="mes")
    assert data["flujo"]["vendido_cop"] == {"actual": 0, "anterior": 0, "variacion_pct": 0.0}
    assert data["flujo"]["pedidos_nuevos"] == {"actual": 0, "anterior": 0, "variacion_pct": 0.0}
    assert data["flujo"]["ticket_promedio_cop"] == {"actual": None, "anterior": None, "variacion_pct": None}
    assert data["flujo"]["cot_conversion_pct"] == {"actual": None, "anterior": None, "variacion_pct": None}
    assert data["periodo"]["clave"] == "mes"


# ─── 5) Período inválido, roles y claves ──────────────────────────────────────────────────────────────────────────────

def test_stats_periodo_invalido_422(app_client, admin_token):
    """R21: el período se valida a mano: solo los de las tarjetas (7d, 30d, mes); cualquier otro, 422 en español."""
    for periodo in ("xx", "90d", "personalizado", "12m", "30D"):
        resp = app_client.get(RUTA, params={"periodo": periodo}, headers=_auth(admin_token))
        assert resp.status_code == 422, (periodo, resp.text)
        assert resp.json()["detail"] == "Período no válido.", periodo
    # En blanco o sin período: 30 días (PERIODO_KPI).
    assert _stats(app_client, admin_token, periodo="")["periodo"]["clave"] == "30d"
    assert _stats(app_client, admin_token, periodo=" 7d ")["periodo"]["clave"] == "7d"
    assert _stats(app_client, admin_token)["periodo"]["clave"] == "30d"


def test_stats_asesor_y_bodega_leen_200(app_client, vendedor_token, bodega_token):
    """ALL_ERP_ROLES (los mismos roles que las listas): el asesor y Bodega leen /ventas/stats; sin sesión, 401."""
    for token in (vendedor_token, bodega_token):
        data = _stats(app_client, token)
        assert set(CLAVES_KPIS) <= set(data["kpis"])
    assert app_client.get(RUTA).status_code == 401


def test_stats_claves_viejas_y_nuevas(app_client, admin_token):
    """Las claves de hoy siguen (el Dashboard General y las pantallas que no se migran las leen) y se agregan
    ven_por_estado, kpis, periodo y flujo, con exactamente sus claves."""
    data = _stats(app_client, admin_token)
    assert set(data) == CLAVES_VIEJAS | {"ven_por_estado", "kpis", "periodo", "flujo"}
    assert tuple(data["kpis"]) == CLAVES_KPIS
    assert tuple(data["flujo"]) == CLAVES_FLUJO
    for clave in CLAVES_FLUJO:
        assert set(data["flujo"][clave]) == {"actual", "anterior", "variacion_pct"}, clave
    assert set(data["periodo"]) == {"clave", "etiqueta", "actual", "anterior", "comparado"}
    for ventana in ("actual", "anterior"):
        assert data["periodo"][ventana]["desde"].endswith("Z") and data["periodo"][ventana]["hasta"].endswith("Z")
    assert isinstance(data["sc_por_estado"], dict) and isinstance(data["ven_por_estado"], dict)
    # Las claves viejas cuentan lo de siempre: el total de cada tipo es la suma de su conteo por estado.
    assert data["sc_total"] == sum(data["sc_por_estado"].values())
    assert data["cot_total"] == sum(data["cot_por_estado"].values()) == data["kpis"]["cot_total"]
    assert data["ven_total"] == sum(data["ven_por_estado"].values()) == data["kpis"]["pven_total"]
    assert data["ven_monto_total"] == data["kpis"]["pven_monto_vendido"]
    for clave in ("cot_monto_confirmado", "pven_monto_vendido", "pven_monto_entregado", "pven_saldo_por_cobrar",
                  "pven_saldo_en_curso", "pven_anticipo"):
        assert float(data["kpis"][clave]).is_integer(), clave   # pesos enteros (redondear_peso)


def test_stats_pxp_pendiente_sigue_contando(app_client, db, admin_token):
    """La clave vieja pxp_pendiente sigue contando las órdenes de pago PENDIENTE."""
    f = _Fabrica(db)
    antes = _stats(app_client, admin_token)
    pedido = f.pven("PENDIENTE_COMPRA")
    db.add(PaymentPending(numero=f"PXP-K{f.sufijo}", ven_id=pedido.id, estado="PENDIENTE"))
    db.commit()
    despues = _stats(app_client, admin_token)
    assert despues["pxp_pendiente"] - antes["pxp_pendiente"] == 1
