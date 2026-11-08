"""B4 T20 (ANALISIS-finanzas puntos 1 y 2 con R7, R13, R16, R21; RP29, RP57, RP59, RP60): GET /api/v1/finance/analisis
(core/analisis_finanzas.py) solo para ADMIN y FINANZAS, con el contrato unico de core/analisis.py.

Se corre SOLO con el runner de ROLLBACK (python tests/rollback_runner.py test_analisis_finanzas): cada prueba va en una
transaccion que se revierte. Las pruebas del periodo usan periodo=personalizado&desde=2001-01-01&hasta=2001-01-10 (el
anterior es 2000-12-22..2000-12-31), donde erp_test no tiene pedidos, pagos ni gastos: las cifras se afirman tal cual. La
cartera (saldo por cobrar) es una foto de hoy y comparte la base: se prueba con saldos mucho mayores que los de la base.
"""
import uuid
from datetime import date, datetime

from app.core.analisis import (CLAVES_ANALISIS, CLAVES_BARRAS, CLAVES_DONA, CLAVES_FILA_RANKING, CLAVES_KPI,
                               CLAVES_LINEA, CLAVES_MOVIMIENTO, CLAVES_MOVIMIENTOS, CLAVES_RANKING, CLAVES_SEGMENTO,
                               CLAVES_SERIE, CLAVES_SERIE_BARRAS)
from app.models.erp_documents import SaleOrder
from app.models.expenses import OperationalExpense
from app.models.fase4 import SaleOrderPayment
from tests.usuarios_de_prueba import bodega_token, compras_token, finanzas_token  # noqa: F401 (fixtures por nombre)

RUTA = "/api/v1/finance/analisis"
VENTANA = {"periodo": "personalizado", "desde": "2001-01-01", "hasta": "2001-01-10"}
FECHAS = [f"2001-01-{d:02d}" for d in range(1, 11)]
CLAVES_KPIS = ["ventas", "dinero_recibido", "gastos", "utilidad"]
ERROR_TOP = "El ranking solo puede mostrar 5, 10 o 25."


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _analisis(app_client, token, **extra):
    resp = app_client.get(RUTA, params={**VENTANA, **extra}, headers=_auth(token))
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
    """Pedidos, pagos y gastos con un sufijo unico. Un db.add por objeto."""

    def __init__(self, db):
        self.db = db
        self.s = uuid.uuid4().hex[:8].upper()
        self.n = 0

    def cliente(self, nombre="Cliente"):
        return f"{nombre} {self.s}"

    def guardar(self, objeto):
        self.db.add(objeto)
        self.db.commit()
        return objeto

    def pven(self, cuando, total, costo=0, estado="PENDIENTE_COMPRA", saldo=0, cliente=None):
        self.n += 1
        return self.guardar(SaleOrder(numero=f"PV-F{self.s}{self.n:02d}", customer_name=cliente or self.cliente(),
                                      estado=estado, total_cop=total, total_cost_cop=costo, saldo_cop=saldo,
                                      created_at=cuando, updated_at=cuando))

    def pago(self, pedido, monto, fecha, tipo="ANTICIPO", metodo="Transferencia bancaria", estado="CONFIRMADO"):
        return self.guardar(SaleOrderPayment(sale_order_id=pedido.id, tipo=tipo, monto=monto, metodo_pago=metodo,
                                             fecha=fecha, estado=estado,
                                             created_at=datetime.combine(fecha, datetime.min.time()).replace(hour=16)))

    def gasto(self, cuando, monto, categoria="Arriendo", descripcion="Gasto de prueba", recurrente=False):
        return self.guardar(OperationalExpense(category=f"{categoria}-{self.s}", description=descripcion, amount=monto,
                                               incurred_date=cuando, is_recurring=recurrente))


# ─── 1) Dinero recibido ───────────────────────────────────────────────────────────────────────────────────────────────

