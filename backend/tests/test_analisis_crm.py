"""B4 T20 (ANALISIS-crm punto 1 con R13, R21; RP9, RP29, RP73 puntos 4 y 5): GET /api/v1/crm/analisis (_analisis_crm en
crm.py) para ADMIN y ASESOR, con el contrato unico de core/analisis.py.

Se corre SOLO con el runner de ROLLBACK (python tests/rollback_runner.py test_analisis_crm): cada prueba va en una
transaccion que se revierte. Las pruebas del periodo usan periodo=personalizado&desde=2001-01-01&hasta=2001-01-10 (el
anterior es 2000-12-22..2000-12-31), donde erp_test no tiene leads: las cifras se afirman tal cual. Lo que es una FOTO de
hoy (valor en el pipeline, donas, barras, requieren atencion) comparte la base con los leads que ya haya: se afirma por
diferencia (antes/despues) o por lo que lleva el nombre unico de la prueba.
"""
import uuid
from datetime import datetime, timedelta

from sqlalchemy import text

from app.api.v1.crm import PipelineStage
from app.core.analisis import (CLAVES_ANALISIS, CLAVES_BARRAS, CLAVES_DONA, CLAVES_FILA_RANKING, CLAVES_KPI,
                               CLAVES_LINEA, CLAVES_MOVIMIENTO, CLAVES_MOVIMIENTOS, CLAVES_RANKING, CLAVES_SEGMENTO,
                               CLAVES_SERIE, CLAVES_SERIE_BARRAS)
from app.models.customers import Customer
from app.models.sales import SalesOrder
from tests.usuarios_de_prueba import bodega_token, compras_token, finanzas_token  # noqa: F401 (fixtures por nombre)

RUTA = "/api/v1/crm/analisis"
VENTANA = {"periodo": "personalizado", "desde": "2001-01-01", "hasta": "2001-01-10"}
FECHAS = [f"2001-01-{d:02d}" for d in range(1, 11)]
CLAVES_KPIS = ["leads_nuevos", "pipeline_valor", "leads_ganados", "pct_cierre"]
ERROR_TOP = "El ranking solo puede mostrar 5, 10 o 25."


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _analisis(app_client, token, **extra):
    params = {**VENTANA, **extra}
    resp = app_client.get(RUTA, params=params, headers=_auth(token))
    assert resp.status_code == 200, resp.text
    cuerpo = resp.json()
    assert cuerpo["status"] == "success"
    return cuerpo["data"]


def _kpis(data):
    return {k["clave"]: k for k in data["kpis"]}


def _dona(data, clave):
    return next(d for d in data["donas"] if d["clave"] == clave)


def _serie(bloque, clave):
    return next(s for s in bloque["series"] if s["clave"] == clave)


class _Fabrica:
    """Leads con un cliente propio (sufijo unico). Un db.add por objeto; created_at y updated_at explicitos."""

    def __init__(self, db):
        self.db = db
        self.s = uuid.uuid4().hex[:8]
        self.cliente = Customer(first_name="Lead", last_name=f"Analisis{self.s}", email=f"an-{self.s}@t.nebulae")
        db.add(self.cliente)
        db.commit()

    def etapa(self, nombre, color, posicion, status):
        e = PipelineStage(name=f"{nombre} {self.s}", color=color, bg_color=color.replace("-500", "-50"),
                          position=posicion, maps_to_status=status)
        self.db.add(e)
        self.db.commit()
        return e

    def lead(self, creado, status="DRAFT", actualizado="igual", valor=0, etapa=None, asesor=None, origen=None):
        o = SalesOrder(customer_id=self.cliente.id, status=status, sale_type="ON_DEMAND", lead_value=valor,
                       lead_source=origen, advisor_name=asesor, pipeline_stage_id=etapa.id if etapa else None,
                       created_at=creado, updated_at=creado if actualizado == "igual" else actualizado)
        self.db.add(o)
        self.db.commit()
        if actualizado is None:     # el ORM omite un None y deja el default (utcnow): el NULL se escribe aparte
            self.db.execute(text("UPDATE sales_orders SET updated_at = NULL WHERE id = :i"), {"i": o.id})
            self.db.commit()
            self.db.refresh(o)
        return o


