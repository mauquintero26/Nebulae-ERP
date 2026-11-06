"""B4 T6C (ANALISIS-ventas puntos 1 y 2 con R7, R13 y R21; C12; RP1, RP29, RP31, RP32, RP60, RP69, RP71, RP106; D3,
D34): GET /api/v1/ventas/analisis (foco hub | sc | cot | pven) con core/analisis_ventas.py, y GET /ventas/analytics
retirado (404).

Se corre SOLO con el runner de ROLLBACK (python tests/rollback_runner.py test_analisis_ventas): cada prueba va en una
transacción que se revierte. Todas usan periodo=personalizado&desde=2001-01-01&hasta=2001-01-10 (el anterior es
2000-12-22..2000-12-31), donde erp_test no tiene documentos: las cifras se afirman tal cual. Los documentos se crean por
ORM con un created_at fijo (UTC sin zona) y clientes con sufijo uuid; un db.add por objeto.
"""
import uuid
from datetime import date, datetime

from app.core.analisis import (CLAVES_ANALISIS, CLAVES_BARRAS, CLAVES_DONA, CLAVES_FILA_RANKING, CLAVES_KPI,
                               CLAVES_LINEA, CLAVES_MOVIMIENTO, CLAVES_MOVIMIENTOS, CLAVES_RANKING, CLAVES_SEGMENTO,
                               CLAVES_SERIE, CLAVES_SERIE_BARRAS)
from app.core.textos_actividad import TIPOS_PAGO
from app.core.ventas_dinero import TIPOS_PAGO_INGRESO
from app.models.customers import Customer
from app.models.erp_documents import CustomerRequest, SaleOrder, SalesQuotation
from app.models.fase1b import SaleOrderLineErp
from app.models.fase4 import SaleOrderPayment
from tests.usuarios_de_prueba import bodega_token  # noqa: F401 (fixture por nombre, RP79)

RUTA = "/api/v1/ventas/analisis"
VENTANA = {"periodo": "personalizado", "desde": "2001-01-01", "hasta": "2001-01-10"}
FECHAS = [f"2001-01-{d:02d}" for d in range(1, 11)]
FOCOS = ("hub", "sc", "cot", "pven")
KPIS_POR_FOCO = {
    "hub": ["vendido_periodo", "pedidos_nuevos", "ticket_promedio", "cot_conversion"],
    "sc": ["solicitudes_nuevas", "sc_con_cotizacion_pct", "sc_canceladas_periodo", "dias_hasta_cotizar"],
    "cot": ["cotizado", "cotizaciones_nuevas", "cot_aprobadas_pct", "cot_rechazadas_o_vencidas"],
    "pven": ["vendido_periodo", "pedidos_nuevos", "recaudado", "pven_saldo_por_cobrar"],
}
AVISO_IVA = "Por categoría se suma el valor de los productos sin IVA; el total puede ser menor que Ventas."
ERROR_TOP = "El ranking solo puede mostrar 5, 10 o 25."
ERROR_PRODUCTO = "El producto debe tener entre 2 y 60 caracteres."


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _analisis(app_client, token, **extra):
    resp = app_client.get(RUTA, params={**VENTANA, **extra}, headers=_auth(token))
    assert resp.status_code == 200, resp.text
    cuerpo = resp.json()
    assert cuerpo["status"] == "success"
    return cuerpo["data"]


def _error(app_client, token, params) -> str:
    resp = app_client.get(RUTA, params=params, headers=_auth(token))
    assert resp.status_code == 422, (params, resp.status_code, resp.text)
    return resp.json()["detail"]


def _kpis(data):
    return {k["clave"]: k for k in data["kpis"]}


def _dona(data, clave):
    return next(d for d in data["donas"] if d["clave"] == clave)


def _segmentos(dona):
    return {s["etiqueta"]: s["valor"] for s in dona["segmentos"]}


def _serie(bloque, clave):
    return next(s for s in bloque["series"] if s["clave"] == clave)


class _Fabrica:
    """Documentos con un sufijo único y created_at = updated_at = `cuando`. Un db.add por objeto."""

    def __init__(self, db):
        self.db = db
        self.sufijo = uuid.uuid4().hex[:8].upper()
        self.n = 0

    def cliente(self, nombre="Cliente"):
        return f"{nombre} {self.sufijo}"

    def _numero(self, prefijo):
        self.n += 1
        return f"{prefijo}{self.sufijo}{self.n:02d}"

    def guardar(self, objeto):
        self.db.add(objeto)
        self.db.commit()
        return objeto

    def sc(self, cuando, estado="BORRADOR", cliente=None, **campos):
        campos.setdefault("tipo_solicitud", "Cotizacion de Producto")
        return self.guardar(CustomerRequest(numero=self._numero("SC-A"), customer_name=cliente or self.cliente(),
                                            estado=estado, created_at=cuando, updated_at=cuando, **campos))

    def cot(self, cuando, estado="BORRADOR", sc=None, total=0, cliente=None, **campos):
        return self.guardar(SalesQuotation(numero=self._numero("COT-A"), customer_name=cliente or self.cliente(),
                                           sc_id=sc.id if sc is not None else None, estado=estado, total_cop=total,
                                           created_at=cuando, updated_at=cuando, **campos))

    def pven(self, cuando, total, estado="PENDIENTE_COMPRA", cot=None, cliente=None, **campos):
        return self.guardar(SaleOrder(numero=self._numero("PV-A"), customer_name=cliente or self.cliente(),
                                      cot_id=cot.id if cot is not None else None, estado=estado, total_cop=total,
                                      created_at=cuando, updated_at=cuando, **campos))

    def linea(self, pedido, cantidad, precio, sku=None, descuento=0, canceladas=0):
        return self.guardar(SaleOrderLineErp(so_id=pedido.id, sku_id=sku.id if sku is not None else None,
                                             description="Línea de prueba", quantity=cantidad, unit_price_cop=precio,
                                             descuento_pct=descuento, quantity_cancelled=canceladas))

    def pago(self, pedido, monto, fecha, tipo="ANTICIPO", metodo="Transferencia bancaria", estado="CONFIRMADO",
             creado=None):
        return self.guardar(SaleOrderPayment(sale_order_id=pedido.id, tipo=tipo, monto=monto, metodo_pago=metodo,
                                             fecha=fecha, estado=estado,
                                             created_at=creado or datetime.combine(fecha, datetime.min.time())
                                             .replace(hour=16)))