def test_dinero_recibido(app_client, db, admin_token):
    """ANTICIPO CONFIRMADO de 300.000, un TRASLADO de 200.000, un CONVERSION_COTIZACION de 100.000 y uno ANULADO de
    50.000 -> 300.000 (no cuenta el saldo trasladado, ni los pagos sin verificar, ni los anulados). El periodo anterior
    recibio 100.000: +200,0 %. Un pago TRASLADADO (el pedido de origen cuyo dinero paso a otro) cuenta una vez."""
    f = _Fabrica(db)
    p = f.pven(datetime(2001, 1, 2, 15, 0), 1_000_000)
    f.pago(p, 300_000, date(2001, 1, 3))
    f.pago(p, 200_000, date(2001, 1, 3), metodo="TRASLADO")
    f.pago(p, 100_000, date(2001, 1, 3), metodo="CONVERSION_COTIZACION")
    f.pago(p, 50_000, date(2001, 1, 3), estado="ANULADO")
    f.pago(p, 70_000, date(2001, 1, 3), estado="REVERTIDO")
    f.pago(p, 25_000, date(2001, 1, 3), tipo="DEVOLUCION")                     # no es un ingreso
    f.pago(p, 100_000, date(2000, 12, 25))
    k = _kpis(_analisis(app_client, admin_token))
    assert [x["clave"] for x in _analisis(app_client, admin_token)["kpis"]] == CLAVES_KPIS
    recibido = k["dinero_recibido"]
    assert (recibido["valor"], recibido["anterior"], recibido["variacion_pct"]) == (300_000, 100_000, 200.0)
    assert (recibido["etiqueta"], recibido["formato"], recibido["mejor"], recibido["es_foto"]) == (
        "Dinero recibido", "pesos", "sube", False)
    # un pago TRASLADADO cuenta (el dinero entro una vez, en su fecha)
    f.pago(p, 40_000, date(2001, 1, 4), estado="TRASLADADO")
    assert _kpis(_analisis(app_client, admin_token))["dinero_recibido"]["valor"] == 340_000


def test_ventas_y_dinero_coinciden_con_los_de_ventas(app_client, db, admin_token):
    """«Ventas» y «Dinero recibido» son los del Analisis de Ventas para el mismo periodo (R7)."""
    f = _Fabrica(db)
    a = f.pven(datetime(2001, 1, 2, 15, 0), 1_250_000, costo=300_000)
    b = f.pven(datetime(2001, 1, 6, 15, 0), 480_000, costo=100_000, estado="ENTREGADO")
    f.pven(datetime(2001, 1, 7, 15, 0), 9_000_000, estado="CANCELADO")
    f.pven(datetime(2001, 1, 8, 15, 0), 2_000_000, estado="DEVUELTO_TOTAL")
    f.pven(datetime(2000, 12, 25, 15, 0), 750_000, costo=200_000)
    f.pago(a, 600_000, date(2001, 1, 3))
    f.pago(b, 120_000, date(2001, 1, 9), tipo="ABONO", metodo="Efectivo")
    f.pago(a, 55_000, date(2000, 12, 30))
    fin = _kpis(_analisis(app_client, admin_token))
    ventas = app_client.get("/api/v1/ventas/analisis", params={**VENTANA, "foco": "pven"}, headers=_auth(admin_token))
    assert ventas.status_code == 200, ventas.text
    v = {k["clave"]: k for k in ventas.json()["data"]["kpis"]}
    assert (fin["ventas"]["valor"], fin["ventas"]["anterior"]) == (1_730_000, 750_000)
    assert (fin["ventas"]["valor"], fin["ventas"]["anterior"]) == (v["vendido_periodo"]["valor"], v["vendido_periodo"]["anterior"])
    assert (fin["dinero_recibido"]["valor"], fin["dinero_recibido"]["anterior"]) == (720_000, 55_000)
    assert (fin["dinero_recibido"]["valor"], fin["dinero_recibido"]["anterior"]) == (v["recaudado"]["valor"], v["recaudado"]["anterior"])
    assert fin["ventas"]["variacion_pct"] == v["vendido_periodo"]["variacion_pct"]
    # la linea de ventas es la misma serie de ventas_por_cubeta (por dia de Colombia)
    data = _analisis(app_client, admin_token)
    assert data["linea"]["titulo"] == "Ventas y gastos" and data["linea"]["fechas"] == FECHAS
    assert _serie(data["linea"], "ventas")["valores"] == [0, 1_250_000, 0, 0, 0, 480_000, 0, 0, 0, 0]


# ─── 2) Gastos y utilidad ────────────────────────────────────────────────────────────────────────────────────────────

