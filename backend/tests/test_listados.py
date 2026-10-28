"""Bloque 4, T1A: parámetros comunes de las listas (core/listados.py).

TABLA-api (punto 1) fusionado con el punto 7 de KANBAN-base (C8, R5, R27): no hay core/filtros_lista.py; sus casos viven
aquí. RP8 (texto_busqueda), RP9 con su ajuste (leer_orden lanza HTTPException 422; leer_lista y orden_tiempo lanzan
ValueError, que el endpoint convierte en 422 con str(e)).

Es lógica pura: ningún endpoint cambia en T1A. Las pruebas que tocan la base crean sus filas dentro de la transacción
que el runner revierte (sufijo uuid y un db.add por objeto).

Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_listados
"""
import uuid
from decimal import Decimal

from sqlalchemy import null, select
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import selectinload

from app.models.erp_documents import SaleOrder, SalesQuotation


def _suf():
    return uuid.uuid4().hex[:8].upper()


def _sql(stmt):
    """El SQL de PostgreSQL de una sentencia (o de un Query), para afirmar cómo compila."""
    stmt = getattr(stmt, "statement", stmt)
    return str(stmt.compile(dialect=postgresql.dialect()))


def _pedidos(db, suf, estados):
    """Un PVEN por estado, en ese orden (ids crecientes)."""
    filas = []
    for i, estado in enumerate(estados):
        v = SaleOrder(numero=f"PL{suf}{i:02d}", customer_name=f"Cliente Listados {suf}", estado=estado,
                      total_cop=Decimal(1000 * (i + 1)))
        db.add(v)
        db.commit()
        filas.append(v)
    return filas


def _del_sufijo(db, suf):
    return db.query(SaleOrder).filter(SaleOrder.numero.like(f"PL{suf}%"))


def _lanza(exc, fn, *args, **kwargs):
    try:
        fn(*args, **kwargs)
    except exc as e:
        return e
    raise AssertionError(f"{fn.__name__} no lanzó {exc.__name__}")


# ─── leer_lista (estados en CSV) ─────────────────────────────────────────────────────────────────────────────

def test_leer_lista_separa_limpia_y_quita_repetidos():
    from app.core.listados import MAX_ESTADOS, leer_lista
    assert MAX_ESTADOS == 20
    assert leer_lista(" A, B,,A ") == ["A", "B"]
    assert leer_lista("EN_PROCESO") == ["EN_PROCESO"]
    assert leer_lista(None) == []
    assert leer_lista("") == []
    assert leer_lista(" , ,") == []


def test_leer_lista_con_mas_de_20_lanza_value_error():
    from app.core.listados import leer_lista
    veinte = ",".join(f"E{i}" for i in range(20))
    assert len(leer_lista(veinte)) == 20
    e = _lanza(ValueError, leer_lista, ",".join(f"E{i}" for i in range(21)))
    assert str(e) == "Puedes filtrar por 20 estados como máximo."
    # Los repetidos no cuentan: 21 valores con uno repetido son 20 estados.
    assert len(leer_lista(veinte + ",E0")) == 20


# ─── texto_busqueda (RP8) ────────────────────────────────────────────────────────────────────────────────────

def test_texto_busqueda_gana_q_y_un_vacio_da_none():
    from app.core.listados import texto_busqueda
    assert texto_busqueda(" abc ", "otro") == "abc"
    assert texto_busqueda(None, " PVEN-1 ") == "PVEN-1"
    assert texto_busqueda("abc", None) == "abc"
    assert texto_busqueda(None, None) is None
    assert texto_busqueda("", None) is None
    assert texto_busqueda("   ", "   ") is None
    # Un q en blanco no tapa a search (los selectores viejos solo mandan search).
    assert texto_busqueda("  ", "sofa") == "sofa"


# ─── filtrar_por_estados (KANBAN-base 7) ─────────────────────────────────────────────────────────────────────

def test_filtrar_por_estados_uno_es_igualdad_y_varios_in():
    from app.core.listados import filtrar_por_estados
    base = select(SaleOrder)
    uno = _sql(filtrar_por_estados(base, SaleOrder.estado, "EN_PROCESO"))
    assert "WHERE sale_orders.estado = %(estado_1)s" in uno, uno
    varios = _sql(filtrar_por_estados(base, SaleOrder.estado, "EN_PROCESO, LISTO_ENTREGA"))
    assert "WHERE sale_orders.estado IN (" in varios, varios
    # Ninguno: la misma consulta, sin WHERE.
    assert filtrar_por_estados(base, SaleOrder.estado, None) is base
    assert filtrar_por_estados(base, SaleOrder.estado, " , ") is base
    assert "WHERE" not in _sql(filtrar_por_estados(base, SaleOrder.estado, ""))