# ─── 1) KPIs del Hub y su variación (R7) ──────────────────────────────────────────────────────────────────────────────

def test_kpis_hub_y_variacion(app_client, db, admin_token):
    """A 1.000.000 (2001-01-02 15:00 UTC), B 500.000 (01-05), C CANCELADO 9.000.000 (01-06), E DEVUELTO_TOTAL 2.000.000
    (01-07) y D 750.000 (2000-12-25): Ventas 1.500.000 contra 750.000 (+100,0), Pedidos 2 contra 1 y Ticket 750.000
    contra 750.000 (0,0). Sin cotizaciones la conversión es None, no 0."""
    f = _Fabrica(db)
    f.pven(datetime(2001, 1, 2, 15, 0), 1_000_000)
    f.pven(datetime(2001, 1, 5, 15, 0), 500_000, estado="ENTREGADO")
    f.pven(datetime(2001, 1, 6, 15, 0), 9_000_000, estado="CANCELADO")
    f.pven(datetime(2001, 1, 7, 15, 0), 2_000_000, estado="DEVUELTO_TOTAL")
    f.pven(datetime(2000, 12, 25, 15, 0), 750_000, estado="FACTURADO")

    data = _analisis(app_client, admin_token, foco="hub")
    k = _kpis(data)
    assert [x["clave"] for x in data["kpis"]] == KPIS_POR_FOCO["hub"]
    assert [x["etiqueta"] for x in data["kpis"]] == ["Ventas", "Pedidos", "Ticket promedio",
                                                     "% de cotizaciones con pedido"]
    assert (k["vendido_periodo"]["valor"], k["vendido_periodo"]["anterior"]) == (1_500_000, 750_000)
    assert k["vendido_periodo"]["variacion_pct"] == 100.0
    assert (k["vendido_periodo"]["formato"], k["vendido_periodo"]["mejor"]) == ("pesos", "sube")
    assert (k["pedidos_nuevos"]["valor"], k["pedidos_nuevos"]["anterior"], k["pedidos_nuevos"]["formato"]) == (
        2, 1, "entero")
    assert (k["ticket_promedio"]["valor"], k["ticket_promedio"]["anterior"]) == (750_000, 750_000)
    assert k["ticket_promedio"]["variacion_pct"] == 0.0
    assert (k["cot_conversion"]["valor"], k["cot_conversion"]["anterior"], k["cot_conversion"]["variacion_pct"]) == (
        None, None, None)
    assert k["cot_conversion"]["formato"] == "porcentaje"
    # «Pedidos por estado» sí cuenta los cancelados y los devueltos (no suman dinero, pero aparecen).
    assert _segmentos(_dona(data, "estado")) == {"Pendiente de compra": 1, "Entregado": 1, "Cancelado": 1,
                                                 "Devuelto": 1}
    assert data["filtros"] == {"foco": "hub", "top": 5, "producto": None, "bodega": None}
    assert data["periodo"]["desde"] == "2001-01-01" and data["periodo"]["anterior_desde"] == "2000-12-22"


def test_sin_foco_es_el_hub(app_client, admin_token):
    data = _analisis(app_client, admin_token)
    assert data["filtros"]["foco"] == "hub"
    assert [x["clave"] for x in data["kpis"]] == KPIS_POR_FOCO["hub"]


# ─── 2) Borde del día de Colombia (RP1) ───────────────────────────────────────────────────────────────────────────────

def test_borde_de_dia_colombia(app_client, db, admin_token):
    """2001-01-11 04:30 UTC es el 10 de enero a las 23:30 en Colombia: cuenta. 2001-01-01 04:30 UTC es el 31 de diciembre
    a las 23:30: va al período anterior."""
    f = _Fabrica(db)
    f.pven(datetime(2001, 1, 11, 4, 30), 100_000)
    f.pven(datetime(2001, 1, 1, 4, 30), 200_000)
    k = _kpis(_analisis(app_client, admin_token, foco="hub"))
    assert (k["pedidos_nuevos"]["valor"], k["pedidos_nuevos"]["anterior"]) == (1, 1)
    assert (k["vendido_periodo"]["valor"], k["vendido_periodo"]["anterior"]) == (100_000, 200_000)


# ─── 3) Línea rellena y alineada; barras «Cotizado vs. vendido» ──────────────────────────────────────────────────────

