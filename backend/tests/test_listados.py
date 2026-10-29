"""Bloque 4, T1A: parámetros comunes de las listas (core/listados.py).

TABLA-api (punto 1) fusionado con el punto 7 de KANBAN-base (C8, R5, R27): no hay core/filtros_lista.py; sus casos viven
aquí. RP8 (texto_busqueda), RP9 con su ajuste (leer_orden lanza HTTPException 422; leer_lista y orden_tiempo lanzan
ValueError, que el endpoint convierte en 422 con str(e)).

Es lógica pura: ningún endpoint cambia en T1A. Las pruebas que tocan la base crean sus filas dentro de la transacción
que el runner revierte (sufijo uuid y un db.add por objeto).

Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_listados
"""
import uuid
from datetime import datetime
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
    # r1 (g): con una lista también se descartan los None y los vacíos (no llegan como 'None').
    assert leer_lista(["A", None, "", " B,", "A"]) == ["A", "B"]


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


# ─── B4 T6A r1: caracteres de control (M13) y tope del offset (M14) ─────────────────────────────────────────────

CONTROL = "La búsqueda no puede llevar caracteres de control."


def test_caracteres_de_control_lanzan_value_error():
    """Un caracter de control (NUL incluido) en la busqueda o en los estados no llega al SQL (psycopg2 no adapta un NUL
    y daba 500): ValueError con el texto exacto, que el endpoint convierte en 422 con str(e). Se mira despues de
    recortar: los espacios de los bordes, tabuladores y saltos de linea incluidos, se siguen quitando."""
    from app.core.listados import leer_lista, texto_busqueda
    for malo in ("\x00", "a\x00b", "abc\x07", "\x1bxyz", "a\tb", "x\x7f", "y\x85z", " \x00 "):
        assert str(_lanza(ValueError, texto_busqueda, malo, None)) == CONTROL, repr(malo)
        assert str(_lanza(ValueError, texto_busqueda, None, malo)) == CONTROL, repr(malo)
        assert str(_lanza(ValueError, leer_lista, f"A,{malo}")) == CONTROL, repr(malo)
        assert str(_lanza(ValueError, leer_lista, ["A", malo])) == CONTROL, repr(malo)
    # Los bordes en blanco se recortan como antes, y el texto normal (con tildes) pasa.
    assert texto_busqueda("\tabc\r\n", None) == "abc"
    assert texto_busqueda(None, "\n Colchón ") == "Colchón"
    assert leer_lista(" A\t,\nB \r\n") == ["A", "B"]
    # q gana: un search que no se usa no se mira.
    assert texto_busqueda("abc", "\x00") == "abc"


def test_max_offset():
    """El techo del offset de las listas: Query(0, ge=0, le=MAX_OFFSET) responde 400 legible por encima (PostgreSQL da
    «bigint out of range» con un offset enorme, que salia como 500)."""
    from app.core.listados import MAX_OFFSET
    assert MAX_OFFSET == 1_000_000


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


# ─── validar_orden y leer_orden (TABLA-api 1, RP9 y su ajuste; r1: desempate por la fila de la lista) ────────

PERMITIDAS_COT = {"total_cop": SalesQuotation.total_cop, "numero": SalesQuotation.numero}
ID_COT = SalesQuotation.id


def test_validar_orden_da_la_clave_y_la_direccion():
    """r1 (e): para las listas que se ordenan en Python (lista de compras, catálogo de dos fuentes), la misma regla y el
    mismo 422 de leer_orden, sin expresiones SQL."""
    from fastapi import HTTPException
    from app.core.listados import validar_orden
    claves = ("fecha", "producto", "atencion")
    assert validar_orden("producto", claves, "-fecha") == ("producto", False)
    assert validar_orden(" -producto ", claves, "-fecha") == ("producto", True)
    assert validar_orden(None, claves, "-fecha") == ("fecha", True)
    assert validar_orden("", claves, "atencion") == ("atencion", False)
    for malo in ("drop table", "-atencion", "proveedor", "-"):
        e = _lanza(HTTPException, validar_orden, malo, claves, "fecha")
        assert e.status_code == 422 and e.detail == f"No se puede ordenar por «{malo}».", e.detail
    # r2 (3): ("fecha") no es una tupla sino un str, y dejaría pasar cualquier subcadena ('fe', 'ech'...).
    e = _lanza(TypeError, validar_orden, "fe", "fecha", "fecha")
    assert str(e) == "validar_orden: claves debe ser una tupla, una lista, un conjunto o un dict."
    assert validar_orden("fecha", ["fecha"], "fecha") == ("fecha", False)
    assert validar_orden("-fecha", {"fecha"}, "fecha") == ("fecha", True)
    assert validar_orden("fecha", {"fecha": None}, "fecha") == ("fecha", False)