def test_gastos_y_utilidad(app_client, db, admin_token):
    """Un PVEN de 1.000.000 con costo 600.000 y un gasto de 150.000 -> Utilidad 250.000. Un PVEN con costo 0 genera el
    aviso (y su venta sube la utilidad). Los cancelados y devueltos no cuentan, ni para la utilidad ni para el aviso."""
    f = _Fabrica(db)
    f.pven(datetime(2001, 1, 4, 15, 0), 1_000_000, costo=600_000)
    f.gasto(datetime(2001, 1, 5, 17, 0), 150_000)
    f.pven(datetime(2001, 1, 4, 15, 0), 5_000_000, costo=0, estado="CANCELADO")
    f.pven(datetime(2001, 1, 4, 15, 0), 4_000_000, costo=0, estado="DEVUELTO_TOTAL")
    f.pven(datetime(2000, 12, 25, 15, 0), 800_000, costo=500_000)         # periodo anterior: 300.000 de margen
    f.gasto(datetime(2000, 12, 26, 17, 0), 100_000)                       # y 100.000 de gastos: utilidad 200.000
    data = _analisis(app_client, admin_token)
    k = _kpis(data)
    assert (k["ventas"]["valor"], k["ventas"]["anterior"]) == (1_000_000, 800_000)
    assert (k["gastos"]["valor"], k["gastos"]["anterior"], k["gastos"]["variacion_pct"]) == (150_000, 100_000, 50.0)
    assert (k["gastos"]["etiqueta"], k["gastos"]["mejor"], k["gastos"]["formato"]) == ("Gastos", "baja", "pesos")
    assert (k["utilidad"]["valor"], k["utilidad"]["anterior"], k["utilidad"]["variacion_pct"]) == (250_000, 200_000, 25.0)
    assert (k["utilidad"]["etiqueta"], k["utilidad"]["mejor"]) == ("Utilidad estimada", "sube")
    assert data["avisos"] == []
    f.pven(datetime(2001, 1, 6, 15, 0), 400_000, costo=0)
    data = _analisis(app_client, admin_token)
    assert _kpis(data)["utilidad"]["valor"] == 650_000
    assert data["avisos"] == ["1 pedido del período no tiene costo registrado: la utilidad sale más alta."]
    f.pven(datetime(2001, 1, 7, 15, 0), 100_000, costo=0)
    assert _analisis(app_client, admin_token)["avisos"] == [
        "2 pedidos del período no tienen costo registrado: la utilidad sale más alta."]


def test_gasto_borde_colombia(app_client, db, admin_token):
    """Un gasto del 2001-01-11 a las 04:30 UTC es del 10 en Colombia (cuenta); a las 05:00 UTC ya es del 11. Uno guardado
    a las 17:00 UTC del dia 11 cuenta el dia 11 (RP57: la fecha del formulario va al mediodia de Colombia)."""
    f = _Fabrica(db)
    f.gasto(datetime(2001, 1, 11, 4, 30), 1_000)
    f.gasto(datetime(2001, 1, 11, 5, 0), 20_000)
    f.gasto(datetime(2001, 1, 1, 4, 59), 300_000)         # 31 de diciembre 23:59 en Colombia: periodo anterior
    f.gasto(datetime(2001, 1, 11, 17, 0), 4_000_000)
    k = _kpis(_analisis(app_client, admin_token))
    assert (k["gastos"]["valor"], k["gastos"]["anterior"]) == (1_000, 300_000)
    dia_11 = _kpis(_analisis(app_client, admin_token, desde="2001-01-11", hasta="2001-01-11"))
    assert dia_11["gastos"]["valor"] == 4_020_000          # los de las 05:00 y las 17:00 UTC
    data = _analisis(app_client, admin_token)
    assert _serie(data["linea"], "gastos")["valores"][-1] == 1_000     # el dia 10


def test_dona_gastos_por_categoria(app_client, db, admin_token):
    f = _Fabrica(db)
    f.gasto(datetime(2001, 1, 3, 17, 0), 100_000, categoria="Arriendo")
    f.gasto(datetime(2001, 1, 4, 17, 0), 60_000, categoria="Servicios")
    f.gasto(datetime(2001, 1, 5, 17, 0), 40_000, categoria="Servicios")
    f.gasto(datetime(2001, 1, 6, 17, 0), 10_000, categoria="Nomina")
    f.gasto(datetime(2000, 12, 26, 17, 0), 999_999, categoria="Anterior")
    p = f.pven(datetime(2001, 1, 2, 15, 0), 1_000_000)
    f.pago(p, 300_000, date(2001, 1, 3))
    f.pago(p, 50_000, date(2001, 1, 4), metodo="Efectivo")
    f.pago(p, 20_000, date(2001, 1, 4), metodo=None)
    data = _analisis(app_client, admin_token)
    assert [d["clave"] for d in data["donas"]] == ["gastos_por_categoria", "recibido_por_medio"]
    gastos = _dona(data, "gastos_por_categoria")
    assert (gastos["titulo"], gastos["formato"], gastos["total"]) == ("Gastos por categoría", "pesos", 210_000)
    assert [(s["etiqueta"], s["valor"], s["pct"]) for s in gastos["segmentos"]] == [
        (f"Arriendo-{f.s}", 100_000, 47.6), (f"Servicios-{f.s}", 100_000, 47.6), (f"Nomina-{f.s}", 10_000, 4.8)]
    medios = _dona(data, "recibido_por_medio")
    assert (medios["titulo"], medios["formato"], medios["total"]) == ("Dinero recibido por medio de pago", "pesos", 370_000)
    assert [(s["etiqueta"], s["valor"]) for s in medios["segmentos"]] == [
        ("Transferencia bancaria", 300_000), ("Efectivo", 50_000), ("Sin método", 20_000)]