def test_linea_rellena_y_alineada(app_client, db, admin_token):
    f = _Fabrica(db)
    f.pven(datetime(2001, 1, 2, 15, 0), 1_000_000)
    f.pven(datetime(2000, 12, 25, 15, 0), 750_000)
    f.cot(datetime(2001, 1, 3, 15, 0), total=400_000)
    data = _analisis(app_client, admin_token, foco="hub")

    linea = data["linea"]
    assert (linea["titulo"], linea["formato"]) == ("Ventas en el tiempo", "pesos")
    assert linea["fechas"] == FECHAS
    actual, anterior = _serie(linea, "actual"), _serie(linea, "anterior")
    assert (actual["es_anterior"], anterior["es_anterior"]) == (False, True)
    assert actual["valores"] == [0, 1_000_000, 0, 0, 0, 0, 0, 0, 0, 0]
    assert len(anterior["valores"]) == 10 and anterior["valores"][3] == 750_000   # 2000-12-22 + 3 = 25 dic
    assert sum(anterior["valores"]) == 750_000
    assert (linea["total"], linea["total_anterior"], linea["variacion_pct"]) == (1_000_000, 750_000, 33.3)

    barras = data["barras"]
    assert (barras["titulo"], barras["formato"], barras["eje"], barras["apiladas"]) == (
        "Cotizado vs. vendido", "pesos", "fechas", False)
    assert barras["etiquetas"] == FECHAS
    assert [s["clave"] for s in barras["series"]] == ["cotizado", "vendido"]
    assert _serie(barras, "cotizado")["valores"][2] == 400_000
    assert _serie(barras, "vendido")["valores"] == actual["valores"]
    assert {s["tono"] for s in barras["series"]} <= {"positivo", "neutro"}   # D44: nada se dibuja hacia abajo


# ─── 4) Dona por categoría (RP32, RP106, D3) ──────────────────────────────────────────────────────────────────────────

def test_dona_por_categoria(app_client, db, admin_token, sku, category):
    """Por línea: base = redondear_peso((cantidad − canceladas) × precio) y neto = base − redondear_peso(base × descuento /
    100), como core/iva.totales_lineas_pedido, sin IVA (D3). Una línea sin unidades vigentes no cuenta; una sin SKU va a
    «Sin categoría» y trae el aviso; un pedido CANCELADO no suma."""
    from app.core.iva import totales_lineas_pedido
    f = _Fabrica(db)
    pedido = f.pven(datetime(2001, 1, 4, 15, 0), 1_000_000)
    con_sku = [(2, 100_000, 10, 0), (2, 30_000, 0, 1), (1, 1_001, 15, 0)]
    for cantidad, precio, descuento, canceladas in con_sku:
        f.linea(pedido, cantidad, precio, sku=sku, descuento=descuento, canceladas=canceladas)
    f.linea(pedido, 1, 999_999, sku=sku, canceladas=1)     # sin unidades vigentes: no cuenta
    f.linea(pedido, 1, 50_000)                            # sin SKU
    cancelado = f.pven(datetime(2001, 1, 5, 15, 0), 700_000, estado="CANCELADO")
    f.linea(cancelado, 1, 700_000, sku=sku)

    esperado = totales_lineas_pedido([{"cantidad": c - k, "precio_unitario_cop": p, "descuento_pct": d}
                                      for c, p, d, k in con_sku])["neto_cop"]
    assert esperado == 180_000 + 30_000 + 851

    data = _analisis(app_client, admin_token, foco="hub")
    dona = _dona(data, "categoria")
    assert (dona["titulo"], dona["formato"]) == ("Ventas por categoría", "pesos")
    assert _segmentos(dona) == {category.name: esperado, "Sin categoría": 50_000}
    assert dona["total"] == esperado + 50_000
    assert {s["clave"] for s in dona["segmentos"]} == {str(category.id), "sin_categoria"}
    assert data["avisos"] == ["1 pedido tiene productos sin categoría", AVISO_IVA]


def test_dona_por_categoria_sin_lineas_no_trae_avisos(app_client, db, admin_token, sku, category):
    f = _Fabrica(db)
    data = _analisis(app_client, admin_token, foco="hub")
    assert _dona(data, "categoria")["segmentos"] == [] and data["avisos"] == []
    pedido = f.pven(datetime(2001, 1, 4, 15, 0), 100_000)
    f.linea(pedido, 1, 100_000, sku=sku)
    otro = f.pven(datetime(2001, 1, 6, 15, 0), 100_000)
    f.linea(otro, 1, 20_000)
    tercero = f.pven(datetime(2001, 1, 7, 15, 0), 100_000)
    f.linea(tercero, 2, 10_000)
    data = _analisis(app_client, admin_token, foco="hub")
    assert data["avisos"] == ["2 pedidos tienen productos sin categoría", AVISO_IVA]


# ─── 5) Conversión de cotizaciones (R7) ───────────────────────────────────────────────────────────────────────────────

def test_conversion_cotizaciones(app_client, db, admin_token):
    """4 COT del período: una con un pedido vigente y otra solo con un pedido CANCELADO -> 25,0."""
    f = _Fabrica(db)
    cots = [f.cot(datetime(2001, 1, d, 15, 0), estado="CONFIRMADA") for d in (2, 3, 4, 5)]
    f.pven(datetime(2001, 1, 6, 15, 0), 100_000, cot=cots[0])
    f.pven(datetime(2001, 1, 6, 16, 0), 100_000, estado="CANCELADO", cot=cots[1])
    k = _kpis(_analisis(app_client, admin_token, foco="hub"))
    assert (k["cot_conversion"]["valor"], k["cot_conversion"]["anterior"]) == (25.0, None)


