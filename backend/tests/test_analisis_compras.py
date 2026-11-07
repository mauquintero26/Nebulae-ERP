"""B4 T12 (ANALISIS-compras puntos 1 y 2; R7, R13, R21; C12; RP1, RP9, RP29, RP43, D34, D44): core/analisis_compras.py y
GET /api/v1/compras/analisis con el contrato único de core/analisis.py.

- Fecha del pedido de compra: COALESCE(fecha_compra, created_at). Dinero: sin BORRADOR ni CANCELADO (filtro_comprado).
- % entregas a tiempo: recepciones confirmadas (COMPLETADA o COMPLETADA_LOGISTICA) del período cuyo PEC tiene fecha de
  entrega estimada; a tiempo si el día de la recepción es ≤ el prometido + 1 (la tolerancia de _gr_dict, por .date()).
- Días promedio de entrega: día de la recepción − día del PEC, con 1 decimal (mejor: baja).
La prueba 9 del diseño (la etiqueta de EN_TRANSITO) está en test_textos_actividad.py y test_estados_compras.py (T1C).

Se corre SOLO con el runner de ROLLBACK (python tests/rollback_runner.py test_analisis_compras), con la ventana
personalizada 2001-01-01..10, donde erp_test no tiene pedidos de compra ni recepciones: los números son absolutos.
"""
import uuid
from datetime import datetime

from app.core.analisis import (CLAVES_ANALISIS, CLAVES_BARRAS, CLAVES_DONA, CLAVES_FILA_RANKING, CLAVES_KPI,
                               CLAVES_LINEA, CLAVES_MOVIMIENTO, CLAVES_MOVIMIENTOS, CLAVES_RANKING, CLAVES_SEGMENTO,
                               CLAVES_SERIE, CLAVES_SERIE_BARRAS)
from app.models.erp_documents import GoodsReceipt, PurchaseOrderFull
from tests.usuarios_de_prueba import bodega_token, compras_token  # noqa: F401 (fixtures por nombre, RP79)