# ─── 1) Leads nuevos y su variacion ────────────────────────────────────────────────────────────────────────────────

def test_leads_nuevos_y_variacion(app_client, db, admin_token):
    """Creados en el periodo (de cualquier estado, tambien los ganados y perdidos): 3 contra 2 del periodo anterior
    (+50,0 %). Los bordes son de Colombia: el 31 de diciembre 23:59 es del periodo anterior y el 11 de enero 00:00 no es."""
    f = _Fabrica(db)
    f.lead(datetime(2001, 1, 2, 15, 0))
    f.lead(datetime(2001, 1, 2, 16, 0), status="INVOICED")
    f.lead(datetime(2001, 1, 5, 15, 0), status="CANCELLED")
    f.lead(datetime(2000, 12, 25, 15, 0))
    f.lead(datetime(2001, 1, 11, 5, 0))                  # 11 de enero 00:00 en Colombia: fuera del periodo
    f.lead(datetime(2001, 1, 1, 4, 59))                  # 31 de diciembre 23:59 en Colombia: periodo anterior
    data = _analisis(app_client, admin_token)
    k = _kpis(data)
    assert [x["clave"] for x in data["kpis"]] == CLAVES_KPIS
    assert [x["etiqueta"] for x in data["kpis"]] == ["Leads nuevos", "Valor en el pipeline", "Leads ganados",
                                                     "% de cierre"]
    nuevos = k["leads_nuevos"]
    assert (nuevos["valor"], nuevos["anterior"], nuevos["variacion_pct"]) == (3, 2, 50.0)
    assert (nuevos["formato"], nuevos["mejor"], nuevos["es_foto"]) == ("entero", "sube", False)
    # la curva de leads nuevos contra ganados: una cubeta por dia de Colombia
    assert data["linea"]["fechas"] == FECHAS
    assert _serie(data["linea"], "nuevos")["valores"] == [0, 2, 0, 0, 1, 0, 0, 0, 0, 0]
    assert _serie(data["linea"], "ganados")["valores"] == [0, 1, 0, 0, 0, 0, 0, 0, 0, 0]   # el INVOICED del día 2
    assert (data["linea"]["total"], data["linea"]["total_anterior"], data["linea"]["variacion_pct"]) == (3, 2, 50.0)
    assert data["linea"]["titulo"] == "Leads nuevos y ganados"
    assert data["periodo"]["desde"] == "2001-01-01" and data["periodo"]["hasta"] == "2001-01-10"
    assert data["filtros"] == {"foco": None, "top": 5, "producto": None, "bodega": None}


def test_sin_leads_en_el_periodo_no_inventa_cifras(app_client, db, admin_token):
    data = _analisis(app_client, admin_token, periodo="personalizado", desde="1990-01-01", hasta="1990-01-10")
    k = _kpis(data)
    assert (k["leads_nuevos"]["valor"], k["leads_nuevos"]["anterior"], k["leads_nuevos"]["variacion_pct"]) == (0, 0, 0.0)
    assert (k["leads_ganados"]["valor"], k["leads_ganados"]["variacion_pct"]) == (0, 0.0)
    assert k["pct_cierre"]["valor"] is None and k["pct_cierre"]["anterior"] is None   # sin ganados ni perdidos: None, no 0
    assert data["ranking"]["filas"] == []


# ─── 2) Ganados y % de cierre ──────────────────────────────────────────────────────────────────────────────────────────