# ─── 6) Ranking y top (D34) ───────────────────────────────────────────────────────────────────────────────────────────

def test_ranking_top(app_client, db, admin_token):
    """Mejores clientes por monto (COALESCE(customer_id, customer_name)): con top=5 salen 5 de 6, en orden, con su
    cantidad de pedidos y su % del total. validar_top acepta 5, 10 y 25 (D34): 7 (y 2) dan 422 con el texto."""
    f = _Fabrica(db)
    persona = f.guardar(Customer(first_name="Xavier", last_name=f.sufijo))
    dia = datetime(2001, 1, 3, 15, 0)
    f.pven(dia, 900_000, cliente=f.cliente("B"))
    f.pven(dia, 300_000, cliente=f.cliente("A"))
    f.pven(dia, 400_000, cliente=f.cliente("A"))
    f.pven(dia, 200_000, cliente=f.cliente("X dos"), customer_id=persona.id)
    f.pven(dia, 300_000, cliente=f.cliente("X uno"), customer_id=persona.id)
    f.pven(dia, 450_000, cliente=f.cliente("D"))
    f.pven(dia, 300_000, cliente=f.cliente("E"))
    f.pven(dia, 100_000, cliente=f.cliente("C"))

    data = _analisis(app_client, admin_token, foco="hub", top="5")
    ranking = data["ranking"]
    assert (ranking["titulo"], ranking["columna"], ranking["formato"]) == ("Mejores clientes", "Vendido", "pesos")
    filas = ranking["filas"]
    assert [(r["posicion"], r["nombre"], r["valor"], r["cantidad"]) for r in filas] == [
        (1, f.cliente("B"), 900_000, 1), (2, f.cliente("A"), 700_000, 2), (3, f.cliente("X uno"), 500_000, 2),
        (4, f.cliente("D"), 450_000, 1), (5, f.cliente("E"), 300_000, 1)]
    assert [r["pct"] for r in filas] == [30.5, 23.7, 16.9, 15.3, 10.2]   # sobre 2.950.000
    assert (filas[0]["detalle"], filas[1]["detalle"]) == ("1 pedido", "2 pedidos")
    assert data["filtros"]["top"] == 5
    assert len(_analisis(app_client, admin_token, foco="hub", top="10")["ranking"]["filas"]) == 6
    for top in ("7", "2", "abc"):
        assert _error(app_client, admin_token, {**VENTANA, "top": top}) == ERROR_TOP, top


# ─── 7) Foco Solicitudes ──────────────────────────────────────────────────────────────────────────────────────────────

def test_foco_sc(app_client, db, admin_token):
    """3 SC del período (una con COT BORRADOR, otra con COT RECHAZADA y una CANCELADA sin COT), una de Soporte (fuera,
    R8) y una del anterior: '% con cotización' 33,3 (la RECHAZADA no cuenta); cada COT llega 2 días después de su SC:
    'Días hasta cotizar' 2,0."""
    f = _Fabrica(db)
    sc1 = f.sc(datetime(2001, 1, 2, 10, 0), advisor_name="Ana")
    f.cot(datetime(2001, 1, 4, 10, 0), sc=sc1)
    sc2 = f.sc(datetime(2001, 1, 3, 10, 0), estado="ASIGNADA", advisor_name="Ana")
    f.cot(datetime(2001, 1, 5, 10, 0), estado="RECHAZADA", sc=sc2)
    f.sc(datetime(2001, 1, 3, 12, 0), estado="CANCELADA", advisor_name="  ")
    f.sc(datetime(2001, 1, 3, 13, 0), estado="ASIGNADA", tipo_solicitud="Soporte Tecnico")
    f.sc(datetime(2000, 12, 28, 10, 0), tipo_solicitud="Seguimiento")

    data = _analisis(app_client, admin_token, foco="sc")
    k = _kpis(data)
    assert [x["clave"] for x in data["kpis"]] == KPIS_POR_FOCO["sc"]
    assert [x["etiqueta"] for x in data["kpis"]] == ["Solicitudes nuevas", "% con cotización", "Canceladas",
                                                     "Días hasta cotizar"]
    assert (k["solicitudes_nuevas"]["valor"], k["solicitudes_nuevas"]["anterior"]) == (3, 1)
    assert (k["sc_con_cotizacion_pct"]["valor"], k["sc_con_cotizacion_pct"]["anterior"]) == (33.3, 0.0)
    assert (k["sc_canceladas_periodo"]["valor"], k["sc_canceladas_periodo"]["mejor"]) == (1, "baja")
    assert (k["dias_hasta_cotizar"]["valor"], k["dias_hasta_cotizar"]["anterior"]) == (2.0, None)
    assert (k["dias_hasta_cotizar"]["formato"], k["dias_hasta_cotizar"]["mejor"]) == ("dias", "baja")

    assert (data["linea"]["titulo"], data["linea"]["formato"]) == ("Solicitudes nuevas", "entero")
    assert _serie(data["linea"], "actual")["valores"] == [0, 1, 2, 0, 0, 0, 0, 0, 0, 0]
    assert _segmentos(_dona(data, "estado")) == {"Nueva": 1, "Asignada": 1, "Cancelada": 1}
    tipo = _dona(data, "tipo")
    assert [(s["clave"], s["etiqueta"], s["valor"]) for s in tipo["segmentos"]] == [
        ("Cotizacion de Producto", "Cotización de producto", 3)]

    barras = data["barras"]
    assert (barras["titulo"], barras["eje"], barras["apiladas"], barras["formato"]) == (
        "Solicitudes por asesor", "categorias", True, "entero")
    assert barras["etiquetas"] == ["Ana", "Sin asesor"]
    assert _serie(barras, "con_cotizacion")["valores"] == [1, 0]
    assert _serie(barras, "sin_cotizacion")["valores"] == [1, 1]

    movimientos = data["movimientos"]
    assert movimientos["titulo"] == "Últimas solicitudes"
    assert [m["doc_tipo"] for m in movimientos["filas"]] == ["SC", "SC", "SC"]
    assert [m["estado_etiqueta"] for m in movimientos["filas"]] == ["Cancelada", "Asignada", "Nueva"]
    assert all(m["fecha"].endswith("Z") for m in movimientos["filas"])
    assert data["ranking"]["titulo"] == "Clientes con más solicitudes"
    assert [(r["nombre"], r["valor"]) for r in data["ranking"]["filas"]] == [(f.cliente(), 3)]