# ─── 3) Flujo de caja ─────────────────────────────────────────────────────────────────────────────────────────────────

def test_flujo_de_caja(app_client, db, admin_token):
    """Entradas positivas (el dinero recibido) y salidas negativas (gastos + devoluciones CONFIRMADO o TRASLADADO), por dia de Colombia."""
    f = _Fabrica(db)
    p = f.pven(datetime(2001, 1, 2, 15, 0), 1_000_000)
    f.pago(p, 300_000, date(2001, 1, 3))
    f.pago(p, 100_000, date(2001, 1, 5), tipo="ABONO")
    f.pago(p, 25_000, date(2001, 1, 5), tipo="DEVOLUCION")
    f.pago(p, 777_000, date(2001, 1, 5), tipo="DEVOLUCION", estado="REVERTIDO")      # no cuenta
    f.pago(p, 888_000, date(2001, 1, 6), tipo="DEVOLUCION", estado="ANULADO")        # no cuenta
    f.pago(p, 10_000, date(2001, 1, 6), tipo="DEVOLUCION", estado="TRASLADADO")      # T20 r1 (I2): movio dinero, cuenta
    f.gasto(datetime(2001, 1, 5, 17, 0), 150_000)
    f.gasto(datetime(2001, 1, 3, 17, 0), 40_000)
    barras = _analisis(app_client, admin_token)["barras"]
    assert (barras["titulo"], barras["formato"], barras["eje"]) == ("Flujo de caja", "pesos", "fechas")
    assert barras["etiquetas"] == FECHAS and barras["apiladas"] is True
    entradas, salidas = _serie(barras, "entradas"), _serie(barras, "salidas")
    assert (entradas["etiqueta"], entradas["tono"]) == ("Entradas", "positivo")
    assert (salidas["etiqueta"], salidas["tono"]) == ("Salidas", "negativo")
    assert entradas["valores"] == [0, 0, 300_000, 0, 100_000, 0, 0, 0, 0, 0]
    assert salidas["valores"] == [0, 0, -40_000, 0, -175_000, -10_000, 0, 0, 0, 0]
    assert [s["clave"] for s in barras["series"]] == ["entradas", "salidas"]


def test_movimientos_recientes(app_client, db, admin_token):
    """Pagos (+), gastos y devoluciones (-), los 8 mas recientes; los pagos y devoluciones abren su pedido, los gastos la
    pantalla de Gastos."""
    f = _Fabrica(db)
    p = f.pven(datetime(2001, 1, 2, 15, 0), 1_000_000)
    pago = f.pago(p, 300_000, date(2001, 1, 3), tipo="ABONO")
    devolucion = f.pago(p, 25_000, date(2001, 1, 4), tipo="DEVOLUCION")
    gasto = f.gasto(datetime(2001, 1, 5, 17, 0), 150_000, categoria="Arriendo", descripcion="Bodega norte")
    f.pago(p, 5_000, date(2001, 1, 6), estado="ANULADO")                 # un pago anulado no es un movimiento
    mov = _analisis(app_client, admin_token)["movimientos"]
    assert mov["titulo"] == "Movimientos recientes"
    assert all(set(m) == CLAVES_MOVIMIENTO for m in mov["filas"])
    assert [(m["tipo"], m["doc_tipo"], m["doc_id"], m["signo"], m["monto"]) for m in mov["filas"]] == [
        ("GASTO", "GASTO", gasto.id, "-", 150_000),
        ("DEVOLUCION", "PVEN", p.id, "-", 25_000),
        ("PAGO", "PVEN", p.id, "+", 300_000),
    ]
    g, d, c = mov["filas"]
    assert g["titulo"] == f"Arriendo-{f.s}" and g["detalle"] == "Bodega norte" and g["fecha"] == "2001-01-05T17:00:00Z"
    assert d["numero"] == p.numero and d["fecha"].endswith("Z") and c["fecha"] == pago.created_at.isoformat() + "Z"
    assert c["numero"] == p.numero and c["titulo"] == "Abono" and all(m["formato"] == "pesos" for m in mov["filas"])
    # son 8 como mucho
    for i in range(10):
        f.gasto(datetime(2001, 1, 2, 17, 0), 1_000 + i)
    assert len(_analisis(app_client, admin_token)["movimientos"]["filas"]) == 8