def test_ganados_y_cierre(app_client, db, admin_token):
    """2 INVOICED y 1 CANCELLED con updated_at en el periodo -> 2 ganados y 66,7 %. Antes: 1 ganado y 1 perdido (50 %)."""
    f = _Fabrica(db)
    f.lead(datetime(2000, 11, 1), status="INVOICED", actualizado=datetime(2001, 1, 3, 15, 0), valor=300)
    f.lead(datetime(2000, 11, 2), status="INVOICED", actualizado=datetime(2001, 1, 6, 15, 0), valor=200)
    f.lead(datetime(2000, 11, 3), status="CANCELLED", actualizado=datetime(2001, 1, 7, 15, 0), valor=500)
    f.lead(datetime(2000, 11, 4), status="INVOICED", actualizado=datetime(2000, 12, 25, 15, 0))
    f.lead(datetime(2000, 11, 5), status="CANCELLED", actualizado=datetime(2000, 12, 26, 15, 0))
    f.lead(datetime(2000, 11, 6), status="INVOICED", actualizado=datetime(2001, 2, 1, 15, 0))     # fuera de los dos
    f.lead(datetime(2000, 11, 7), status="DRAFT", actualizado=datetime(2001, 1, 4, 15, 0))        # abierto: no cuenta
    k = _kpis(_analisis(app_client, admin_token))
    assert (k["leads_ganados"]["valor"], k["leads_ganados"]["anterior"], k["leads_ganados"]["variacion_pct"]) == (
        2, 1, 100.0)
    assert (k["pct_cierre"]["valor"], k["pct_cierre"]["anterior"]) == (66.7, 50.0)
    assert (k["pct_cierre"]["formato"], k["pct_cierre"]["mejor"]) == ("porcentaje", "sube")
    # la curva: los ganados por el dia de Colombia de su updated_at
    data = _analisis(app_client, admin_token)
    assert _serie(data["linea"], "ganados")["valores"] == [0, 0, 1, 0, 0, 1, 0, 0, 0, 0]


def test_asesores_con_mas_ventas_ganadas(app_client, db, admin_token):
    f = _Fabrica(db)
    for valor, asesor in ((300, "Ana"), (200, " Ana "), (900, "Luis"), (50, None), (60, "   ")):
        f.lead(datetime(2000, 11, 1), status="INVOICED", actualizado=datetime(2001, 1, 4, 15, 0), valor=valor,
               asesor=asesor)
    f.lead(datetime(2000, 11, 1), status="CANCELLED", actualizado=datetime(2001, 1, 4, 15, 0), valor=9_999, asesor="Ana")
    f.lead(datetime(2000, 11, 1), status="DRAFT", actualizado=datetime(2001, 1, 4, 15, 0), valor=9_999, asesor="Ana")
    r = _analisis(app_client, admin_token)["ranking"]
    assert r["titulo"] == "Asesores con más ventas ganadas" and r["formato"] == "pesos"
    assert [(x["posicion"], x["nombre"], x["valor"], x["cantidad"], x["detalle"], x["pct"]) for x in r["filas"]] == [
        (1, "Luis", 900, 1, "1 lead ganado", 59.6),
        (2, "Ana", 500, 2, "2 leads ganados", 33.1),
        (3, "Sin asesor", 110, 2, "2 leads ganados", 7.3),
    ]
    assert all(set(x) == CLAVES_FILA_RANKING for x in r["filas"])
    # top = 5, 10 o 25: con mas asesores que el top, solo los mejores
    for i in range(6):
        f.lead(datetime(2000, 11, 1), status="INVOICED", actualizado=datetime(2001, 1, 4, 15, 0), valor=1_000 + i,
               asesor=f"Zeta{i}")
    filas = _analisis(app_client, admin_token, top="5")["ranking"]["filas"]
    assert [x["nombre"] for x in filas] == ["Zeta5", "Zeta4", "Zeta3", "Zeta2", "Zeta1"]
    assert len(_analisis(app_client, admin_token, top="10")["ranking"]["filas"]) == 9


# ─── 3) El pipeline es una foto de hoy ───────────────────────────────────────────────────────────────────────────────

def test_pipeline_foto(app_client, db, admin_token):
    """Valor en el pipeline = Σ lead_value de los leads abiertos (no INVOICED ni CANCELLED) de hoy, sin importar el
    periodo ni la fecha de creacion; es una foto: sin anterior ni %."""
    f = _Fabrica(db)
    antes = _kpis(_analisis(app_client, admin_token))["pipeline_valor"]
    f.lead(datetime(2001, 1, 2), status="DRAFT", valor=100)
    f.lead(datetime(1999, 3, 4), status="QUOTATION", valor=250)          # creado mucho antes del periodo: cuenta
    f.lead(datetime(2001, 1, 2), status="EN_NEGOCIACION", valor=None)    # sin valor: 0
    f.lead(datetime(2001, 1, 2), status="INVOICED", valor=999)
    f.lead(datetime(2001, 1, 2), status="CANCELLED", valor=777)
    for extra in (VENTANA, {"periodo": "7d"}, {"periodo": "mes"}):
        despues = _kpis(_analisis(app_client, admin_token, **extra))["pipeline_valor"]
        assert despues["valor"] - antes["valor"] == 350, extra
        assert (despues["es_foto"], despues["anterior"], despues["variacion_pct"], despues["formato"]) == (
            True, None, None, "pesos")