def test_dias_hasta_cotizar_cuenta_desde_la_primera_cotizacion(app_client, db, admin_token):
    f = _Fabrica(db)
    sc = f.sc(datetime(2001, 1, 2, 0, 0))
    f.cot(datetime(2001, 1, 7, 0, 0), sc=sc)
    f.cot(datetime(2001, 1, 3, 0, 0), estado="RECHAZADA", sc=sc)
    f.sc(datetime(2001, 1, 2, 5, 0))   # sin cotización: no entra en el promedio
    k = _kpis(_analisis(app_client, admin_token, foco="sc"))
    assert k["dias_hasta_cotizar"]["valor"] == 1.0


def test_barras_por_asesor_deja_ocho_y_el_resto_en_otros(app_client, db, admin_token):
    f = _Fabrica(db)
    for i in range(10):
        for _ in range(10 - i):
            f.sc(datetime(2001, 1, 3, 10, 0), advisor_name=f"Asesor {i:02d}")
    barras = _analisis(app_client, admin_token, foco="sc")["barras"]
    assert barras["etiquetas"] == [f"Asesor {i:02d}" for i in range(8)] + ["Otros"]
    assert _serie(barras, "sin_cotizacion")["valores"] == [10, 9, 8, 7, 6, 5, 4, 3, 2 + 1]


# ─── 8) Foco Cotizaciones ─────────────────────────────────────────────────────────────────────────────────────────────

def test_foco_cot(app_client, db, admin_token):
    """Una CONFIRMADA, una con pedido vigente, una RECHAZADA y una VENCIDA: '% aprobadas' 50,0 y 'Rechazadas o vencidas'
    2. La modalidad es la de su SC; sin SC, 'Sin solicitud'."""
    f = _Fabrica(db)
    sc = f.sc(datetime(2000, 12, 20, 10, 0), modalidad_pago="Credito 30 dias")
    f.cot(datetime(2001, 1, 2, 10, 0), estado="CONFIRMADA", sc=sc, total=100_000)
    con_pedido = f.cot(datetime(2001, 1, 3, 10, 0), estado="ENVIADA", total=200_000)
    f.pven(datetime(2001, 1, 4, 10, 0), 200_000, cot=con_pedido)
    f.cot(datetime(2001, 1, 3, 11, 0), estado="RECHAZADA", total=300_000)
    f.cot(datetime(2001, 1, 3, 12, 0), estado="VENCIDA", total=400_000)
    f.cot(datetime(2000, 12, 26, 10, 0), estado="BORRADOR", total=50_000)

    data = _analisis(app_client, admin_token, foco="cot")
    k = _kpis(data)
    assert [x["clave"] for x in data["kpis"]] == KPIS_POR_FOCO["cot"]
    assert [x["etiqueta"] for x in data["kpis"]] == ["Cotizado", "Cotizaciones", "% aprobadas",
                                                     "Rechazadas o vencidas"]
    assert (k["cotizado"]["valor"], k["cotizado"]["anterior"], k["cotizado"]["formato"]) == (1_000_000, 50_000,
                                                                                             "pesos")
    assert (k["cotizaciones_nuevas"]["valor"], k["cotizaciones_nuevas"]["anterior"]) == (4, 1)
    assert (k["cot_aprobadas_pct"]["valor"], k["cot_aprobadas_pct"]["anterior"]) == (50.0, 0.0)
    assert (k["cot_rechazadas_o_vencidas"]["valor"], k["cot_rechazadas_o_vencidas"]["mejor"]) == (2, "baja")

    assert (data["linea"]["titulo"], data["linea"]["formato"]) == ("Valor cotizado", "pesos")
    assert _serie(data["linea"], "actual")["valores"][:3] == [0, 100_000, 900_000]
    assert _segmentos(_dona(data, "estado")) == {"Confirmada": 1, "Enviada al cliente": 1, "Rechazada": 1,
                                                 "Vencida": 1}
    assert _segmentos(_dona(data, "modalidad")) == {"Crédito 30 días": 1, "Sin solicitud": 3}
    assert _dona(data, "modalidad")["titulo"] == "Por modalidad de pago"
    barras = data["barras"]
    assert barras["titulo"] == "Cotizado vs. aprobado"
    assert _serie(barras, "cotizado")["valores"][:3] == [0, 100_000, 900_000]
    assert _serie(barras, "aprobado")["valores"][:3] == [0, 100_000, 200_000]
    assert data["movimientos"]["titulo"] == "Últimas cotizaciones"
    assert {m["doc_tipo"] for m in data["movimientos"]["filas"]} == {"COT"}
    assert data["ranking"]["titulo"] == "Clientes con más valor cotizado"
    assert [(r["valor"], r["cantidad"], r["pct"]) for r in data["ranking"]["filas"]] == [(1_000_000, 4, 100.0)]