RUTA = "/api/v1/compras/analisis"
VENTANA = {"periodo": "personalizado", "desde": "2001-01-01", "hasta": "2001-01-10"}
KPIS = ["comprado_periodo", "pec_nuevos", "entregas_a_tiempo_pct", "dias_promedio_entrega"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _analisis(app_client, token, **params):
    resp = app_client.get(RUTA, params={**VENTANA, **params}, headers=_auth(token))
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


def _kpis(data):
    return {k["clave"]: k for k in data["kpis"]}


def _serie(bloque, clave):
    return next(s for s in bloque["series"] if s["clave"] == clave)


def _en(fechas, valores, dia):
    return valores[fechas.index(dia)]


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

    def pec(self, compra, total=1_000_000, estado="EMITIDO", entrega=None, proveedor=None, supplier_id=None):
        return self._guardar(PurchaseOrderFull(
            numero=self._numero("PEC-A"), estado=estado, total_cop=total, fecha_compra=compra,
            created_at=compra, updated_at=compra, fecha_entrega_estimada=entrega,
            supplier_name=proveedor if proveedor is not None else f"Prov {self.sufijo}", supplier_id=supplier_id))

    def recepcion(self, fecha, pec=None, estado="COMPLETADA"):
        return self._guardar(GoodsReceipt(
            numero=self._numero("ENINV-A"), estado=estado, fecha_recepcion=fecha, pec_id=pec.id if pec else None,
            pec_numero=pec.numero if pec else None, supplier_name=pec.supplier_name if pec else "Sin PEC",
            created_at=fecha, updated_at=fecha))


# ─── 1) Comprado: sin borrador ni cancelado; la dona por estado los trae ─────────────────────────────────────────────

def test_comprado_sin_borrador_ni_cancelado(app_client, db, admin_token):
    f = _Fabrica(db)
    f.pec(datetime(2001, 1, 3, 10, 0), 2_000_000, "EMITIDO")
    f.pec(datetime(2001, 1, 3, 11, 0), 9_000_000, "BORRADOR")
    f.pec(datetime(2001, 1, 3, 12, 0), 5_000_000, "CANCELADO")
    data = _analisis(app_client, admin_token)
    kpis = _kpis(data)
    assert (kpis["comprado_periodo"]["valor"], kpis["comprado_periodo"]["formato"],
            kpis["comprado_periodo"]["mejor"]) == (2_000_000, "pesos", "neutro")
    assert (kpis["pec_nuevos"]["valor"], kpis["pec_nuevos"]["formato"]) == (1, "entero")
    dona = next(d for d in data["donas"] if d["clave"] == "estado")
    assert {(s["clave"], s["etiqueta"], s["valor"]) for s in dona["segmentos"]} == {
        ("EMITIDO", "Emitido", 1), ("BORRADOR", "Borrador", 1), ("CANCELADO", "Cancelado", 1)}
    assert dona["total"] == 3 and dona["formato"] == "entero"
    linea = data["linea"]
    assert linea["fechas"][0] == "2001-01-01" and len(linea["fechas"]) == 10
    assert _en(linea["fechas"], _serie(linea, "actual")["valores"], "2001-01-03") == 2_000_000
    assert linea["total"] == 2_000_000


def test_sin_fecha_de_compra_cuenta_su_created_at(app_client, db, admin_token):
    f = _Fabrica(db)
    pec = f.pec(None, 300_000, "EN_TRANSITO")
    # El ORM no manda un None en el INSERT (corre el valor por defecto): la fecha de compra se vacía con un UPDATE.
    pec.fecha_compra = None
    pec.created_at = datetime(2001, 1, 5, 9, 0)
    db.commit()
    db.refresh(pec)
    assert pec.fecha_compra is None
    data = _analisis(app_client, admin_token)
    assert _kpis(data)["comprado_periodo"]["valor"] == 300_000
    assert _en(data["linea"]["fechas"], _serie(data["linea"], "actual")["valores"], "2001-01-05") == 300_000


def test_anterior_y_variacion(app_client, db, admin_token):
    """El anterior de 2001-01-01..10 es 2000-12-22..31 (el mismo largo, justo antes)."""
    f = _Fabrica(db)
    f.pec(datetime(2001, 1, 2, 10, 0), 1_500_000)
    f.pec(datetime(2000, 12, 25, 10, 0), 1_000_000)
    f.pec(datetime(2000, 12, 21, 10, 0), 7_000_000)     # fuera de las dos ventanas
    kpis = _kpis(_analisis(app_client, admin_token))
    assert (kpis["comprado_periodo"]["valor"], kpis["comprado_periodo"]["anterior"],
            kpis["comprado_periodo"]["variacion_pct"]) == (1_500_000, 1_000_000, 50.0)
    assert (kpis["pec_nuevos"]["valor"], kpis["pec_nuevos"]["anterior"]) == (1, 1)


# ─── 2) y 3) % a tiempo con la tolerancia de _gr_dict y sin fecha prometida ──────────────────────────────────────────

def test_a_tiempo_con_tolerancia(app_client, db, admin_token):
    f = _Fabrica(db)
    pec = f.pec(datetime(2001, 1, 1, 9, 0), entrega=datetime(2001, 1, 5, 15, 0))
    f.recepcion(datetime(2001, 1, 6, 10, 0), pec, "COMPLETADA")             # el día prometido + 1: a tiempo
    f.recepcion(datetime(2001, 1, 8, 10, 0), pec, "COMPLETADA_LOGISTICA")   # tarde
    f.recepcion(datetime(2001, 1, 9, 10, 0), pec, "BORRADOR")               # por confirmar: no cuenta
    f.recepcion(datetime(2001, 1, 9, 10, 0), pec, "CANCELADA")              # cancelada: no cuenta
    data = _analisis(app_client, admin_token)
    k = _kpis(data)["entregas_a_tiempo_pct"]
    assert (k["valor"], k["formato"], k["mejor"]) == (50.0, "porcentaje", "sube")
    barras = data["barras"]
    assert barras["apiladas"] is True and barras["eje"] == "fechas"
    assert [(s["clave"], s["etiqueta"], s["tono"]) for s in barras["series"]] == [
        ("a_tiempo", "A tiempo", "positivo"), ("con_retraso", "Con retraso", "neutro"),
        ("sin_fecha", "Sin fecha prometida", "neutro")]
    a_tiempo, tarde, sin_fecha = (s["valores"] for s in barras["series"])
    assert _en(barras["etiquetas"], a_tiempo, "2001-01-06") == 1 and sum(a_tiempo) == 1
    assert _en(barras["etiquetas"], tarde, "2001-01-08") == 1 and sum(tarde) == 1
    assert sum(sin_fecha) == 0
    assert data["avisos"] == []


def test_sin_fecha_prometida(app_client, db, admin_token):
    """La recepción sin fecha prometida no entra en el %, pero sí en el aviso y en la barra 'sin fecha prometida'. Una
    recepción sin pedido de compra tampoco tiene fecha prometida."""
    f = _Fabrica(db)
    pec = f.pec(datetime(2001, 1, 1, 9, 0), entrega=None)
    f.recepcion(datetime(2001, 1, 4, 10, 0), pec)
    data = _analisis(app_client, admin_token)
    assert _kpis(data)["entregas_a_tiempo_pct"]["valor"] is None
    assert data["avisos"] == ["1 recepción no cuenta para «a tiempo» porque su pedido de compra no tiene fecha de "
                              "entrega estimada."]
    sin_fecha = _serie(data["barras"], "sin_fecha")["valores"]
    assert _en(data["barras"]["etiquetas"], sin_fecha, "2001-01-04") == 1
    f.recepcion(datetime(2001, 1, 5, 10, 0), None)
    data = _analisis(app_client, admin_token)
    assert data["avisos"] == ["2 recepciones no cuentan para «a tiempo» porque su pedido de compra no tiene fecha de "
                              "entrega estimada."]


# ─── 4) Días promedio de entrega ──────────────────────────────────────────────────────────────────────────────────────

def test_dias_promedio(app_client, db, admin_token):
    f = _Fabrica(db)
    pec = f.pec(datetime(2001, 1, 1, 22, 0), entrega=datetime(2001, 1, 3))
    f.recepcion(datetime(2001, 1, 4, 1, 0), pec)
    f.recepcion(datetime(2001, 1, 6, 23, 0), pec)
    f.recepcion(datetime(2001, 1, 5, 10, 0), None)   # r1 (m9): una recepción sin PEC no entra en el promedio
    k = _kpis(_analisis(app_client, admin_token))["dias_promedio_entrega"]
    assert (k["valor"], k["formato"], k["mejor"]) == (4.0, "dias", "baja")
    sin_recepciones = _kpis(_analisis(app_client, admin_token, desde="2001-01-07"))["dias_promedio_entrega"]
    assert sin_recepciones["valor"] is None


# ─── 5) Ranking de proveedores ───────────────────────────────────────────────────────────────────────────────────────

def test_ranking_proveedores(app_client, db, admin_token):
    """Con top=5 y seis proveedores salen los cinco de más dinero, en orden, con 'N pedidos · X % a tiempo' (o solo
    'N pedidos' si no tiene recepciones con fecha prometida). Un BORRADOR no suma. top=2 no existe (D-8 de T6C)."""
    f = _Fabrica(db)
    s = f.sufijo
    dia = datetime(2001, 1, 2, 10, 0)
    a1 = f.pec(dia, 400_000, proveedor=f"A {s}", entrega=datetime(2001, 1, 3))
    a2 = f.pec(dia, 200_000, proveedor=f"A {s}", entrega=datetime(2001, 1, 3))
    f.recepcion(datetime(2001, 1, 3, 10, 0), a1)     # a tiempo
    f.recepcion(datetime(2001, 1, 9, 10, 0), a2)     # tarde
    f.recepcion(datetime(2001, 1, 4, 10, 0), a2)     # a tiempo (el prometido + 1)
    b = f.pec(dia, 500_000, proveedor=f"B {s}", entrega=datetime(2001, 1, 2))
    f.recepcion(datetime(2001, 1, 2, 10, 0), b)
    f.pec(dia, 450_000, proveedor=f"C {s}")
    f.pec(dia, 99_000_000, proveedor=f"C {s}", estado="BORRADOR")
    d = f.pec(dia, 300_000, proveedor=f"D {s}", entrega=datetime(2001, 1, 2))
    f.recepcion(datetime(2001, 1, 9, 10, 0), d)      # r1 (m14): todas tarde, 0 % a tiempo
    f.pec(dia, 100_000, proveedor="")
    f.pec(dia, 50_000, proveedor=f"F {s}")
    data = _analisis(app_client, admin_token, top="5")
    ranking = data["ranking"]
    assert (ranking["titulo"], ranking["columna"], ranking["formato"]) == ("Proveedores principales", "Comprado",
                                                                          "pesos")
    total = 400_000 + 200_000 + 500_000 + 450_000 + 300_000 + 100_000 + 50_000
    assert [(r["posicion"], r["nombre"], r["valor"], r["cantidad"], r["detalle"], r["pct"])
            for r in ranking["filas"]] == [
        (1, f"A {s}", 600_000, 2, "2 pedidos · 66,7 % a tiempo", round(600_000 / total * 100, 1)),
        (2, f"B {s}", 500_000, 1, "1 pedido · 100 % a tiempo", round(500_000 / total * 100, 1)),
        (3, f"C {s}", 450_000, 1, "1 pedido", round(450_000 / total * 100, 1)),
        (4, f"D {s}", 300_000, 1, "1 pedido · 0 % a tiempo", round(300_000 / total * 100, 1)),
        (5, "Sin proveedor", 100_000, 1, "1 pedido", round(100_000 / total * 100, 1)),
    ]
    dona = next(d for d in data["donas"] if d["clave"] == "proveedor")
    assert dona["formato"] == "pesos" and dona["total"] == total
    assert ("Sin proveedor", 100_000) in {(x["etiqueta"], x["valor"]) for x in dona["segmentos"]}
    assert data["filtros"] == {"foco": None, "top": 5, "producto": None, "bodega": None}


def test_movimientos(app_client, db, admin_token):
    """Las últimas compras (doc_tipo 'PEC', sin borradores ni cancelados) y recepciones confirmadas (doc_tipo 'ENINV',
    con «llegó N días tarde» con la tolerancia de _gr_dict), las 8 más recientes."""
    f = _Fabrica(db)
    pec = f.pec(datetime(2001, 1, 1, 9, 0), 700_000, entrega=datetime(2001, 1, 2))
    f.pec(datetime(2001, 1, 9, 9, 0), 1, estado="BORRADOR")
    tarde = f.recepcion(datetime(2001, 1, 6, 10, 0), pec)            # 6 − (2 + 1) = 3 días tarde
    uno = f.recepcion(datetime(2001, 1, 4, 10, 0), pec)              # 1 día tarde
    a_tiempo = f.recepcion(datetime(2001, 1, 3, 10, 0), pec)
    f.recepcion(datetime(2001, 1, 8, 10, 0), pec, "BORRADOR")
    filas = _analisis(app_client, admin_token)["movimientos"]["filas"]
    assert [(m["tipo"], m["numero"], m["detalle"], m["monto"], m["doc_tipo"], m["doc_id"], m["estado_etiqueta"])
            for m in filas] == [
        ("ENINV", tarde.numero, f"{pec.supplier_name} · llegó 3 días tarde", None, "ENINV", tarde.id, "Recibida"),
        ("ENINV", uno.numero, f"{pec.supplier_name} · llegó 1 día tarde", None, "ENINV", uno.id, "Recibida"),
        ("ENINV", a_tiempo.numero, pec.supplier_name, None, "ENINV", a_tiempo.id, "Recibida"),
        ("PEC", pec.numero, pec.supplier_name, 700_000, "PEC", pec.id, "Emitido"),
    ]
    assert filas[0]["fecha"] == "2001-01-06T10:00:00Z" and filas[-1]["formato"] == "pesos"
    for i in range(10):
        f.pec(datetime(2001, 1, 10, 9, i), 10)
    assert len(_analisis(app_client, admin_token)["movimientos"]["filas"]) == 8


# ─── 6) Consultas constantes ─────────────────────────────────────────────────────────────────────────────────────────

def test_consultas_constantes(app_client, db, admin_token, contador_sql):
    f = _Fabrica(db)

    def crear(n):
        for i in range(n):
            pec = f.pec(datetime(2001, 1, 1 + i % 10, 10, 0), 100_000 + i, proveedor=f"P{i % 7} {f.sufijo}",
                        entrega=datetime(2001, 1, 1 + i % 10) if i % 3 else None)
            f.recepcion(datetime(2001, 1, 1 + (i + 2) % 10, 10, 0), pec)

    def medir():
        with contador_sql.ventana() as v:
            _analisis(app_client, admin_token, top="25")
        assert v.commits == 0
        return v.consultas

    crear(3)
    con_3 = medir()
    crear(22)
    con_25 = medir()
    assert con_3 == con_25 and con_25 <= 14, (con_3, con_25)


# ─── 7) Permisos, 8) claves exactas y errores ────────────────────────────────────────────────────────────────────────

def test_permisos(app_client, compras_token, vendedor_token, bodega_token):
    for token in (compras_token, vendedor_token, bodega_token):
        _analisis(app_client, token)
    assert app_client.get(RUTA, params=VENTANA).status_code == 401


def test_claves_exactas(app_client, db, admin_token):
    f = _Fabrica(db)
    pec = f.pec(datetime(2001, 1, 2, 10, 0), 100_000, entrega=datetime(2001, 1, 3))
    f.recepcion(datetime(2001, 1, 4, 10, 0), pec)
    data = _analisis(app_client, admin_token)
    assert set(data) == CLAVES_ANALISIS
    assert [k["clave"] for k in data["kpis"]] == KPIS
    assert all(set(k) == CLAVES_KPI for k in data["kpis"])
    assert set(data["linea"]) == CLAVES_LINEA and all(set(s) == CLAVES_SERIE for s in data["linea"]["series"])
    assert [d["clave"] for d in data["donas"]] == ["proveedor", "estado"]
    for dona in data["donas"]:
        assert set(dona) == CLAVES_DONA and dona["segmentos"]
        assert all(set(s) == CLAVES_SEGMENTO for s in dona["segmentos"])
    assert set(data["barras"]) == CLAVES_BARRAS
    assert all(set(s) == CLAVES_SERIE_BARRAS for s in data["barras"]["series"])
    assert set(data["movimientos"]) == CLAVES_MOVIMIENTOS and data["movimientos"]["filas"]
    assert all(set(m) == CLAVES_MOVIMIENTO for m in data["movimientos"]["filas"])
    assert set(data["ranking"]) == CLAVES_RANKING and data["ranking"]["filas"]
    assert all(set(r) == CLAVES_FILA_RANKING for r in data["ranking"]["filas"])
    assert data["periodo"]["desde"] == "2001-01-01" and data["periodo"]["hasta"] == "2001-01-10"
    assert data["generado_en"].endswith("Z")


def test_sin_datos_no_inventa_cifras(app_client, admin_token):
    data = _analisis(app_client, admin_token, desde="2001-01-01", hasta="2001-01-01")
    kpis = _kpis(data)
    assert (kpis["comprado_periodo"]["valor"], kpis["pec_nuevos"]["valor"]) == (0, 0)
    assert kpis["entregas_a_tiempo_pct"]["valor"] is None and kpis["dias_promedio_entrega"]["valor"] is None
    assert data["donas"][0]["segmentos"] == [] and data["ranking"]["filas"] == [] and data["avisos"] == []


def test_errores_422(app_client, admin_token):
    casos = [
        ({"periodo": "xx"}, "Período no válido."),
        ({"periodo": "x\x00"}, "Período no válido."),
        ({"periodo": "personalizado"}, "Elige la fecha inicial y la final."),
        ({**VENTANA, "desde": "01/01/2001"}, "Las fechas deben tener el formato AAAA-MM-DD."),
        ({**VENTANA, "desde": "2001-02-30"}, "Las fechas deben tener el formato AAAA-MM-DD."),
        ({**VENTANA, "desde": "2001-01-11"}, "La fecha inicial debe ser anterior o igual a la final."),
        ({**VENTANA, "hasta": "2999-01-01"}, "La fecha final no puede ser posterior a hoy."),
        ({**VENTANA, "desde": "1998-01-01"}, "El período no puede ser mayor a 2 años."),
        ({**VENTANA, "top": "2"}, "El ranking solo puede mostrar 5, 10 o 25."),
        ({**VENTANA, "top": "abc"}, "El ranking solo puede mostrar 5, 10 o 25."),
        ({**VENTANA, "top": "5\x00"}, "El ranking solo puede mostrar 5, 10 o 25."),
    ]
    for params, texto in casos:
        resp = app_client.get(RUTA, params=params, headers=_auth(admin_token))
        assert resp.status_code == 422, (params, resp.text)
        assert resp.json()["detail"] == texto, params
    for top in ("", " ", "10", "25"):
        assert _analisis(app_client, admin_token, top=top)["filtros"]["top"] == int(top.strip() or 5)
    for periodo in ("7d", "30d", "90d", "mes", "12m"):
        resp = app_client.get(RUTA, params={"periodo": periodo}, headers=_auth(admin_token))
        assert resp.status_code == 200, (periodo, resp.text)


def test_la_funcion_valida_el_top(db):
    import pytest
    from app.core.analisis_compras import analisis_compras
    from app.core.periodos import resolver_periodo
    with pytest.raises(ValueError, match="El ranking solo puede mostrar 5, 10 o 25."):
        analisis_compras(db, resolver_periodo("30d"), 7)


# ─── r1 (m9, m14): días nunca negativos y el proveedor por su ficha ───────────────────────────────────────────────

def test_dias_promedio_nunca_es_negativo(app_client, db, admin_token):
    """Una recepción anterior a su pedido de compra (un dato mal cargado) cuenta 0 días, no un número negativo."""
    f = _Fabrica(db)
    pec = f.pec(datetime(2001, 1, 6, 10, 0), entrega=datetime(2001, 1, 8))
    f.recepcion(datetime(2001, 1, 3, 10, 0), pec)
    assert _kpis(_analisis(app_client, admin_token))["dias_promedio_entrega"]["valor"] == 0.0


def test_ranking_y_dona_agrupan_por_la_ficha_del_proveedor(app_client, db, admin_token, supplier):
    """Dos pedidos de compra del mismo proveedor (supplier_id) con el nombre escrito distinto son UN proveedor en el
    ranking y en la dona; sin ficha, se agrupa por el nombre escrito."""
    f = _Fabrica(db)
    dia = datetime(2001, 1, 2, 10, 0)
    f.pec(dia, 400_000, proveedor=f"Nombre viejo {f.sufijo}", supplier_id=supplier.id)
    f.pec(dia, 100_000, proveedor=f"Nombre nuevo {f.sufijo}", supplier_id=supplier.id)
    f.pec(dia, 50_000, proveedor=f"Sin ficha {f.sufijo}")
    data = _analisis(app_client, admin_token)
    filas = [(r["valor"], r["cantidad"]) for r in data["ranking"]["filas"]]
    assert filas == [(500_000, 2), (50_000, 1)]
    dona = next(d for d in data["donas"] if d["clave"] == "proveedor")
    assert sorted(s["valor"] for s in dona["segmentos"]) == [50_000, 500_000]


def test_dias_promedio_ignora_un_pedido_sin_fecha_de_compra(app_client, db, admin_token):
    """r2 (m1, m8): un PEC con fecha_compra y created_at en NULL no tiene desde cuándo contar: GREATEST ignora el NULL
    y lo contaba como 0 días, bajando el promedio. Su recepción confirmada en la ventana no entra en el promedio."""
    f = _Fabrica(db)
    pec = f.pec(datetime(2001, 1, 1, 22, 0), entrega=datetime(2001, 1, 3))
    f.recepcion(datetime(2001, 1, 4, 1, 0), pec)
    antes = _kpis(_analisis(app_client, admin_token))["dias_promedio_entrega"]["valor"]
    assert antes is not None and antes > 0
    sin_fecha = f.pec(datetime(2001, 1, 1, 22, 0), entrega=datetime(2001, 1, 3))
    db.query(PurchaseOrderFull).filter(PurchaseOrderFull.id == sin_fecha.id).update(
        {"fecha_compra": None, "created_at": None})
    db.commit()
    f.recepcion(datetime(2001, 1, 4, 1, 0), sin_fecha)
    assert _kpis(_analisis(app_client, admin_token))["dias_promedio_entrega"]["valor"] == antes