def test_filtrar_por_estados_con_mas_de_20_lanza_value_error():
    from app.core.listados import filtrar_por_estados
    e = _lanza(ValueError, filtrar_por_estados, select(SaleOrder), SaleOrder.estado,
               ",".join(f"E{i}" for i in range(21)))
    assert str(e) == "Puedes filtrar por 20 estados como máximo."


def test_filtrar_por_estados_en_la_base(db):
    from app.core.listados import filtrar_por_estados
    suf = _suf()
    _pedidos(db, suf, ["EN_PROCESO", "LISTO_ENTREGA", "CANCELADO"])
    q = _del_sufijo(db, suf)
    assert filtrar_por_estados(q, SaleOrder.estado, "EN_PROCESO").count() == 1
    assert {v.estado for v in filtrar_por_estados(q, SaleOrder.estado, "EN_PROCESO,LISTO_ENTREGA")} == {
        "EN_PROCESO", "LISTO_ENTREGA"}
    assert filtrar_por_estados(q, SaleOrder.estado, None).count() == 3


# ─── leer_orden (TABLA-api 1, RP9 y su ajuste) ───────────────────────────────────────────────────────────────

PERMITIDAS_COT = {"total_cop": SalesQuotation.total_cop, "numero": SalesQuotation.numero}


def test_leer_orden_ascendente_y_descendente_con_nulos_al_final_y_desempate_por_id():
    from app.core.listados import leer_orden
    asc = _sql(select(SalesQuotation.id).order_by(*leer_orden("total_cop", PERMITIDAS_COT, "-total_cop")))
    assert "ORDER BY sales_quotations.total_cop ASC NULLS LAST, sales_quotations.id DESC" in asc, asc
    desc = _sql(select(SalesQuotation.id).order_by(*leer_orden("-total_cop", PERMITIDAS_COT, "numero")))
    assert "ORDER BY sales_quotations.total_cop DESC NULLS LAST, sales_quotations.id DESC" in desc, desc
    # Sin orden (None o en blanco) se usa el de por defecto, con la misma regla.
    for vacio in (None, "", "  "):
        por_defecto = _sql(select(SalesQuotation.id).order_by(*leer_orden(vacio, PERMITIDAS_COT, "-total_cop")))
        assert "ORDER BY sales_quotations.total_cop DESC NULLS LAST, sales_quotations.id DESC" in por_defecto


def test_leer_orden_en_la_base(db):
    """total_cop 300, NULL, 100 y 300: ascendente da 100, 300 (el de id mayor primero), 300 y el nulo al final."""
    from app.core.listados import leer_orden
    suf = _suf()
    cots = []
    # null(): con None el default=0 de la columna se pondría en su lugar y no habría nulo que llevar al final.
    for i, total in enumerate([Decimal(300), null(), Decimal(100), Decimal(300)]):
        c = SalesQuotation(numero=f"CL{suf}{i}", customer_name=f"Cliente Orden {suf}", total_cop=total)
        db.add(c)
        db.commit()
        cots.append(c)
    q = db.query(SalesQuotation).filter(SalesQuotation.numero.like(f"CL{suf}%"))
    assert cots[1].total_cop is None
    asc = [c.id for c in q.order_by(*leer_orden("total_cop", PERMITIDAS_COT, "numero"))]
    assert asc == [cots[2].id, cots[3].id, cots[0].id, cots[1].id]
    desc = [c.id for c in q.order_by(*leer_orden("-total_cop", PERMITIDAS_COT, "numero"))]
    assert desc == [cots[3].id, cots[0].id, cots[2].id, cots[1].id]


def test_leer_orden_fuera_de_la_lista_da_422_en_espanol():
    from fastapi import HTTPException
    from app.core.listados import leer_orden
    e = _lanza(HTTPException, leer_orden, "drop table", PERMITIDAS_COT, "numero")
    assert e.status_code == 422
    assert e.detail == "No se puede ordenar por «drop table»."
    e = _lanza(HTTPException, leer_orden, "-created_at", PERMITIDAS_COT, "numero")
    assert e.status_code == 422 and e.detail == "No se puede ordenar por «-created_at»."