# ─── 9) Foco Pedidos: lo recaudado (R6, RP31, RP60) ───────────────────────────────────────────────────────────────────

def test_foco_pven_recaudado(app_client, db, admin_token):
    """Recaudado = pagos CONFIRMADO de un tipo de ingreso cuyo método no es TRASLADO, SALDO_A_FAVOR ni
    CONVERSION_COTIZACION, por su `fecha` (días de Colombia). ANTICIPO de 300.000 sí; TRASLADO de 200.000, ANULADO,
    SALDO_A_FAVOR, CONVERSION_COTIZACION y DEVOLUCION no. El saldo por cobrar es una foto (Σ max(0, saldo))."""
    f = _Fabrica(db)
    producto = f"Mueble {f.sufijo}"
    lineas = [{"product_name": producto, "qty": 1}]
    pedido = f.pven(datetime(2001, 1, 3, 10, 0), 1_000_000, saldo_cop=400_000, productos=lineas)
    f.pago(pedido, 300_000, date(2001, 1, 3))
    f.pago(pedido, 200_000, date(2001, 1, 4), metodo="TRASLADO")
    f.pago(pedido, 100_000, date(2001, 1, 5), tipo="ABONO", estado="ANULADO")
    f.pago(pedido, 50_000, date(2001, 1, 5), tipo="ABONO", metodo="SALDO_A_FAVOR")
    f.pago(pedido, 70_000, date(2001, 1, 5), metodo="CONVERSION_COTIZACION")
    f.pago(pedido, 10_000, date(2001, 1, 6), tipo="DEVOLUCION")
    viejo = f.pven(datetime(2000, 12, 23, 10, 0), 90_000, estado="ENTREGADO", saldo_cop=-5_000, productos=lineas)
    f.pago(viejo, 40_000, date(2000, 12, 30), tipo="ABONO", metodo=None)

    data = _analisis(app_client, admin_token, foco="pven", producto=producto)
    k = _kpis(data)
    assert [x["clave"] for x in data["kpis"]] == KPIS_POR_FOCO["pven"]
    assert [x["etiqueta"] for x in data["kpis"]] == ["Vendido", "Pedidos", "Recaudado", "Saldo por cobrar"]
    assert (k["recaudado"]["valor"], k["recaudado"]["anterior"], k["recaudado"]["formato"]) == (300_000, 40_000,
                                                                                                 "pesos")
    saldo = k["pven_saldo_por_cobrar"]
    assert (saldo["valor"], saldo["anterior"], saldo["variacion_pct"], saldo["es_foto"], saldo["mejor"]) == (
        400_000, None, None, True, "baja")
    assert (k["vendido_periodo"]["valor"], k["vendido_periodo"]["anterior"]) == (1_000_000, 90_000)

    barras = data["barras"]
    assert barras["titulo"] == "Vendido vs. recaudado"
    assert _serie(barras, "recaudado")["valores"][2] == 300_000 and sum(_serie(barras, "recaudado")["valores"]) == 300_000
    assert _serie(barras, "recaudado")["tono"] == "positivo"

    filas = data["movimientos"]["filas"]
    assert data["movimientos"]["titulo"] == "Últimos pagos y pedidos"
    pagos = [m for m in filas if m["tipo"] == "PAGO"]
    assert [(m["titulo"], m["monto"], m["signo"], m["doc_tipo"], m["doc_id"], m["numero"]) for m in pagos] == [
        (TIPOS_PAGO["ANTICIPO"], 300_000, "+", "PVEN", pedido.id, pedido.numero)]
    assert pagos[0]["fecha"] == "2001-01-03T16:00:00Z"   # RP60: iso_z(created_at) del pago
    pedidos = [m for m in filas if m["tipo"] == "PVEN"]
    assert [(m["numero"], m["estado_etiqueta"], m["signo"]) for m in pedidos] == [
        (pedido.numero, "Pendiente de compra", None)]
    assert _segmentos(_dona(data, "canal")) == {"Asesor": 1_000_000}


def test_pagos_se_llaman_como_en_la_actividad(app_client, db, admin_token):
    """RP31: el título de cada pago es textos_actividad.TIPOS_PAGO[tipo], en el Hub y en Pedidos."""
    f = _Fabrica(db)
    pedido = f.pven(datetime(2001, 1, 2, 10, 0), 1_000_000)
    for i, tipo in enumerate(TIPOS_PAGO_INGRESO):
        f.pago(pedido, 1_000 * (i + 1), date(2001, 1, 3 + i), tipo=tipo)
    for foco in ("hub", "pven"):
        filas = _analisis(app_client, admin_token, foco=foco)["movimientos"]["filas"]
        titulos = {m["titulo"] for m in filas if m["tipo"] == "PAGO"}
        assert titulos == {TIPOS_PAGO[t] for t in TIPOS_PAGO_INGRESO} == {"Anticipo", "Abono", "Pago total",
                                                                          "Pago del saldo"}, foco
        assert len(filas) == 5 and filas[-1]["tipo"] == "PVEN", foco   # los más recientes primero


