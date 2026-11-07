"""B4 T12 (KPI-compras punto 2 con R9, R7 y R21; C3, C10, C12; RP1, RP29, RP40, RP41, RP43, RP79, RP94): GET
/api/v1/compras/stats, el endpoint que ya llaman el Hub de Compras, Pedidos de compra y Abastecimiento.

Grupos de core/estados_compras.py: activos incluye en bodega; recibidos = recepción confirmada (RECIBIDA y COMPLETADO);
en_bodega = RECIBIDO y PARCIALMENTE_RECIBIDA; vencidos = emitido o en tránsito con el día de entrega anterior a hoy en
Colombia (RP40); cumplimiento = recibidos / (activos + recibidos) × 100 con 1 decimal. El bloque flujo usa la regla única
de «Comprado» de core/analisis_compras.py (RP43: COALESCE(fecha_compra, created_at), sin BORRADOR ni CANCELADO). El
período se valida a mano (R21). La prueba 7 del diseño (paridad con el frontend) es de T2.

Se corre SOLO con el runner de ROLLBACK (python tests/rollback_runner.py test_compras_stats). erp_test ya tiene datos:
las pruebas afirman diferencias entre un GET antes y otro después de crear sus documentos. Las del bloque flujo fijan
«hoy» en 2001 (monkeypatch de fechas.hoy_colombia), donde erp_test no tiene pedidos de compra.
"""
import uuid
from datetime import date, datetime, time, timedelta

from app.models.erp_documents import GoodsReceipt, PurchaseOrderFull
from tests.usuarios_de_prueba import bodega_token, compras_token  # noqa: F401 (fixtures por nombre, RP79)

RUTA = "/api/v1/compras/stats"
CLAVES = {"total", "por_estado", "borradores", "activos", "en_transito", "en_bodega", "recibidos", "cancelados",
          "vigentes", "vencidos", "monto_cop", "monto_por_recibir_cop", "cumplimiento_pct", "pec_activos", "pec_total",
          "recepciones", "periodo", "flujo"}
CONTEOS = ("total", "borradores", "activos", "en_transito", "en_bodega", "recibidos", "cancelados", "vigentes",
           "vencidos", "pec_activos", "pec_total")


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _hoy():
    from app.core.fechas import hoy_colombia
    return hoy_colombia()


def _dia(n, hora=12):
    return datetime.combine(_hoy() + timedelta(days=n), time(hora, 0))


def _stats(app_client, token, **params):
    resp = app_client.get(RUTA, params=params, headers=_auth(token))
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


def _diferencia(antes, despues, claves=CONTEOS):
    return {c: despues[c] - antes[c] for c in claves}


def _fijar_hoy(monkeypatch, dia: date):
    """«Hoy» en Colombia para resolver_periodo (core/periodos.py llama fechas.hoy_colombia)."""
    from app.core import fechas
    monkeypatch.setattr(fechas, "hoy_colombia", lambda ahora_utc=None: dia)


class _Fabrica:
    def __init__(self, db):
        self.db = db
        self.sufijo = uuid.uuid4().hex[:8].upper()
        self.n = 0

    def _numero(self, prefijo):
        self.n += 1
        return f"{prefijo}{self.sufijo}{self.n:02d}"

    def _guardar(self, objeto):
        self.db.add(objeto)
        self.db.commit()
        return objeto

    def pec(self, estado="EMITIDO", entrega=None, total=100_000, compra="ahora", creado=None):
        """compra='ahora' deja el valor por defecto del modelo; compra=None guarda la fecha de compra vacía."""
        campos = {} if compra in ("ahora", None) else {"fecha_compra": compra}
        if creado is not None:
            campos.update(created_at=creado, updated_at=creado)
        pec = self._guardar(PurchaseOrderFull(numero=self._numero("PEC-S"), estado=estado, total_cop=total,
                                              fecha_entrega_estimada=entrega, supplier_name=f"Prov {self.sufijo}",
                                              **campos))
        if compra is None:   # el ORM no manda un None en el INSERT (corre el valor por defecto): se vacía con un UPDATE
            pec.fecha_compra = None
            self.db.commit()
        return pec

    def recepcion(self, estado="BORRADOR", pec=None):
        return self._guardar(GoodsReceipt(numero=self._numero("ENINV-S"), estado=estado,
                                          pec_id=pec.id if pec else None))


# ─── 1) Los grupos de estado (R9) ─────────────────────────────────────────────────────────────────────────────────────