def test_dona_por_etapa_con_color(app_client, db, admin_token):
    """«Leads abiertos por etapa» con el color de cada etapa; un lead sin etapa cae en la de su status (RP73); los
    perdidos y ganados no cuentan como abiertos. «Por origen» agrupa por lead_source."""
    f = _Fabrica(db)
    teal = f.etapa("Etapa teal", "bg-teal-500", 9101, "DRAFT")
    rosa = f.etapa("Etapa rosa", "bg-pink-500", 9102, "ZZ_T20")
    f.lead(datetime(2001, 1, 2), valor=100, etapa=teal, origen=f"WhatsApp-{f.s}")
    f.lead(datetime(2001, 1, 2), valor=50, etapa=teal, origen=f"WhatsApp-{f.s}")
    f.lead(datetime(2001, 1, 2), status="ZZ_T20", valor=30, etapa=None, origen=f"Correo-{f.s}")   # sin etapa
    f.lead(datetime(2001, 1, 2), status="INVOICED", etapa=teal, origen=f"Correo-{f.s}")            # ganado: no es abierto
    f.lead(datetime(2001, 1, 2), status="CANCELLED", etapa=teal, origen=f"Correo-{f.s}")          # perdido: no es abierto
    data = _analisis(app_client, admin_token)
    etapas = _dona(data, "etapa")
    assert etapas["titulo"] == "Leads abiertos por etapa" and etapas["formato"] == "entero"
    segs = {s["etiqueta"]: s for s in etapas["segmentos"]}
    assert segs[teal.name]["valor"] == 2 and segs[teal.name]["color"] == "bg-teal-500"
    assert segs[rosa.name]["valor"] == 1 and segs[rosa.name]["color"] == "bg-pink-500"
    assert all(set(s) == CLAVES_SEGMENTO for s in etapas["segmentos"]) and "Otros" not in segs
    assert etapas["total"] == sum(s["valor"] for s in etapas["segmentos"])
    origen = {s["etiqueta"]: s["valor"] for s in _dona(data, "origen")["segmentos"]}
    assert origen[f"WhatsApp-{f.s}"] == 2 and origen[f"Correo-{f.s}"] == 1
    assert _dona(data, "origen")["titulo"] == "Por origen"
    # las barras «Valor por etapa»: el valor de los abiertos de cada etapa, en el orden de las etapas
    barras = data["barras"]
    assert barras["titulo"] == "Valor por etapa" and barras["formato"] == "pesos" and barras["eje"] == "categorias"
    valores = dict(zip(barras["etiquetas"], _serie(barras, "valor")["valores"]))
    assert valores[teal.name] == 150 and valores[rosa.name] == 30
    assert barras["etiquetas"].index(teal.name) < barras["etiquetas"].index(rosa.name)


# ─── 4) Requieren atencion (7 dias fijos, RP73) ──────────────────────────────────────────────────────────────────────