def test_movimientos_son_los_ocho_mas_recientes(app_client, db, admin_token):
    f = _Fabrica(db)
    pedidos = [f.pven(datetime(2001, 1, 2, h, 0), 100_000) for h in range(10)]
    f.pago(pedidos[0], 5_000, date(2001, 1, 2), creado=datetime(2001, 1, 2, 9, 30))
    filas = _analisis(app_client, admin_token, foco="hub")["movimientos"]["filas"]
    assert len(filas) == 8
    assert [m["fecha"] for m in filas] == sorted((m["fecha"] for m in filas), reverse=True)
    # El pago se registró a las 9:30, después del último pedido (9:00): va primero; luego los pedidos del 9 al 3.
    assert filas[0]["tipo"] == "PAGO" and filas[0]["numero"] == pedidos[0].numero
    assert [m["numero"] for m in filas[1:]] == [p.numero for p in reversed(pedidos[3:])]


# ─── 10) Producto (RP69) ──────────────────────────────────────────────────────────────────────────────────────────────

def test_producto_filtra(app_client, db, admin_token):
    f = _Fabrica(db)
    cuna = [{"product_name": "Cuna Montessori", "qty": 1}]
    silla = [{"product_name": "Silla Comedor", "qty": 1}]
    f.pven(datetime(2001, 1, 2, 10, 0), 800_000, productos=cuna)
    f.pven(datetime(2001, 1, 3, 10, 0), 300_000, productos=silla)
    f.cot(datetime(2001, 1, 2, 9, 0), total=800_000, productos=cuna)
    f.cot(datetime(2001, 1, 2, 9, 30), total=300_000, productos=silla)
    for producto in ("Cuna", " cuna "):
        data = _analisis(app_client, admin_token, foco="hub", producto=producto)
        k = _kpis(data)
        assert (k["vendido_periodo"]["valor"], k["pedidos_nuevos"]["valor"]) == (800_000, 1), producto
        assert _serie(data["barras"], "cotizado")["valores"][1] == 800_000, producto
        assert data["filtros"]["producto"] == producto.strip()
    assert _kpis(_analisis(app_client, admin_token, foco="cot", producto="Cuna"))["cotizaciones_nuevas"]["valor"] == 1
    assert _kpis(_analisis(app_client, admin_token, foco="hub"))["vendido_periodo"]["valor"] == 1_100_000
    for producto in ("a", " a ", "x" * 61):
        assert _error(app_client, admin_token, {**VENTANA, "producto": producto}) == ERROR_PRODUCTO, producto
    assert _analisis(app_client, admin_token, producto="  ")["filtros"]["producto"] is None


# ─── 11) Consultas constantes (contador_sql, R13) ─────────────────────────────────────────────────────────────────────

def test_consultas_constantes(app_client, db, admin_token, contador_sql, sku):
    """Con 3 y con 25 pedidos (cada uno con su SC, su COT, una línea y un pago) cada foco hace las mismas consultas, 14
    o menos por llamada (la de la sesión incluida)."""
    f = _Fabrica(db)

    def crear(n):
        for i in range(n):
            dia = datetime(2001, 1, 1 + i % 10, 10, 0)
            sc = f.sc(dia, advisor_name=f"Asesor {i % 12}", cliente=f.cliente(f"C{i}"))
            cot = f.cot(dia, sc=sc, estado="CONFIRMADA", total=100_000 + i, cliente=f.cliente(f"C{i}"))
            pedido = f.pven(dia, 100_000 + i, cot=cot, cliente=f.cliente(f"C{i}"))
            f.linea(pedido, 1, 100_000 + i, sku=sku if i % 2 else None)
            f.pago(pedido, 1_000, dia.date())

    def medir():
        cuentas = {}
        for foco in FOCOS:
            for extra in ({}, {"producto": "Cuna"}):
                with contador_sql.ventana() as v:
                    _analisis(app_client, admin_token, foco=foco, top="25", **extra)
                cuentas[(foco, bool(extra))] = v.consultas
        return cuentas

    crear(3)
    con_3 = medir()
    crear(22)
    con_25 = medir()
    assert con_3 == con_25, (con_3, con_25)
    assert max(con_25.values()) <= 14, con_25


# ─── 12) Errores 422 (R21) ────────────────────────────────────────────────────────────────────────────────────────────

def test_errores_422(app_client, admin_token):
    casos = [
        ({"periodo": "xx"}, "Período no válido."),
        ({"periodo": "personalizado"}, "Elige la fecha inicial y la final."),
        ({**VENTANA, "desde": "01/01/2001"}, "Las fechas deben tener el formato AAAA-MM-DD."),
        ({**VENTANA, "desde": "2001-01-11"}, "La fecha inicial debe ser anterior o igual a la final."),
        ({**VENTANA, "hasta": "2999-01-01"}, "La fecha final no puede ser posterior a hoy."),
        ({**VENTANA, "foco": "otro"}, "El foco «otro» no existe: usa hub, sc, cot o pven."),
        ({**VENTANA, "foco": "HUB"}, "El foco «HUB» no existe: usa hub, sc, cot o pven."),
        ({**VENTANA, "producto": "cu\x00na"}, "La búsqueda no puede llevar caracteres de control."),
    ]
    for params, texto in casos:
        assert _error(app_client, admin_token, params) == texto, params
    # Los demás períodos responden 200 sin fechas.
    for periodo in ("7d", "30d", "90d", "mes", "12m"):
        resp = app_client.get(RUTA, params={"periodo": periodo}, headers=_auth(admin_token))
        assert resp.status_code == 200, (periodo, resp.text)
        assert resp.json()["data"]["periodo"]["clave"] == periodo