def test_leer_orden_ascendente_y_descendente_con_nulos_al_final_y_desempate_por_id():
    from app.core.listados import leer_orden
    asc = _sql(select(SalesQuotation.id).order_by(*leer_orden("total_cop", PERMITIDAS_COT, "-total_cop",
                                                              id_lista=ID_COT)))
    assert "ORDER BY sales_quotations.total_cop ASC NULLS LAST, sales_quotations.id DESC" in asc, asc
    desc = _sql(select(SalesQuotation.id).order_by(*leer_orden("-total_cop", PERMITIDAS_COT, "numero",
                                                               id_lista=ID_COT)))
    assert "ORDER BY sales_quotations.total_cop DESC NULLS LAST, sales_quotations.id DESC" in desc, desc
    # Sin orden (None o en blanco) se usa el de por defecto, con la misma regla.
    for vacio in (None, "", "  "):
        por_defecto = _sql(select(SalesQuotation.id).order_by(*leer_orden(vacio, PERMITIDAS_COT, "-total_cop",
                                                                          id_lista=ID_COT)))
        assert "ORDER BY sales_quotations.total_cop DESC NULLS LAST, sales_quotations.id DESC" in por_defecto


def test_leer_orden_exige_id_lista_por_nombre():
    """r1 (Important 1): el id del desempate es el de la entidad que se lista; nunca se adivina."""
    from app.core.listados import leer_orden
    _lanza(TypeError, leer_orden, "total_cop", PERMITIDAS_COT, "numero")
    _lanza(TypeError, leer_orden, "total_cop", PERMITIDAS_COT, "numero", ID_COT)  # solo por nombre


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
    asc = [c.id for c in q.order_by(*leer_orden("total_cop", PERMITIDAS_COT, "numero", id_lista=ID_COT))]
    assert asc == [cots[2].id, cots[3].id, cots[0].id, cots[1].id]
    desc = [c.id for c in q.order_by(*leer_orden("-total_cop", PERMITIDAS_COT, "numero", id_lista=ID_COT))]
    assert desc == [cots[3].id, cots[0].id, cots[2].id, cots[1].id]


def test_leer_orden_columna_de_tabla_unida_desempata_por_la_fila_de_la_lista(db):
    """r1 (Important 1): una lista de pedidos ordenada por el nombre del cliente desempata por sale_orders.id, no por
    customers.id. Dos pedidos del mismo cliente empatan y customers.id vale lo mismo para los dos: con LIMIT/OFFSET una
    fila podía salir en dos páginas o en ninguna."""
    from app.core.listados import leer_orden
    from app.models.customers import Customer
    orden = leer_orden("cliente", {"cliente": Customer.first_name}, "cliente", id_lista=SaleOrder.id)
    sql = _sql(select(SaleOrder.id).join(Customer, SaleOrder.customer_id == Customer.id).order_by(*orden))
    assert sql.rstrip().endswith("ORDER BY customers.first_name ASC NULLS LAST, sale_orders.id DESC"), sql
    suf = _suf()
    cliente = Customer(first_name=f"Empate {suf}", last_name="T1A", email=f"t1a-{suf.lower()}@test.nebulae")
    db.add(cliente)
    db.commit()
    pedidos = []
    for i in range(2):
        v = SaleOrder(numero=f"PL{suf}{i:02d}", customer_id=cliente.id, customer_name=cliente.first_name,
                      estado="EN_PROCESO")
        db.add(v)
        db.commit()
        pedidos.append(v)
    q = (db.query(SaleOrder).join(Customer, SaleOrder.customer_id == Customer.id)
         .filter(SaleOrder.numero.like(f"PL{suf}%")).order_by(*orden))
    paginas = q.limit(1).offset(0).all() + q.limit(1).offset(1).all()
    assert [v.id for v in paginas] == [pedidos[1].id, pedidos[0].id]