def test_atrasados_por_alert_days(app_client, db, admin_token):
    """pipeline_stages no guarda alert_days: el umbral es 7. Un lead con 8 dias sin movimiento sale; uno con 6 no. Abiertos
    solamente, los 8 mas atrasados primero, con doc_tipo 'LEAD'."""
    f = _Fabrica(db)
    ahora = datetime.utcnow()
    hace = lambda dias, horas=1: ahora - timedelta(days=dias, hours=horas)
    ocho = f.lead(hace(8), actualizado=hace(8), valor=1_000)
    seis = f.lead(hace(6), actualizado=hace(6))
    justo = f.lead(hace(7), actualizado=hace(7), valor=0)                 # 7 dias y una hora: days = 7 -> sale
    casi = f.lead(hace(7, -1), actualizado=hace(7, -1))                    # 6 dias y 23 horas: days = 6 -> no sale
    viejo = f.lead(hace(30), actualizado=hace(30), valor=500)
    ganado = f.lead(hace(30), status="INVOICED", actualizado=hace(30))
    perdido = f.lead(hace(30), status="CANCELLED", actualizado=hace(30))
    sin_fecha = f.lead(hace(30), actualizado=None)                          # sin updated_at: 0 dias
    mov = _analisis(app_client, admin_token)["movimientos"]
    assert mov["titulo"] == "Requieren atención" and len(mov["filas"]) <= 8
    ids = [m["doc_id"] for m in mov["filas"]]
    assert ocho.id in ids and justo.id in ids and viejo.id in ids
    for fuera in (seis, casi, ganado, perdido, sin_fecha):
        assert fuera.id not in ids, fuera.id
    assert ids.index(viejo.id) < ids.index(ocho.id) < ids.index(justo.id)   # el mas atrasado primero
    fila = next(m for m in mov["filas"] if m["doc_id"] == viejo.id)
    assert set(fila) == CLAVES_MOVIMIENTO
    assert (fila["tipo"], fila["doc_tipo"], fila["numero"], fila["monto"], fila["formato"]) == (
        "LEAD", "LEAD", f"LEAD-{viejo.id}", 500, "pesos")
    assert fila["titulo"] == f"Lead Analisis{f.s}" and fila["detalle"].startswith("30 días sin movimiento")
    assert fila["fecha"].endswith("Z") and fila["signo"] is None
    sin_monto = next(m for m in mov["filas"] if m["doc_id"] == justo.id)
    assert sin_monto["monto"] is None and sin_monto["formato"] is None and sin_monto["detalle"].startswith("7 días")
    # el mismo resultado con cualquier periodo: es una foto de hoy
    ids_7d = [m["doc_id"] for m in _analisis(app_client, admin_token, periodo="7d")["movimientos"]["filas"]]
    assert ids_7d == ids


# ─── 5) Permisos, errores y contrato ───────────────────────────────────────────────────────────────────────────────────

def test_permisos(app_client, db, admin_token, vendedor_token, compras_token, bodega_token, finanzas_token):
    for token in (admin_token, vendedor_token):
        assert app_client.get(RUTA, params=VENTANA, headers=_auth(token)).status_code == 200
    for token in (compras_token, bodega_token, finanzas_token):
        assert app_client.get(RUTA, params=VENTANA, headers=_auth(token)).status_code == 403
    assert app_client.get(RUTA, params=VENTANA).status_code == 401


def test_errores_422(app_client, admin_token):
    casos = [
        ({"periodo": "xx"}, "Período no válido."),
        ({"periodo": "personalizado"}, "Elige la fecha inicial y la final."),
        ({**VENTANA, "desde": "01/01/2001"}, "Las fechas deben tener el formato AAAA-MM-DD."),
        ({**VENTANA, "desde": "2001-01-11"}, "La fecha inicial debe ser anterior o igual a la final."),
        ({**VENTANA, "hasta": "2999-01-01"}, "La fecha final no puede ser posterior a hoy."),
        ({"periodo": "x\x00"}, "Período no válido."),
        ({**VENTANA, "desde": "2001-02-30"}, "Las fechas deben tener el formato AAAA-MM-DD."),
        ({**VENTANA, "desde": "1998-01-01"}, "El período no puede ser mayor a 2 años."),
        ({**VENTANA, "desde": "9999-01-01", "hasta": "9999-12-31"}, "La fecha final no puede ser posterior a hoy."),
        ({**VENTANA, "desde": "0001-01-01", "hasta": "0001-01-02"}, "Las fechas deben tener el formato AAAA-MM-DD."),
        ({**VENTANA, "top": "7"}, ERROR_TOP),
        ({**VENTANA, "top": "5\x00"}, ERROR_TOP),
        ({**VENTANA, "top": "05"}, ERROR_TOP),
        ({**VENTANA, "top": "x" * 5000}, ERROR_TOP),
    ]
    for params, texto in casos:
        resp = app_client.get(RUTA, params=params, headers=_auth(admin_token))
        assert resp.status_code == 422, (params, resp.status_code, resp.text)
        assert resp.json()["detail"] == texto, params
    for periodo in ("7d", "30d", "90d", "mes", "12m"):
        resp = app_client.get(RUTA, params={"periodo": periodo}, headers=_auth(admin_token))
        assert resp.status_code == 200, (periodo, resp.text)
        assert resp.json()["data"]["periodo"]["clave"] == periodo
    for top in ("5", "10", "25", " 10 "):
        assert _analisis(app_client, admin_token, top=top)["filtros"]["top"] == int(top)
    # sin parametros: 30 dias y top 5
    resp = app_client.get(RUTA, headers=_auth(admin_token)).json()["data"]
    assert resp["periodo"]["clave"] == "30d" and resp["filtros"]["top"] == 5