def test_leer_orden_especial_es_una_lista_de_expresiones_y_no_se_invierte():
    """RP9: cada endpoint pone sus órdenes especiales en `permitidas` como lista de expresiones; leer_orden no sabe qué
    significan. '-atencion', '-reciente' y '-sin_movimiento' dan 422."""
    from fastapi import HTTPException
    from app.core.listados import ORDENES_ESPECIALES, leer_orden
    assert ORDENES_ESPECIALES == ("atencion", "sin_movimiento", "reciente")
    atencion = [SaleOrder.estado.asc(), SaleOrder.created_at.desc(), SaleOrder.id.desc()]
    permitidas = {"atencion": atencion, "reciente": [SaleOrder.created_at.desc()],
                  "sin_movimiento": [SaleOrder.updated_at.asc()], "total_cop": SaleOrder.total_cop}
    assert leer_orden("atencion", permitidas, "total_cop") == atencion
    assert leer_orden(None, permitidas, "atencion") == atencion
    sql = _sql(select(SaleOrder.id).order_by(*leer_orden("atencion", permitidas, "total_cop")))
    assert "ORDER BY sale_orders.estado ASC, sale_orders.created_at DESC, sale_orders.id DESC" in sql, sql
    for especial in ORDENES_ESPECIALES:
        e = _lanza(HTTPException, leer_orden, f"-{especial}", permitidas, "total_cop")
        assert e.status_code == 422 and e.detail == f"No se puede ordenar por «-{especial}».", e.detail
    # Una orden especial que el endpoint no ofrece también da 422.
    e = _lanza(HTTPException, leer_orden, "atencion", PERMITIDAS_COT, "numero")
    assert e.detail == "No se puede ordenar por «atencion»."


def test_leer_orden_sin_id_de_desempate_lo_recibe_aparte():
    """Una expresión sin tabla (un CASE) no tiene de dónde sacar el id: se pasa con desempate=."""
    from app.core.listados import leer_orden, orden_por_lista
    rango = orden_por_lista(SaleOrder.estado, ["PENDIENTE_COMPRA", "EN_PROCESO"])
    permitidas = {"estado": rango}
    _lanza(TypeError, leer_orden, "estado", permitidas, "estado")
    sql = _sql(select(SaleOrder.id).order_by(*leer_orden("-estado", permitidas, "estado", desempate=SaleOrder.id)))
    assert sql.rstrip().endswith("END DESC NULLS LAST, sale_orders.id DESC"), sql


# ─── orden_tiempo (KANBAN-base 7: aplicar_orden) ─────────────────────────────────────────────────────────────

def test_orden_tiempo_sin_movimiento_y_reciente():
    from app.core.listados import orden_tiempo
    base = select(SaleOrder.id)
    sin_mov = _sql(orden_tiempo(base, SaleOrder.created_at, SaleOrder.updated_at, "sin_movimiento"))
    assert ("ORDER BY coalesce(sale_orders.updated_at, sale_orders.created_at) ASC, sale_orders.created_at ASC"
            in sin_mov), sin_mov
    reciente = _sql(orden_tiempo(base, SaleOrder.created_at, SaleOrder.updated_at, "reciente"))
    assert reciente.rstrip().endswith("ORDER BY sale_orders.created_at DESC"), reciente
    # 'reciente' es el de por defecto: es el order_by de las listas de hoy.
    for vacio in (None, ""):
        assert _sql(orden_tiempo(base, SaleOrder.created_at, SaleOrder.updated_at, vacio)) == reciente


def test_orden_tiempo_con_otro_valor_lanza_value_error():
    from app.core.listados import orden_tiempo
    e = _lanza(ValueError, orden_tiempo, select(SaleOrder.id), SaleOrder.created_at, SaleOrder.updated_at, "x")
    assert str(e) == "No se puede ordenar por «x»."
    e = _lanza(ValueError, orden_tiempo, select(SaleOrder.id), SaleOrder.created_at, SaleOrder.updated_at, "-reciente")
    assert str(e) == "No se puede ordenar por «-reciente»."


def test_expresiones_de_tiempo_sirven_como_orden_especial():
    """Las mismas expresiones de orden_tiempo, para ponerlas en `permitidas` de leer_orden."""
    from app.core.listados import expresiones_tiempo, leer_orden, orden_tiempo
    permitidas = {"sin_movimiento": expresiones_tiempo(SaleOrder.created_at, SaleOrder.updated_at, "sin_movimiento"),
                  "reciente": expresiones_tiempo(SaleOrder.created_at, SaleOrder.updated_at, "reciente")}
    for clave in ("sin_movimiento", "reciente"):
        por_lista = _sql(select(SaleOrder.id).order_by(*leer_orden(clave, permitidas, "reciente")))
        assert por_lista == _sql(orden_tiempo(select(SaleOrder.id), SaleOrder.created_at, SaleOrder.updated_at, clave))


# ─── orden_por_lista ─────────────────────────────────────────────────────────────────────────────────────────