def test_empates_del_ranking_y_de_los_movimientos(app_client, db, admin_token):
    """T20 r1 (m9): a igual saldo manda el nombre; a igual instante, el id más nuevo primero."""
    f = _Fabrica(db)
    zeta, alfa = f.cliente("Zeta"), f.cliente("Alfa")
    f.pven(datetime(2001, 1, 2), 900_000_000_000, saldo=800_000_000_000, cliente=zeta)
    f.pven(datetime(2001, 1, 2), 900_000_000_000, saldo=800_000_000_000, cliente=alfa)
    filas = [x["nombre"] for x in _analisis(app_client, admin_token)["ranking"]["filas"] if x["nombre"] in (zeta, alfa)]
    assert filas == [alfa, zeta]
    p = f.pven(datetime(2001, 1, 2, 15, 0), 1_000_000)
    f.pago(p, 1_000, date(2001, 1, 3))
    f.pago(p, 2_000, date(2001, 1, 3))      # mismo created_at: el id mayor primero
    mov = _analisis(app_client, admin_token)["movimientos"]["filas"]
    assert [m["monto"] for m in mov] == [2_000, 1_000]


# ─── 4) Cartera: foto de hoy (RP59) ──────────────────────────────────────────────────────────────────────────────────

def test_cartera_foto(app_client, db, admin_token):
    """El ranking cuenta un ENTREGADO que todavia debe y deja fuera CANCELADO y DEVUELTO_TOTAL; un saldo a favor
    (negativo) no resta; y el porcentaje de cada cliente es contra la cartera completa de /ventas/stats."""
    f = _Fabrica(db)
    antes = float(app_client.get("/api/v1/ventas/stats", headers=_auth(admin_token)).json()["data"]["kpis"][
        "pven_saldo_por_cobrar"])
    a, b = f.cliente("Deudora A"), f.cliente("Deudor B")
    f.pven(datetime(2001, 1, 2), 9_000_000_000, estado="ENTREGADO", saldo=5_000_000_000, cliente=a)
    f.pven(datetime(2001, 1, 2), 1_000_000_000, estado="PENDIENTE_COMPRA", saldo=1_000_000_000, cliente=a)
    f.pven(datetime(2001, 1, 2), 5_000_000, estado="FACTURADO", saldo=-3_000_000_000, cliente=a)   # a favor: no resta
    f.pven(datetime(2001, 1, 2), 9_000_000_000, estado="PENDIENTE_COMPRA", saldo=9_000_000_000, cliente=b)
    f.pven(datetime(1999, 1, 2), 9_000_000_000, estado="EN_PROCESO", saldo=2_000_000_000, cliente=b)   # viejo: cuenta
    f.pven(datetime(2001, 1, 2), 9_000_000_000, estado="CANCELADO", saldo=8_000_000_000, cliente=b)
    f.pven(datetime(2001, 1, 2), 9_000_000_000, estado="DEVUELTO_TOTAL", saldo=7_000_000_000, cliente=b)
    for periodo in (VENTANA, {"periodo": "7d"}):
        data = app_client.get(RUTA, params=periodo, headers=_auth(admin_token)).json()["data"]
        ranking = data["ranking"]
        assert (ranking["titulo"], ranking["columna"], ranking["formato"]) == (
            "Clientes con más saldo por cobrar", "Saldo", "pesos")
        assert all(set(x) == CLAVES_FILA_RANKING for x in ranking["filas"])
        filas = [x for x in ranking["filas"] if x["nombre"] in (a, b)]
        assert [(x["nombre"], x["valor"], x["cantidad"]) for x in filas] == [(b, 11_000_000_000, 2), (a, 6_000_000_000, 2)]
        assert filas[0]["detalle"] == "2 pedidos" and filas[1]["detalle"] == "2 pedidos"   # solo los que deben
        assert ranking["filas"][0]["posicion"] == 1
    stats = app_client.get("/api/v1/ventas/stats", headers=_auth(admin_token)).json()["data"]
    cartera = float(stats["kpis"]["pven_saldo_por_cobrar"])
    ranking = _analisis(app_client, admin_token)["ranking"]
    primero = ranking["filas"][0]
    assert primero["nombre"] == b and primero["pct"] == round(primero["valor"] / cartera * 100, 1)
    assert cartera >= 17_000_000_000
    # T20 r1 (m3, RP59): la suma del ranking COMPLETO es el pven_saldo_por_cobrar de /ventas/stats, con los mismos datos
    # r2 (m4): sin depender de cuantos deudores trae erp_test: los clientes de la prueba suman exactamente lo que subio la cartera
    completo = _analisis(app_client, admin_token, top="25")["ranking"]["filas"]
    assert sum(x["valor"] for x in completo if x["nombre"] in (a, b)) == cartera - antes == 17_000_000_000