def test_stats_grupos_pec(app_client, db, admin_token):
    f = _Fabrica(db)
    antes = _stats(app_client, admin_token)
    estados = ("BORRADOR", "EMITIDO", "EN_TRANSITO", "PARCIALMENTE_RECIBIDA", "RECIBIDA", "RECIBIDO", "CANCELADO")
    for estado in estados:
        f.pec(estado, _dia(10))
    despues = _stats(app_client, admin_token)
    assert _diferencia(antes, despues) == {
        "total": 7, "borradores": 1, "activos": 4, "en_transito": 1, "en_bodega": 2, "recibidos": 1, "cancelados": 1,
        "vigentes": 6, "vencidos": 0, "pec_activos": 4, "pec_total": 6}
    for estado in estados:
        assert despues["por_estado"][estado] - antes["por_estado"].get(estado, 0) == 1, estado


def test_stats_un_estado_desconocido_cuenta_como_emitido(app_client, db, admin_token):
    """R9: un estado desconocido (un heredado de logística) cuenta como emitido: activo, vigente y vencible."""
    f = _Fabrica(db)
    antes = _stats(app_client, admin_token)
    f.pec("CONFIRMADA", _dia(-3))
    despues = _stats(app_client, admin_token)
    assert _diferencia(antes, despues) == {
        "total": 1, "borradores": 0, "activos": 1, "en_transito": 0, "en_bodega": 0, "recibidos": 0, "cancelados": 0,
        "vigentes": 1, "vencidos": 1, "pec_activos": 1, "pec_total": 1}


# ─── 2) Vencidos: solo emitido y en tránsito, por el día de entrega (RP40) ──────────────────────────────────────────

def test_vencidos_solo_cuenta_activos(app_client, db, admin_token):
    f = _Fabrica(db)
    antes = _stats(app_client, admin_token)["vencidos"]
    f.pec("EMITIDO", _dia(-3))
    assert _stats(app_client, admin_token)["vencidos"] - antes == 1
    for estado in ("RECIBIDO", "PARCIALMENTE_RECIBIDA", "RECIBIDA", "COMPLETADO", "BORRADOR", "CANCELADO"):
        f.pec(estado, _dia(-3))
    f.pec("EMITIDO", datetime.combine(_hoy(), time(0, 0)))   # hoy a las 00:00 todavía no está vencido
    f.pec("EMITIDO", None)                                    # sin fecha no vence
    assert _stats(app_client, admin_token)["vencidos"] - antes == 1
    f.pec("EN_TRANSITO", _dia(-1, hora=23))
    f.pec("PENDIENTE_ENTREGA", _dia(-30))
    f.pec("ENVIADO", _dia(-1, hora=0))
    assert _stats(app_client, admin_token)["vencidos"] - antes == 4


# ─── 3) Cumplimiento y montos ─────────────────────────────────────────────────────────────────────────────────────────

def test_cumplimiento_y_montos(app_client, db, admin_token):
    f = _Fabrica(db)
    antes = _stats(app_client, admin_token)
    f.pec("EMITIDO", total=1_000_000)
    f.pec("RECIBIDO", total=200_000)
    f.pec("RECIBIDA", total=30_000)
    f.pec("BORRADOR", total=4_000)
    f.pec("CANCELADO", total=500)
    despues = _stats(app_client, admin_token)
    assert despues["monto_cop"] - antes["monto_cop"] == 1_234_000          # los vigentes
    assert despues["monto_por_recibir_cop"] - antes["monto_por_recibir_cop"] == 1_200_000   # los activos
    for data in (antes, despues):
        denominador = data["activos"] + data["recibidos"]
        esperado = round(data["recibidos"] / denominador * 100, 1) if denominador else None
        assert data["cumplimiento_pct"] == esperado
    assert isinstance(despues["monto_cop"], int) and isinstance(despues["monto_por_recibir_cop"], int)


def test_cumplimiento_sin_pedidos_es_none(db):
    """La fórmula sola: recibidos / (activos + recibidos) × 100 con 1 decimal; None si no hay ninguno."""
    from app.core.analisis_compras import cumplimiento_pct
    assert cumplimiento_pct(0, 0) is None
    assert cumplimiento_pct(1, 4) == 20.0
    assert cumplimiento_pct(2, 1) == 66.7
    assert cumplimiento_pct(0, 3) == 0.0


# ─── 4) Flujo: «Comprado» con la regla única (RP43) ──────────────────────────────────────────────────────────────────