def test_leer_orden_fuera_de_la_lista_da_422_en_espanol():
    from fastapi import HTTPException
    from app.core.listados import leer_orden
    e = _lanza(HTTPException, leer_orden, "drop table", PERMITIDAS_COT, "numero", id_lista=ID_COT)
    assert e.status_code == 422
    assert e.detail == "No se puede ordenar por «drop table»."
    e = _lanza(HTTPException, leer_orden, "-created_at", PERMITIDAS_COT, "numero", id_lista=ID_COT)
    assert e.status_code == 422 and e.detail == "No se puede ordenar por «-created_at»."


def test_leer_orden_especial_es_una_lista_y_termina_en_el_id_de_la_lista():
    """RP9: cada endpoint pone sus órdenes especiales en `permitidas` como lista de expresiones; leer_orden no sabe qué
    significan y no las invierte ('-atencion', '-reciente' y '-sin_movimiento' dan 422). r1: toda orden termina en
    id_lista desc, también una lista; si la lista ya lo trae al final no se repite."""
    from fastapi import HTTPException
    from app.core.listados import ORDENES_ESPECIALES, leer_orden
    assert ORDENES_ESPECIALES == ("atencion", "sin_movimiento", "reciente")
    atencion = [SaleOrder.estado.asc(), SaleOrder.created_at.desc()]
    permitidas = {"atencion": atencion, "reciente": [SaleOrder.created_at.desc()],
                  "sin_movimiento": [SaleOrder.updated_at.asc()], "total_cop": SaleOrder.total_cop,
                  "con_id": [SaleOrder.estado.asc(), SaleOrder.id.desc()]}
    sql = _sql(select(SaleOrder.id).order_by(*leer_orden("atencion", permitidas, "total_cop", id_lista=SaleOrder.id)))
    assert sql.rstrip().endswith(
        "ORDER BY sale_orders.estado ASC, sale_orders.created_at DESC, sale_orders.id DESC"), sql
    assert len(leer_orden(None, permitidas, "atencion", id_lista=SaleOrder.id)) == 3
    assert len(atencion) == 2  # la lista del endpoint no se modifica
    con_id = leer_orden("con_id", permitidas, "total_cop", id_lista=SaleOrder.id)
    assert len(con_id) == 2 and _sql(select(SaleOrder.id).order_by(*con_id)).rstrip().endswith(
        "ORDER BY sale_orders.estado ASC, sale_orders.id DESC")
    for especial in ORDENES_ESPECIALES:
        e = _lanza(HTTPException, leer_orden, f"-{especial}", permitidas, "total_cop", id_lista=SaleOrder.id)
        assert e.status_code == 422 and e.detail == f"No se puede ordenar por «-{especial}».", e.detail
    e = _lanza(HTTPException, leer_orden, "-con_id", permitidas, "total_cop", id_lista=SaleOrder.id)
    assert e.detail == "No se puede ordenar por «-con_id»."
    # Una orden especial que el endpoint no ofrece también da 422.
    e = _lanza(HTTPException, leer_orden, "atencion", PERMITIDAS_COT, "numero", id_lista=ID_COT)
    assert e.detail == "No se puede ordenar por «atencion»."


def test_leer_orden_de_una_expresion_sin_tabla():
    """Un CASE (orden_por_lista) se ordena igual que una columna y desempata por id_lista."""
    from app.core.listados import leer_orden, orden_por_lista
    rango = orden_por_lista(SaleOrder.estado, ["PENDIENTE_COMPRA", "EN_PROCESO"])
    sql = _sql(select(SaleOrder.id).order_by(*leer_orden("-estado", {"estado": rango}, "estado",
                                                         id_lista=SaleOrder.id)))
    assert sql.rstrip().endswith("END DESC NULLS LAST, sale_orders.id DESC"), sql


# ─── orden_tiempo y expresiones_tiempo (KANBAN-base 7: aplicar_orden) ────────────────────────────────────────