# ─── 5) Permisos, errores y contrato ─────────────────────────────────────────────────────────────────────────────────

def test_permisos(app_client, db, admin_token, finanzas_token, vendedor_token, compras_token, bodega_token):
    for token in (admin_token, finanzas_token):
        assert app_client.get(RUTA, params=VENTANA, headers=_auth(token)).status_code == 200
    for token in (vendedor_token, compras_token, bodega_token):
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
    resp = app_client.get(RUTA, headers=_auth(admin_token)).json()["data"]
    assert resp["periodo"]["clave"] == "30d" and resp["filtros"]["top"] == 5


def test_claves_exactas(app_client, db, admin_token):
    f = _Fabrica(db)
    p = f.pven(datetime(2001, 1, 2, 15, 0), 1_000_000, costo=0, saldo=400_000)
    f.pago(p, 600_000, date(2001, 1, 3))
    f.pago(p, 10_000, date(2001, 1, 4), tipo="DEVOLUCION")
    f.gasto(datetime(2001, 1, 5, 17, 0), 150_000)
    data = _analisis(app_client, admin_token)
    assert set(data) == CLAVES_ANALISIS
    for k in data["kpis"]:
        assert set(k) == CLAVES_KPI, k
    assert set(data["linea"]) == CLAVES_LINEA and all(set(s) == CLAVES_SERIE for s in data["linea"]["series"])
    assert [s["clave"] for s in data["linea"]["series"]] == ["ventas", "gastos"]
    assert not any(s["es_anterior"] for s in data["linea"]["series"])
    assert (data["linea"]["total"], data["linea"]["total_anterior"]) == (1_000_000, 0)
    assert len(data["donas"]) == 2
    for dona in data["donas"]:
        assert set(dona) == CLAVES_DONA and dona["segmentos"], dona
        assert all(set(s) == CLAVES_SEGMENTO for s in dona["segmentos"])
    assert set(data["barras"]) == CLAVES_BARRAS
    assert all(set(s) == CLAVES_SERIE_BARRAS for s in data["barras"]["series"])
    assert set(data["movimientos"]) == CLAVES_MOVIMIENTOS and data["movimientos"]["filas"]
    assert set(data["ranking"]) == CLAVES_RANKING and data["ranking"]["filas"]
    assert data["filtros"] == {"foco": None, "top": 5, "producto": None, "bodega": None}
    assert data["generado_en"].endswith("Z")
    assert data["periodo"]["desde"] == "2001-01-01" and data["periodo"]["hasta"] == "2001-01-10"


def test_consultas_constantes(app_client, db, admin_token, contador_sql):
    """Con 3 y con 30 pedidos (cada uno con su pago y su gasto, de varios clientes y medios de pago) la llamada hace las
    mismas consultas, 14 o menos (la de la sesion incluida)."""
    f = _Fabrica(db)

    def crear(n):
        for i in range(n):
            dia = datetime(2001, 1, 1 + i % 10, 10, 0)
            p = f.pven(dia, 100_000 + i, costo=50_000, saldo=10_000 + i, cliente=f.cliente(f"C{i}"))
            f.pago(p, 1_000 + i, dia.date(), metodo=("Efectivo", "Nequi", "PSE", None)[i % 4])
            if i % 5 == 0:
                f.pago(p, 100, dia.date(), tipo="DEVOLUCION")
            f.gasto(dia, 500 + i, categoria=f"Cat{i % 9}")

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