def test_orden_por_lista_ordena_por_la_posicion_en_el_flujo(db):
    from app.core.listados import orden_por_lista
    flujo = ["PENDIENTE_COMPRA", "EN_PROCESO", "ENTREGADO"]
    sql = _sql(select(SaleOrder.id).order_by(orden_por_lista(SaleOrder.estado, flujo)))
    assert "ORDER BY CASE sale_orders.estado WHEN" in sql and "ELSE" in sql, sql
    suf = _suf()
    # Alfabéticamente sería CANCELADO, ENTREGADO, EN_PROCESO, PENDIENTE_COMPRA; un estado fuera de la lista va al final.
    filas = _pedidos(db, suf, ["ENTREGADO", "CANCELADO", "PENDIENTE_COMPRA", "EN_PROCESO"])
    orden = [v.estado for v in _del_sufijo(db, suf).order_by(orden_por_lista(SaleOrder.estado, flujo), SaleOrder.id)]
    assert orden == ["PENDIENTE_COMPRA", "EN_PROCESO", "ENTREGADO", "CANCELADO"]
    assert len(filas) == 4


# ─── contar_por_vista (una sola consulta con count(*) FILTER) ────────────────────────────────────────────────

def test_contar_por_vista_en_una_sola_consulta(db, contador_sql):
    from app.core.listados import contar_por_vista
    suf = _suf()
    _pedidos(db, suf, ["EN_PROCESO", "EN_PROCESO", "CANCELADO", "ENTREGADO", "CANCELADO"])
    # La consulta de la lista trae su orden y su selectinload: contar_por_vista no los necesita y no le estorban.
    q = (_del_sufijo(db, suf).options(selectinload(SaleOrder.customer)).order_by(SaleOrder.created_at.desc()))
    vistas = {"todos": None, "en_curso": SaleOrder.estado == "EN_PROCESO",
              "cerrados": SaleOrder.estado.in_(["CANCELADO", "ENTREGADO"])}
    with contador_sql.ventana() as v:
        conteos = contar_por_vista(q, vistas)
    assert conteos == {"todos": 5, "en_curso": 2, "cerrados": 3}
    assert v.consultas == 1, v.sentencias
    assert "count(*) FILTER (WHERE" in v.sentencias[0], v.sentencias[0]
    assert contar_por_vista(q, {}) == {}


def test_contar_por_vista_sin_filas_da_ceros(db):
    from app.core.listados import contar_por_vista
    q = _del_sufijo(db, f"NADA{_suf()}")
    assert contar_por_vista(q, {"todos": None, "x": SaleOrder.estado == "EN_PROCESO"}) == {"todos": 0, "x": 0}


# ─── paginar ─────────────────────────────────────────────────────────────────────────────────────────────────

def test_paginar_trae_el_total_y_solo_la_pagina(db):
    from app.core.listados import paginar
    suf = _suf()
    filas = _pedidos(db, suf, ["EN_PROCESO"] * 5)
    q = _del_sufijo(db, suf).order_by(SaleOrder.id)
    total, items = paginar(q, 2, 2)
    assert total == 5
    assert [v.id for v in items] == [filas[2].id, filas[3].id]
    total, items = paginar(q, 2, 4)
    assert total == 5 and [v.id for v in items] == [filas[4].id]


def test_paginar_con_limit_cero_solo_cuenta(db, contador_sql):
    from app.core.listados import paginar
    suf = _suf()
    _pedidos(db, suf, ["EN_PROCESO"] * 5)
    q = _del_sufijo(db, suf).order_by(SaleOrder.id)
    with contador_sql.ventana() as v:
        assert paginar(q, 0, 0) == (5, [])
    assert v.consultas == 1, v.sentencias


# ─── respuesta ───────────────────────────────────────────────────────────────────────────────────────────────

def test_respuesta_solo_trae_conteos_y_resumen_si_se_pasan():
    from app.core.listados import respuesta
    assert respuesta(5, [{"id": 1}]) == {"status": "success", "total": 5, "data": [{"id": 1}]}
    con_todo = respuesta(5, [], conteos={"todos": 5}, resumen={"monto_cop": 10})
    assert con_todo == {"status": "success", "total": 5, "data": [], "conteos": {"todos": 5},
                        "resumen": {"monto_cop": 10}}
    assert "resumen" not in respuesta(0, [], conteos={})
    assert respuesta(0, [], conteos={})["conteos"] == {}
    # Claves propias de un endpoint (por ejemplo los grupos del Hub) van tal cual.
    assert respuesta(1, [], grupos={"ATRASADO": 1})["grupos"] == {"ATRASADO": 1}