def test_flujo_comprado(app_client, db, admin_token, monkeypatch):
    """Con hoy = 2001-03-01 y periodo=30d: el actual es 2001-01-31..03-01 y el anterior 2001-01-01..01-30. Un PEC
    EMITIDO a −5 días suma en el actual; uno a −40, en el anterior; un CANCELADO a −2 y un BORRADOR a −3 no suman; sin
    fecha_compra, cuenta su created_at."""
    hoy = date(2001, 3, 1)
    _fijar_hoy(monkeypatch, hoy)
    f = _Fabrica(db)
    antes = _stats(app_client, admin_token, periodo="30d")["flujo"]

    def dia(n):
        return datetime.combine(hoy - timedelta(days=n), time(15, 0))

    f.pec("EMITIDO", total=1_000_000, compra=dia(5))
    sin_compra = f.pec("EN_TRANSITO", total=300_000, compra=None, creado=dia(6))
    db.refresh(sin_compra)
    assert sin_compra.fecha_compra is None
    f.pec("RECIBIDA", total=50_000, compra=dia(40))
    f.pec("CANCELADO", total=7_000_000, compra=dia(2))
    f.pec("BORRADOR", total=9_000_000, compra=dia(3))
    despues = _stats(app_client, admin_token, periodo="30d")["flujo"]
    assert set(despues) == {"comprado_cop", "pec_nuevos"}
    for clave in despues:
        assert set(despues[clave]) == {"actual", "anterior", "variacion_pct"}, clave
    assert despues["comprado_cop"]["actual"] - antes["comprado_cop"]["actual"] == 1_300_000
    assert despues["comprado_cop"]["anterior"] - antes["comprado_cop"]["anterior"] == 50_000
    assert despues["pec_nuevos"]["actual"] - antes["pec_nuevos"]["actual"] == 2
    assert despues["pec_nuevos"]["anterior"] - antes["pec_nuevos"]["anterior"] == 1
    from app.core.analisis import variacion_pct
    for clave in despues:
        assert despues[clave]["variacion_pct"] == variacion_pct(despues[clave]["actual"], despues[clave]["anterior"])


def test_flujo_y_analisis_dan_el_mismo_comprado(app_client, db, admin_token, monkeypatch):
    """RP43: «Comprado (30 días)» del Hub y «Comprado» del Análisis salen de la misma regla."""
    hoy = date(2001, 3, 1)
    _fijar_hoy(monkeypatch, hoy)
    f = _Fabrica(db)
    f.pec("EMITIDO", total=1_000_000, compra=datetime(2001, 2, 20, 10, 0))
    f.pec("CANCELADO", total=5_000, compra=datetime(2001, 2, 21, 10, 0))
    f.pec("EMITIDO", total=70_000, compra=datetime(2001, 1, 15, 10, 0))
    flujo = _stats(app_client, admin_token, periodo="30d")["flujo"]
    resp = app_client.get("/api/v1/compras/analisis", params={"periodo": "30d"}, headers=_auth(admin_token))
    assert resp.status_code == 200, resp.text
    kpis = {k["clave"]: k for k in resp.json()["data"]["kpis"]}
    assert (kpis["comprado_periodo"]["valor"], kpis["comprado_periodo"]["anterior"]) == (
        flujo["comprado_cop"]["actual"], flujo["comprado_cop"]["anterior"])
    assert (kpis["pec_nuevos"]["valor"], kpis["pec_nuevos"]["anterior"]) == (
        flujo["pec_nuevos"]["actual"], flujo["pec_nuevos"]["anterior"])


# ─── 5) Recepciones por grupo (RP41) ──────────────────────────────────────────────────────────────────────────────────

def test_recepciones_por_grupo(app_client, db, admin_token):
    f = _Fabrica(db)
    antes = _stats(app_client, admin_token)["recepciones"]
    pec = f.pec("EMITIDO")
    for estado in ("BORRADOR", "COMPLETADA_LOGISTICA", "CANCELADA", "COMPLETADA"):
        f.recepcion(estado, pec)
    despues = _stats(app_client, admin_token)["recepciones"]
    assert set(despues) == {"por_confirmar", "confirmadas", "canceladas", "total"}
    assert {c: despues[c] - antes[c] for c in despues} == {"por_confirmar": 1, "confirmadas": 2, "canceladas": 1,
                                                           "total": 4}


# ─── 6) Roles, claves y período (R21, RP94) ──────────────────────────────────────────────────────────────────────────