def test_orden_tiempo_sin_movimiento_y_reciente():
    from app.core.listados import orden_tiempo
    base = select(SaleOrder.id)
    sin_mov = _sql(orden_tiempo(base, SaleOrder.created_at, SaleOrder.updated_at, "sin_movimiento",
                                id_lista=SaleOrder.id))
    assert sin_mov.rstrip().endswith(
        "ORDER BY coalesce(sale_orders.updated_at, sale_orders.created_at) ASC NULLS LAST, "
        "sale_orders.created_at ASC NULLS LAST, sale_orders.id DESC"), sin_mov
    reciente = _sql(orden_tiempo(base, SaleOrder.created_at, SaleOrder.updated_at, "reciente", id_lista=SaleOrder.id))
    # r2 (1, R5): 'reciente' es el created_at desc de hoy (en PostgreSQL los NULL quedan primero), solo con el desempate
    # por el id de la fila al final.
    assert reciente.rstrip().endswith("ORDER BY sale_orders.created_at DESC, sale_orders.id DESC"), reciente
    # 'reciente' es el de por defecto.
    for vacio in (None, ""):
        assert _sql(orden_tiempo(base, SaleOrder.created_at, SaleOrder.updated_at, vacio,
                                 id_lista=SaleOrder.id)) == reciente
    _lanza(TypeError, orden_tiempo, base, SaleOrder.created_at, SaleOrder.updated_at, "reciente")


def test_orden_tiempo_reciente_en_la_base_es_el_orden_de_hoy(db):
    """r2 (1, R5): como el created_at.desc() de hoy, un created_at NULL sale primero; los empates, por id desc."""
    from app.core.listados import orden_tiempo
    suf = _suf()
    filas = []
    for i, creado in enumerate([datetime(2001, 1, 1, 12), null(), datetime(2001, 1, 2, 12), datetime(2001, 1, 2, 12)]):
        v = SaleOrder(numero=f"PL{suf}{i:02d}", customer_name=f"Cliente Tiempo {suf}", estado="EN_PROCESO",
                      created_at=creado, updated_at=datetime(2001, 1, 3))
        db.add(v)
        db.commit()
        filas.append(v)
    q = orden_tiempo(_del_sufijo(db, suf), SaleOrder.created_at, SaleOrder.updated_at, "reciente",
                     id_lista=SaleOrder.id)
    assert [v.id for v in q] == [filas[1].id, filas[3].id, filas[2].id, filas[0].id]
    hoy = _del_sufijo(db, suf).order_by(SaleOrder.created_at.desc()).all()
    assert hoy[0].id == filas[1].id  # el orden de hoy también deja el NULL primero


def test_orden_tiempo_con_otro_valor_lanza_value_error():
    from app.core.listados import orden_tiempo
    for malo in ("x", "-reciente"):
        e = _lanza(ValueError, orden_tiempo, select(SaleOrder.id), SaleOrder.created_at, SaleOrder.updated_at, malo,
                   id_lista=SaleOrder.id)
        assert str(e) == f"No se puede ordenar por «{malo}»."


def test_expresiones_de_tiempo_sirven_como_orden_especial():
    """Las mismas expresiones de orden_tiempo, para ponerlas en `permitidas` de leer_orden; el id no se repite."""
    from app.core.listados import expresiones_tiempo, leer_orden, orden_tiempo
    _lanza(TypeError, expresiones_tiempo, SaleOrder.created_at, SaleOrder.updated_at, "reciente")
    permitidas = {clave: expresiones_tiempo(SaleOrder.created_at, SaleOrder.updated_at, clave, id_lista=SaleOrder.id)
                  for clave in ("sin_movimiento", "reciente")}
    for clave in ("sin_movimiento", "reciente"):
        por_lista = _sql(select(SaleOrder.id).order_by(*leer_orden(clave, permitidas, "reciente",
                                                                   id_lista=SaleOrder.id)))
        assert por_lista == _sql(orden_tiempo(select(SaleOrder.id), SaleOrder.created_at, SaleOrder.updated_at, clave,
                                              id_lista=SaleOrder.id))
        assert por_lista.count("sale_orders.id DESC") == 1


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


def test_contar_por_vista_sin_condiciones_cuenta_desde_la_tabla(db):
    """r1 (f): sin WHERE ni join y con todas las condiciones en None, la consulta igual sale de la tabla del Query (un
    SELECT count(*) sin FROM daría 1)."""
    from app.core.listados import contar_por_vista
    _pedidos(db, _suf(), ["EN_PROCESO"])
    assert contar_por_vista(db.query(SaleOrder), {"todos": None}) == {"todos": db.query(SaleOrder).count()}


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