# ─── 13) Permisos ─────────────────────────────────────────────────────────────────────────────────────────────────────

def test_permisos(app_client, vendedor_token, bodega_token):
    for token in (vendedor_token, bodega_token):
        assert app_client.get(RUTA, params=VENTANA, headers=_auth(token)).status_code == 200
    assert app_client.get(RUTA, params=VENTANA).status_code == 401


# ─── 14) /ventas/analytics retirado (RP6) ─────────────────────────────────────────────────────────────────────────────

def test_analytics_retirado(app_client, admin_token):
    assert app_client.get("/api/v1/ventas/analytics", headers=_auth(admin_token)).status_code == 404


# ─── 15) El contrato con sus claves exactas (CLAVES_ANALISIS, RP71) ───────────────────────────────────────────────────

def test_claves_exactas(app_client, db, admin_token, sku):
    f = _Fabrica(db)
    sc = f.sc(datetime(2001, 1, 2, 10, 0), advisor_name="Ana")
    cot = f.cot(datetime(2001, 1, 3, 10, 0), sc=sc, estado="CONFIRMADA", total=100_000)
    pedido = f.pven(datetime(2001, 1, 4, 10, 0), 100_000, cot=cot)
    f.linea(pedido, 1, 100_000, sku=sku)
    f.pago(pedido, 60_000, date(2001, 1, 4))
    for foco in FOCOS:
        data = _analisis(app_client, admin_token, foco=foco)
        assert set(data) == CLAVES_ANALISIS, foco
        assert [k["clave"] for k in data["kpis"]] == KPIS_POR_FOCO[foco], foco
        for k in data["kpis"]:
            assert set(k) == CLAVES_KPI, (foco, k)
        assert set(data["linea"]) == CLAVES_LINEA and all(set(s) == CLAVES_SERIE for s in data["linea"]["series"])
        assert len(data["donas"]) == 2, foco
        for dona in data["donas"]:
            assert set(dona) == CLAVES_DONA and dona["segmentos"], (foco, dona)
            assert all(set(s) == CLAVES_SEGMENTO for s in dona["segmentos"]), foco
        assert set(data["barras"]) == CLAVES_BARRAS
        assert all(set(s) == CLAVES_SERIE_BARRAS for s in data["barras"]["series"]), foco
        assert set(data["movimientos"]) == CLAVES_MOVIMIENTOS and data["movimientos"]["filas"], foco
        assert all(set(m) == CLAVES_MOVIMIENTO for m in data["movimientos"]["filas"]), foco
        assert set(data["ranking"]) == CLAVES_RANKING and data["ranking"]["filas"], foco
        assert all(set(r) == CLAVES_FILA_RANKING for r in data["ranking"]["filas"]), foco
        assert data["filtros"] == {"foco": foco, "top": 5, "producto": None, "bodega": None}
        assert data["generado_en"].endswith("Z")


# ─── Las funciones que reutiliza Finanzas (RP60) ──────────────────────────────────────────────────────────────────────

def test_ventas_por_cubeta_y_pagos_recibidos(db):
    """ventas_por_cubeta(db, periodo, *, anterior=False, producto=None) -> dict[date, int] (la entrada de rellenar) y
    pagos_recibidos_q(db, desde, hasta) con días de Colombia contra SaleOrderPayment.fecha (los dos extremos
    incluidos)."""
    from app.core.analisis_ventas import pagos_recibidos_q, ventas_por_cubeta
    from app.core.periodos import resolver_periodo
    f = _Fabrica(db)
    a = f.pven(datetime(2001, 1, 2, 15, 0), 1_000_000, productos=[{"product_name": "Cuna Montessori"}])
    f.pven(datetime(2001, 1, 2, 18, 0), 250_000)
    f.pven(datetime(2001, 1, 3, 15, 0), 9_000_000, estado="CANCELADO")
    f.pven(datetime(2000, 12, 25, 15, 0), 750_000)
    periodo = resolver_periodo("personalizado", "2001-01-01", "2001-01-10")

    assert ventas_por_cubeta(db, periodo) == {date(2001, 1, 2): 1_250_000}
    assert ventas_por_cubeta(db, periodo, anterior=True) == {date(2000, 12, 25): 750_000}
    assert ventas_por_cubeta(db, periodo, producto="Cuna") == {date(2001, 1, 2): 1_000_000}
    assert all(isinstance(v, int) for v in ventas_por_cubeta(db, periodo).values())

    f.pago(a, 100_000, date(2001, 1, 1))
    f.pago(a, 200_000, date(2001, 1, 10))
    f.pago(a, 400_000, date(2001, 1, 11))
    f.pago(a, 800_000, date(2000, 12, 31))
    pagos = pagos_recibidos_q(db, periodo.desde, periodo.hasta)
    assert sorted(int(p.monto) for p in pagos.all()) == [100_000, 200_000]