def test_claves_exactas(app_client, db, admin_token):
    f = _Fabrica(db)
    etapa = f.etapa("Etapa claves", "bg-teal-500", 9201, "DRAFT")
    f.lead(datetime(2001, 1, 2, 15, 0), valor=100, etapa=etapa, asesor="Ana", origen="WhatsApp")
    f.lead(datetime(2000, 11, 1), status="INVOICED", actualizado=datetime(2001, 1, 4, 15, 0), valor=500, asesor="Ana")
    f.lead(datetime(2000, 11, 1), status="CANCELLED", actualizado=datetime(2001, 1, 4, 15, 0))
    f.lead(datetime(2000, 11, 1), actualizado=datetime.utcnow() - timedelta(days=20), valor=10, etapa=etapa)
    data = _analisis(app_client, admin_token)
    assert set(data) == CLAVES_ANALISIS
    for k in data["kpis"]:
        assert set(k) == CLAVES_KPI, k
    assert set(data["linea"]) == CLAVES_LINEA and all(set(s) == CLAVES_SERIE for s in data["linea"]["series"])
    assert len(data["donas"]) == 2 and [d["clave"] for d in data["donas"]] == ["etapa", "origen"]
    for dona in data["donas"]:
        assert set(dona) == CLAVES_DONA and dona["segmentos"], dona
        assert all(set(s) == CLAVES_SEGMENTO for s in dona["segmentos"])
    assert set(data["barras"]) == CLAVES_BARRAS
    assert all(set(s) == CLAVES_SERIE_BARRAS for s in data["barras"]["series"])
    assert set(data["movimientos"]) == CLAVES_MOVIMIENTOS and data["movimientos"]["filas"]
    assert all(set(m) == CLAVES_MOVIMIENTO for m in data["movimientos"]["filas"])
    assert set(data["ranking"]) == CLAVES_RANKING and data["ranking"]["filas"]
    assert data["avisos"] == [] and data["generado_en"].endswith("Z")
    # lo que trae el periodo (RP29)
    assert data["periodo"]["comparado"] == "vs 22 dic 2000 – 31 dic 2000"


def test_consultas_constantes(app_client, db, admin_token, contador_sql):
    """Con 3 y con 30 leads (de varias etapas, asesores, origenes y estados) la llamada hace las mismas consultas, 14 o
    menos (la de la sesion incluida)."""
    f = _Fabrica(db)
    etapas = [f.etapa(f"Etapa c{i}", "bg-teal-500", 9300 + i, "DRAFT") for i in range(3)]

    def crear(n):
        for i in range(n):
            dia = datetime(2001, 1, 1 + i % 10, 10, 0)
            estado = ("DRAFT", "INVOICED", "CANCELLED")[i % 3]
            f.lead(dia, status=estado, actualizado=dia - timedelta(days=i), valor=100 + i, etapa=etapas[i % 3],
                   asesor=f"Asesor {i % 12}", origen=f"Origen {i % 7}")

    def medir():
        cuentas = []
        for extra in ({}, {"top": "25"}, {"periodo": "mes"}):
            with contador_sql.ventana() as v:
                _analisis(app_client, admin_token, **extra)
            cuentas.append(v.consultas)
        return cuentas

    crear(3)
    con_3 = medir()
    crear(27)
    con_30 = medir()
    assert con_3 == con_30, (con_3, con_30)
    assert max(con_30) <= 14, con_30