def test_stats_roles(app_client, vendedor_token, bodega_token, compras_token):
    for token in (vendedor_token, bodega_token, compras_token):
        data = _stats(app_client, token)
        assert "pec_activos" in data and "pec_total" in data
        assert data["pec_activos"] == data["activos"] and data["pec_total"] == data["vigentes"]
    assert app_client.get(RUTA).status_code == 401


def test_stats_claves_exactas_y_periodo(app_client, admin_token):
    data = _stats(app_client, admin_token)
    assert set(data) == CLAVES
    assert set(data["periodo"]) == {"clave", "etiqueta", "actual", "anterior", "comparado"}
    assert data["periodo"]["clave"] == "30d"
    assert data["periodo"]["actual"]["desde"].endswith("Z") and data["periodo"]["actual"]["hasta"].endswith("Z")
    assert data["total"] == sum(data["por_estado"].values())
    assert data["vigentes"] == data["total"] - data["cancelados"]
    assert data["borradores"] + data["activos"] + data["recibidos"] + data["cancelados"] == data["total"]
    for clave in ("7d", "30d", "mes", " mes ", ""):
        assert _stats(app_client, admin_token, periodo=clave)["periodo"]["clave"] == (clave.strip() or "30d")


def test_stats_periodo_invalido_422(app_client, admin_token):
    for periodo in ("xx", "90d", "12m", "personalizado", "30D", "7d\x00", "x" * 500):
        resp = app_client.get(RUTA, params={"periodo": periodo}, headers=_auth(admin_token))
        assert resp.status_code == 422, (periodo, resp.text)
        assert resp.json()["detail"] == "Período no válido.", periodo


def test_stats_y_la_lista_cuentan_lo_mismo(app_client, db, admin_token):
    """«Al tocar una tarjeta: pestaña equivalente y el mismo número»: sin búsqueda, el resumen y los conteos de la lista
    son los de /compras/stats."""
    f = _Fabrica(db)
    f.pec("EMITIDO", _dia(-2))
    f.pec("RECIBIDA", _dia(-2))
    data = _stats(app_client, admin_token)
    resp = app_client.get("/api/v1/compras/pedidos", params={"con_resumen": 1, "con_conteos": 1, "limit": 0},
                          headers=_auth(admin_token))
    assert resp.status_code == 200, resp.text
    lista = resp.json()
    assert lista["resumen"] == {"capital_cop": data["monto_cop"], "activos": data["activos"],
                                "en_transito": data["en_transito"], "en_bodega": data["en_bodega"],
                                "vencidos": data["vencidos"], "recibidos": data["recibidos"],
                                "cumplimiento_pct": data["cumplimiento_pct"]}
    conteos = lista["conteos"]
    assert (conteos["activos"], conteos["en_transito"], conteos["recibidos"], conteos["cancelados"],
            conteos["vigentes"], conteos["vencidos"], conteos["borradores"], conteos["en_bodega"]) == (
        data["activos"], data["en_transito"], data["recibidos"], data["cancelados"], data["vigentes"],
        data["vencidos"], data["borradores"], data["en_bodega"])
    assert lista["total"] == data["total"]


def test_stats_hace_pocas_consultas_y_no_choca_con_pedidos(app_client, db, admin_token, contador_sql):
    """Las rutas /stats, /flujo y /analisis no chocan con /pedidos/{pec_id}: cada una responde lo suyo. /stats hace las
    mismas consultas con 3 y con 25 pedidos de compra (6 o menos con la de la sesión) y no escribe."""
    f = _Fabrica(db)

    def medir():
        with contador_sql.ventana() as v:
            _stats(app_client, admin_token)
        assert v.commits == 0
        return v.consultas

    for _ in range(3):
        f.pec("EMITIDO", _dia(-1))
    con_3 = medir()
    for _ in range(22):
        f.pec("RECIBIDA", _dia(-1))
    assert medir() == con_3 and con_3 <= 6, con_3
    rutas = {"/api/v1/compras/stats": "activos", "/api/v1/compras/flujo": "pasos",
             "/api/v1/compras/analisis": "kpis"}
    for ruta, clave in rutas.items():
        resp = app_client.get(ruta, headers=_auth(admin_token))
        assert resp.status_code == 200 and clave in resp.json()["data"], (ruta, resp.text)
    pec = f.pec("EMITIDO")
    resp = app_client.get(f"/api/v1/compras/pedidos/{pec.id}", headers=_auth(admin_token))
    assert resp.status_code == 200 and resp.json()["data"]["id"] == pec.id
