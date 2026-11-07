"""B4 T12 (TABLA-compras puntos 2, 3 y 4; TABLA-api punto 2; KANBAN-logistica punto 6; R5, R8, R9, R21; C8, C10; RP8,
RP9, RP40, RP41, D32, D34, D46): las listas de Compras paginadas en el servidor.

- GET /compras/pedidos: q (search como alias, también por el comprador), estados (CSV de los estados del PEC), vista
  (VISTAS_PEC; «todos» = los vigentes, R9), semaforo=vencidos (todos = sin filtro), orden (atencion, reciente,
  sin_movimiento y los campos de la tabla), con_conteos (cada vista y vencidos) y con_resumen.
- GET /compras/recepciones: q y search, vista por_confirmar | confirmadas | canceladas | todas (RP41), estados, orden y
  con_conteos.
- GET /compras/lista-compras: q (D32), offset, orden, total y conteos por estado; solo sincroniza con offset 0.
La prueba 5 del diseño (operaciones de inventario) es de T13 y la 6 (paridad) de T2.

Se corre SOLO con el runner de ROLLBACK (python tests/rollback_runner.py test_listas_compras_paginadas): cada prueba va
en una transacción que se revierte. erp_test ya tiene datos, así que cada prueba trabaja con un sufijo único (q=<sufijo>)
o afirma diferencias. La Lista de compras vive en web_builder_config (config_key 'erp_lista_compras'): el runner la
revierte, y la prueba igual la restaura en un finally (el brief lo pide).
"""
import uuid
from datetime import datetime, time, timedelta

from fastapi.encoders import jsonable_encoder

from app.models.erp_documents import GoodsReceipt, PurchaseOrderFull, SaleOrder

RUTA_PEC = "/api/v1/compras/pedidos"
RUTA_REC = "/api/v1/compras/recepciones"
RUTA_LISTA = "/api/v1/compras/lista-compras"
CONTROL = "La búsqueda no puede llevar caracteres de control."


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _ahora():
    from app.core.fechas import ahora_utc
    return ahora_utc()


def _hoy():
    from app.core.fechas import hoy_colombia
    return hoy_colombia()


def _dia(n, hora=12):
    """Un instante del día hoy_colombia() + n (n < 0: hace n días), a la hora dada (UTC sin zona, como se guarda)."""
    return datetime.combine(_hoy() + timedelta(days=n), time(hora, 0))


def _get(app_client, token, ruta, **params):
    resp = app_client.get(ruta, params=params, headers=_auth(token))
    assert resp.status_code == 200, resp.text
    return resp.json()


def _error(app_client, token, ruta, **params):
    resp = app_client.get(ruta, params=params, headers=_auth(token))
    assert resp.status_code == 422, (params, resp.status_code, resp.text)
    return resp.json()["detail"]


def _ids(cuerpo):
    return [fila["id"] for fila in cuerpo["data"]]


class _Fabrica:
    """PEC y recepciones con un sufijo único (en el número, el proveedor y la bodega). Un db.add por objeto."""

    def __init__(self, db):
        self.db = db
        self.sufijo = uuid.uuid4().hex[:8].upper()
        self.proveedor = f"Prov {self.sufijo}"
        self.bodega = f"Bodega {self.sufijo}"
        self.n = 0
        self.base = _ahora() - timedelta(hours=1)

    def _numero(self, prefijo):
        self.n += 1
        return f"{prefijo}{self.sufijo}{self.n:02d}"

    def _guardar(self, objeto):
        self.db.add(objeto)
        self.db.commit()
        return objeto

    def pec(self, estado="EMITIDO", entrega=None, total=100_000, creado=None, **campos):
        """created_at crece con cada PEC (el último es el más reciente), salvo que se pase `creado`."""
        creado = creado or self.base + timedelta(minutes=self.n)
        campos.setdefault("supplier_name", self.proveedor)
        return self._guardar(PurchaseOrderFull(
            numero=self._numero("PEC-L"), estado=estado, fecha_entrega_estimada=entrega, total_cop=total,
            fecha_compra=creado, created_at=creado, updated_at=creado, **campos))

    def recepcion(self, estado="BORRADOR", pec=None, fecha=None, creado=None, **campos):
        creado = creado or self.base + timedelta(minutes=self.n)
        campos.setdefault("supplier_name", self.proveedor)
        campos.setdefault("warehouse_name", self.bodega)
        return self._guardar(GoodsReceipt(
            numero=self._numero("ENINV-L"), pec_id=pec.id if pec else None, pec_numero=pec.numero if pec else None,
            estado=estado, fecha_recepcion=fecha or creado, created_at=creado, updated_at=creado, **campos))


# ─── 1) list_pec: vistas por etapa, atención primero, semáforo y resumen (R8, R9, RP40) ──────────────────────────────

def _seis_pec(f):
    """Los datos de la prueba 1 del diseño: dos vencidos (hace 5 días y hace 1), uno que vence en 3 días, uno RECIBIDA,
    uno PARCIALMENTE_RECIBIDA y uno CANCELADO (los tres últimos con la entrega hace 10 días)."""
    return {
        "hace5": f.pec("EMITIDO", _dia(-5), total=1_000),
        "hace1": f.pec("EN_TRANSITO", _dia(-1), total=2_000),
        "en3": f.pec("EMITIDO", _dia(3), total=4_000),
        "recibida": f.pec("RECIBIDA", _dia(-10), total=8_000),
        "parcial": f.pec("PARCIALMENTE_RECIBIDA", _dia(-10), total=16_000),
        "cancelado": f.pec("CANCELADO", _dia(-10), total=32_000),
    }


def test_list_pec_vistas_atencion_semaforo_y_resumen(app_client, db, admin_token):
    f = _Fabrica(db)
    p = _seis_pec(f)
    s = f.sufijo

    def ids(**params):
        return _ids(_get(app_client, admin_token, RUTA_PEC, q=s, **params))

    # R8: vencidos primero (el más atrasado arriba), luego la entrega más cercana de lo que falta por entregar, luego
    # created_at desc. Los recibidos y los cancelados ya no esperan una entrega: van al final, el más reciente primero.
    assert ids(orden="atencion") == [p["hace5"].id, p["hace1"].id, p["en3"].id, p["cancelado"].id, p["parcial"].id,
                                     p["recibida"].id]
    # R9: Recibidos = etapa recibido; Activos incluye lo que llegó a bodega; Todos = vigentes (sin cancelados).
    assert set(ids(vista="recibidos")) == {p["recibida"].id}
    assert set(ids(vista="activos")) == {p["hace5"].id, p["hace1"].id, p["en3"].id, p["parcial"].id}
    vigentes = {p[k].id for k in ("hace5", "hace1", "en3", "recibida", "parcial")}
    assert set(ids(vista="vigentes")) == vigentes
    assert set(ids(vista="todos")) == vigentes
    assert set(ids(vista="cancelados")) == {p["cancelado"].id}
    assert set(ids(vista="en_bodega")) == {p["parcial"].id}
    # RP40: solo emitido y en tránsito con la entrega pasada; semaforo=todos es sin filtro (D46).
    assert set(ids(semaforo="vencidos")) == {p["hace5"].id, p["hace1"].id}
    assert len(ids(semaforo="todos")) == 6
    assert len(ids()) == 6
    # El dict: is_overdue solo para emitido y en tránsito (un RECIBIDA con la fecha vieja ya no es vencido).
    filas = {fila["id"]: fila for fila in _get(app_client, admin_token, RUTA_PEC, q=s)["data"]}
    assert {i for i, fila in filas.items() if fila["is_overdue"]} == {p["hace5"].id, p["hace1"].id}

    # con_resumen: sobre la búsqueda y los filtros extra, sin vista, estados ni semáforo (como los conteos).
    cuerpo = _get(app_client, admin_token, RUTA_PEC, q=s, con_resumen=1, vista="cancelados", limit=0)
    assert cuerpo["data"] == [] and cuerpo["total"] == 1
    assert cuerpo["resumen"] == {"capital_cop": 1_000 + 2_000 + 4_000 + 8_000 + 16_000, "activos": 4,
                                 "en_transito": 1, "en_bodega": 1, "vencidos": 2, "recibidos": 1,
                                 "cumplimiento_pct": 20.0}   # 1 / (4 + 1) × 100
    assert "conteos" not in cuerpo

    # limit y offset sobre el orden 'atencion'.
    pagina = _get(app_client, admin_token, RUTA_PEC, q=s, orden="atencion", limit=2, offset=1)
    assert pagina["total"] == 6 and _ids(pagina) == [p["hace1"].id, p["en3"].id]
    solo_total = _get(app_client, admin_token, RUTA_PEC, q=s, limit=0)
    assert solo_total == {"status": "success", "total": 6, "data": []}


def test_list_pec_conteos_por_vista_y_vencidos(app_client, db, admin_token):
    """con_conteos trae cada vista de VISTAS_PEC y 'vencidos', con la búsqueda pero SIN vista, estados ni semáforo (R5)."""
    from app.core.estados_compras import VISTAS_PEC
    f = _Fabrica(db)
    _seis_pec(f)
    f.pec("BORRADOR", _dia(-3))
    f.pec("COMPLETADO", _dia(-3))
    f.pec("RECIBIDO", _dia(-3))
    f.pec("ENVIADO", _dia(-3))
    f.pec("PENDIENTE_ENTREGA", _dia(2))
    esperado = {"todos": 10, "vigentes": 10, "activos": 7, "borradores": 1, "pedidos": 4, "en_transito": 2,
                "en_bodega": 2, "recibidos": 2, "cancelados": 1, "no_resueltos": 7, "acciones_tomadas": 3,
                "transito_logistica": 7, "vencidos": 3}
    assert set(esperado) == set(VISTAS_PEC) | {"vencidos"}
    for params in ({}, {"vista": "cancelados"}, {"estados": "BORRADOR"}, {"semaforo": "vencidos"},
                   {"estado": "EMITIDO"}):
        cuerpo = _get(app_client, admin_token, RUTA_PEC, q=f.sufijo, con_conteos=1, **params)
        assert cuerpo["conteos"] == esperado, params
    # La búsqueda sí cuenta: con otro texto, otros números.
    vacio = _get(app_client, admin_token, RUTA_PEC, q=f"nada-{f.sufijo}", con_conteos=1, limit=0)
    assert vacio["conteos"] == {clave: 0 for clave in esperado} and vacio["total"] == 0


def test_list_pec_estados_y_busqueda_por_comprador(app_client, db, admin_token):
    """estados en CSV (filtrar_por_estados) y 'estado' (compatibilidad) por la misma regla; la búsqueda suma
    created_by (el Comprador) y el proveedor del PEC (supplier_id sigue filtrando como hoy)."""
    f = _Fabrica(db)
    a = f.pec("RECIBIDO", created_by=f"Compradora {f.sufijo}")
    b = f.pec("PARCIALMENTE_RECIBIDA")
    f.pec("EMITIDO")
    s = f.sufijo
    assert set(_ids(_get(app_client, admin_token, RUTA_PEC, q=s, estados="RECIBIDO,PARCIALMENTE_RECIBIDA"))) == {
        a.id, b.id}
    assert set(_ids(_get(app_client, admin_token, RUTA_PEC, q=s, estado="RECIBIDO,PARCIALMENTE_RECIBIDA"))) == {
        a.id, b.id}
    assert _ids(_get(app_client, admin_token, RUTA_PEC, q=s, estado="RECIBIDO")) == [a.id]
    assert _ids(_get(app_client, admin_token, RUTA_PEC, q=s, estado="RECIBIDO", estados="PARCIALMENTE_RECIBIDA")) == []
    # El comprador: el texto solo está en created_by (el número y el proveedor llevan el sufijo, el comprador otro).
    otro = uuid.uuid4().hex[:10].upper()
    c = f.pec("EMITIDO", created_by=f"Comprador {otro}")
    assert _ids(_get(app_client, admin_token, RUTA_PEC, q=otro)) == [c.id]
    assert _ids(_get(app_client, admin_token, RUTA_PEC, search=f"comprador {otro.lower()}")) == [c.id]


def test_list_pec_orden_exacto_de_cada_campo_y_su_inverso(app_client, db, admin_token):
    """Cada campo de la lista blanca ordena de verdad, con los nulos al final en los dos sentidos y el desempate por
    id desc (leer_orden); 'estado' sigue su posición en el flujo (ESTADOS_PEC), no el alfabeto."""
    f = _Fabrica(db)
    s = f.sufijo
    a = f.pec("RECIBIDA", _dia(5), total=300, supplier_name=f"B {s}", created_by="Beto", fecha_alerta=_dia(1))
    b = f.pec("BORRADOR", _dia(1), total=100, supplier_name=f"A {s}", created_by="Ana", fecha_alerta=_dia(3))
    c = f.pec("EN_TRANSITO", None, total=200, supplier_name=f"C {s}", created_by=None, fecha_alerta=None)
    casos = {
        "numero": [a, b, c],
        "proveedor": [b, a, c],
        "comprador": [b, a, c],           # Ana, Beto y el que no tiene (nulos al final)
        "monto": [b, c, a],
        "compra": [a, b, c],
        "entrega": [b, a, c],
        "limite": [a, b, c],
        "estado": [b, c, a],              # BORRADOR, EN_TRANSITO y RECIBIDA
    }
    for campo, esperado in casos.items():
        ids = [x.id for x in esperado]
        assert _ids(_get(app_client, admin_token, RUTA_PEC, q=s, orden=campo)) == ids, campo
        nulos = [c.id] if campo in ("comprador", "entrega", "limite") else []   # c no tiene esos tres
        inverso = [i for i in reversed(ids) if i not in nulos] + nulos
        assert _ids(_get(app_client, admin_token, RUTA_PEC, q=s, orden=f"-{campo}")) == inverso, campo
    # 'reciente' es el orden de hoy (created_at desc) y 'sin_movimiento' el más quieto primero.
    assert _ids(_get(app_client, admin_token, RUTA_PEC, q=s, orden="reciente")) == [c.id, b.id, a.id]
    assert _ids(_get(app_client, admin_token, RUTA_PEC, q=s)) == [c.id, b.id, a.id]
    assert _ids(_get(app_client, admin_token, RUTA_PEC, q=s, orden="sin_movimiento")) == [a.id, b.id, c.id]
    # Empate: el desempate es el id desc.
    d = f.pec("EMITIDO", _dia(1), total=100, supplier_name=f"A {s}")
    assert _ids(_get(app_client, admin_token, RUTA_PEC, q=s, orden="monto"))[:2] == [d.id, b.id]


def test_atencion_desempata_por_created_at_y_por_id(app_client, db, admin_token):
    """Dentro de los vencidos, el más atrasado arriba; con el mismo día de entrega, el creado más reciente; con el mismo
    created_at, el id mayor. Un BORRADOR con la entrega pasada no es vencido (RP40), pero espera su entrega: va con los
    que vienen, por su fecha."""
    f = _Fabrica(db)
    mismo = _ahora() - timedelta(days=1)
    v1 = f.pec("EMITIDO", _dia(-2, hora=23), creado=mismo)
    v2 = f.pec("EMITIDO", _dia(-2, hora=1), creado=mismo)
    v3 = f.pec("EN_TRANSITO", _dia(-2, hora=5), creado=mismo - timedelta(hours=1))
    borrador = f.pec("BORRADOR", _dia(-7))
    hoy = f.pec("EMITIDO", datetime.combine(_hoy(), time(0, 0)))   # vence hoy: todavía no está vencido (RP40)
    futuro = f.pec("PENDIENTE_ENTREGA", _dia(4))
    sin_fecha = f.pec("EMITIDO", None)
    assert _ids(_get(app_client, admin_token, RUTA_PEC, q=f.sufijo, orden="atencion")) == [
        v2.id, v1.id, v3.id, borrador.id, hoy.id, futuro.id, sin_fecha.id]
    assert set(_ids(_get(app_client, admin_token, RUTA_PEC, q=f.sufijo, semaforo="vencidos"))) == {v1.id, v2.id, v3.id}


def test_vista_transito_logistica_y_paginacion(app_client, db, admin_token):
    """La vista de Tránsito excluye BORRADOR, CANCELADO y los recibidos; con limit=1 y offset el total cuenta los 3."""
    f = _Fabrica(db)
    for estado in ("BORRADOR", "CANCELADO", "RECIBIDA", "COMPLETADO"):
        f.pec(estado, _dia(-1))
    dentro = {f.pec("EMITIDO", _dia(2)).id, f.pec("EN_TRANSITO", _dia(-3)).id,
              f.pec("PARCIALMENTE_RECIBIDA", _dia(-4)).id}
    vistos = []
    for offset in range(4):
        pagina = _get(app_client, admin_token, RUTA_PEC, q=f.sufijo, vista="transito_logistica", orden="atencion",
                      limit=1, offset=offset)
        assert pagina["total"] == 3, offset
        vistos += _ids(pagina)
    assert len(vistos) == 3 and set(vistos) == dentro


# ─── 2) list_recepciones (RP41, KANBAN-logistica 6) ──────────────────────────────────────────────────────────────────

def test_recepciones_busqueda_vistas_estados_y_conteos(app_client, db, admin_token):
    f = _Fabrica(db)
    pec = f.pec("EMITIDO", _dia(-3))
    borrador = f.recepcion("BORRADOR", pec)
    completada = f.recepcion("COMPLETADA", pec)
    logistica = f.recepcion("COMPLETADA_LOGISTICA", pec)
    cancelada = f.recepcion("CANCELADA", pec)
    todas = {borrador.id, completada.id, logistica.id, cancelada.id}
    s = f.sufijo

    def ids(**params):
        return _ids(_get(app_client, admin_token, RUTA_REC, **params))

    # La búsqueda: número, número del PEC, proveedor y bodega.
    assert set(ids(q=f.proveedor)) == todas
    assert set(ids(q=f.bodega.lower())) == todas
    assert set(ids(q=pec.numero)) == todas
    assert ids(q=borrador.numero) == [borrador.id]
    # Las vistas son los grupos de recepción (RP41); sin vista, todas como hoy.
    assert ids(q=s, vista="por_confirmar") == [borrador.id]
    assert set(ids(q=s, vista="confirmadas")) == {completada.id, logistica.id}
    assert ids(q=s, vista="canceladas") == [cancelada.id]
    assert set(ids(q=s, vista="todas")) == todas
    assert set(ids(q=s, estados="BORRADOR,CANCELADA")) == {borrador.id, cancelada.id}
    assert ids(q=s, estado="COMPLETADA") == [completada.id]
    # Los conteos: con la búsqueda, sin vista ni estados.
    for params in ({}, {"vista": "canceladas"}, {"estados": "BORRADOR"}):
        cuerpo = _get(app_client, admin_token, RUTA_REC, q=s, con_conteos=1, limit=0, **params)
        assert cuerpo["conteos"] == {"por_confirmar": 1, "confirmadas": 2, "canceladas": 1, "todas": 4}, params
        assert cuerpo["data"] == []
    # Sin la búsqueda de la tabla, pec_id sigue filtrando como hoy.
    assert set(ids(pec_id=pec.id)) == todas


def test_recepciones_orden_exacto(app_client, db, admin_token):
    """Los campos de la lista blanca de Recepciones, con el desempate por id; 'retraso' es el dias_retraso de _gr_dict
    (1 día de tolerancia): sin retraso va al final en los dos sentidos."""
    f = _Fabrica(db)
    s = f.sufijo
    pec_a = f.pec("EMITIDO", _dia(-10), supplier_name=f"A {s}")
    pec_b = f.pec("EMITIDO", _dia(-10), supplier_name=f"B {s}")
    tarde3 = f.recepcion("COMPLETADA", pec_a, fecha=_dia(-6), supplier_name=f"Z {s}", warehouse_name=f"B {s}")
    tarde1 = f.recepcion("BORRADOR", pec_b, fecha=_dia(-8), supplier_name=f"Y {s}", warehouse_name=f"A {s}")
    a_tiempo = f.recepcion("CANCELADA", pec_a, fecha=_dia(-9), supplier_name=f"X {s}", warehouse_name=f"C {s}")
    assert [r["dias_retraso"] for r in _get(app_client, admin_token, RUTA_REC, q=s, orden="numero")["data"]] == [
        3, 1, None]
    casos = {
        "numero": [tarde3, tarde1, a_tiempo],
        "pec": [a_tiempo, tarde3, tarde1],         # pec_a antes que pec_b; empate por id desc
        "proveedor": [a_tiempo, tarde1, tarde3],
        "bodega": [tarde1, tarde3, a_tiempo],
        "fecha": [a_tiempo, tarde1, tarde3],
        "estado": [tarde1, tarde3, a_tiempo],      # BORRADOR, COMPLETADA, CANCELADA
        "retraso": [tarde1, tarde3, a_tiempo],
    }
    for campo, esperado in casos.items():
        assert _ids(_get(app_client, admin_token, RUTA_REC, q=s, orden=campo)) == [x.id for x in esperado], campo
    assert _ids(_get(app_client, admin_token, RUTA_REC, q=s, orden="-retraso")) == [tarde3.id, tarde1.id,
                                                                                   a_tiempo.id]
    assert _ids(_get(app_client, admin_token, RUTA_REC, q=s, orden="-pec")) == [tarde1.id, a_tiempo.id, tarde3.id]
    assert _ids(_get(app_client, admin_token, RUTA_REC, q=s)) == [a_tiempo.id, tarde1.id, tarde3.id]   # reciente


# ─── 3) list_lista_compras (D32, RP9) ─────────────────────────────────────────────────────────────────────────────────

def _items_de_prueba(sufijo, desde_id):
    def item(n, producto, estado, fecha, proveedor, pven):
        return {"id": desde_id + n, "pven_id": None, "pven_numero": pven, "producto": producto, "cantidad": 1,
                "proveedor": proveedor, "pec_id": None, "pec_numero": None, "estado": estado, "fecha": fecha,
                "notas": "", "created_by": "tester"}
    return [
        item(1, f"Cuna {sufijo}", "PENDIENTE", "2026-01-03T10:00:00", f"Beta {sufijo}", "PVEN-B"),
        item(2, f"Andadera {sufijo}", "EN_PEDIDO", "2026-01-01T10:00:00", "", "PVEN-C"),
        item(3, f"Bañera {sufijo}", "RECIBIDO", "2026-01-04T10:00:00", f"Alfa {sufijo}", None),
        item(4, f"Coche {sufijo}", "PENDIENTE", "2026-01-02T10:00:00", f"Alfa {sufijo}", "PVEN-A"),
        item(5, f"Descartado {sufijo}", "DESCARTADO", "2026-01-05T10:00:00", "", None),
    ]


def test_lista_compras_offset_total_orden_y_conteos(app_client, db, admin_token):
    from app.api.v1.erp_compras import _load_lista_compras, _save_lista_compras
    original = _load_lista_compras(db)
    s = uuid.uuid4().hex[:8].upper()
    desde = max([it.get("id", 0) for it in original if isinstance(it.get("id"), int)], default=0) + 1000
    try:
        _save_lista_compras(db, original + _items_de_prueba(s, desde))
        i = {n: desde + n for n in range(1, 6)}

        def lista(**params):
            return _get(app_client, admin_token, RUTA_LISTA, q=s, **params)

        cuerpo = lista()
        assert _ids(cuerpo) == [i[4], i[3], i[2], i[1]] and cuerpo["total"] == 4   # id desc, sin DESCARTADO (hoy)
        assert _ids(lista(orden="fecha")) == [i[2], i[4], i[1], i[3]]
        assert _ids(lista(orden="-fecha")) == [i[3], i[1], i[4], i[2]]
        assert _ids(lista(orden="producto")) == [i[2], i[3], i[4], i[1]]
        assert _ids(lista(orden="proveedor")) == [i[4], i[3], i[1], i[2]]    # sin proveedor al final
        assert _ids(lista(orden="-proveedor")) == [i[1], i[4], i[3], i[2]]
        assert _ids(lista(orden="estado")) == [i[4], i[1], i[2], i[3]]       # PENDIENTE, EN_PEDIDO, RECIBIDO
        assert _ids(lista(orden="pven")) == [i[4], i[1], i[2], i[3]]         # sin PVEN al final
        pagina = lista(orden="fecha", limit=2, offset=1)
        assert _ids(pagina) == [i[4], i[1]] and pagina["total"] == 4
        assert lista(limit=0) == {"status": "success", "data": [], "total": 4}
        # Conteos por estado, sobre lo filtrado sin el estado.
        for params in ({}, {"estado": "PENDIENTE"}):
            cuerpo = lista(con_conteos=1, **params)
            assert cuerpo["conteos"] == {"todos": 4, "PENDIENTE": 2, "EN_PEDIDO": 1, "RECIBIDO": 1}, params
        assert lista(estado="PENDIENTE")["total"] == 2
        assert _ids(lista(estado="DESCARTADO")) == [i[5]]                     # como hoy: el estado pedido
        assert _ids(lista(proveedor=f"alfa {s.lower()}")) == [i[4], i[3]]
        assert _ids(lista(fecha_desde="2026-01-02", fecha_hasta="2026-01-03")) == [i[4], i[1]]
        # q y search dan lo mismo (RP8, D32): producto, proveedor y PVEN.
        assert _get(app_client, admin_token, RUTA_LISTA, search=s)["total"] == 4
        assert _ids(_get(app_client, admin_token, RUTA_LISTA, q=f"Cuna {s}")) == [i[1]]
        assert _ids(_get(app_client, admin_token, RUTA_LISTA, q=f"Beta {s}")) == [i[1]]
    finally:
        _save_lista_compras(db, original)


def test_lista_compras_solo_sincroniza_con_offset_cero(app_client, db, admin_token, contador_sql):
    """_sincronizar_pvens_pendientes_a_lista escribe: con offset > 0 la lista se lee sin sincronizar (0 commits y
    ninguna escritura), y con offset 0 sincroniza como hoy."""
    from app.api.v1.erp_compras import _load_lista_compras, _save_lista_compras
    original = _load_lista_compras(db)
    s = uuid.uuid4().hex[:8].upper()
    try:
        app_client.get(RUTA_LISTA, params={"limit": 0}, headers=_auth(admin_token))   # lo pendiente de antes, ya
        ven = SaleOrder(numero=f"PV-L{s}", customer_name=f"Cliente {s}", estado="PENDIENTE_COMPRA",
                        productos=[{"product_name": f"Producto {s}", "qty": 2}])
        db.add(ven)
        db.commit()
        antes = _load_lista_compras(db)
        with contador_sql.ventana() as v:
            cuerpo = _get(app_client, admin_token, RUTA_LISTA, offset=1, limit=5)
        assert v.commits == 0, v.commits
        assert not [x for x in v.sentencias if x.lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE"))]
        db.expire_all()
        assert _load_lista_compras(db) == antes
        assert cuerpo["total"] >= 0
        cuerpo = _get(app_client, admin_token, RUTA_LISTA, q=s)
        assert [it["producto"] for it in cuerpo["data"]] == [f"Producto {s}"]
        db.expire_all()
        assert any(it.get("pven_id") == ven.id for it in _load_lista_compras(db))
    finally:
        _save_lista_compras(db, original)


# ─── 4) Búsqueda, errores y paginación (RP8, R21, D46) ────────────────────────────────────────────────────────────────

def test_q_y_search_dan_el_mismo_total(app_client, db, admin_token):
    f = _Fabrica(db)
    pec = f.pec("EMITIDO")
    f.pec("RECIBIDA")
    f.recepcion("BORRADOR", pec)
    f.recepcion("COMPLETADA", pec)
    for ruta in (RUTA_PEC, RUTA_REC):
        def total(**params):
            return _get(app_client, admin_token, ruta, limit=0, **params)["total"]
        assert total(q=f.sufijo) == total(search=f.sufijo) == 2, ruta
        assert total(q=f"  {f.sufijo} ") == total(search=f" {f.sufijo}  ") == 2, ruta
        assert total(q=f.sufijo, search=f"nada-{f.sufijo}") == 2, ruta
        assert total(q="   ", search=f.sufijo) == 2, ruta
        assert total(q=f"Prov\t{f.sufijo}") == total(q=f"Prov {f.sufijo}") == 2, ruta


def test_errores_en_espanol(app_client, admin_token):
    """R21 y D46: cada 422 con su texto exacto, comparado por igualdad."""
    muchos = ",".join(f"E{i}" for i in range(21))
    for ruta in (RUTA_PEC, RUTA_REC):
        for orden in ("hackeo", "-atencion" if ruta == RUTA_PEC else "atencion", "-reciente", "-sin_movimiento",
                      "total; drop table"):
            assert _error(app_client, admin_token, ruta, orden=orden) == f"No se puede ordenar por «{orden}».", (
                ruta, orden)
        assert _error(app_client, admin_token, ruta, estados=muchos) == "Puedes filtrar por 20 estados como máximo."
        for params in ({"q": "\x00"}, {"search": "tor\x00nillo"}, {"estados": "\x00"}, {"estado": "A\x1bB"},
                       {"q": "a\x7fb"}, {"vista": "to\x00dos"}):
            assert _error(app_client, admin_token, ruta, **params) == CONTROL, (ruta, params)
    assert _error(app_client, admin_token, RUTA_PEC, vista="analisis") == (
        "La vista «analisis» no existe en Pedidos de compra.")
    assert _error(app_client, admin_token, RUTA_PEC, vista="x" * 300) == (
        f"La vista «{'x' * 40}» no existe en Pedidos de compra.")
    assert _error(app_client, admin_token, RUTA_PEC, semaforo="atrasados") == (
        "El filtro del semáforo «atrasados» no existe: usa vencidos.")
    assert _error(app_client, admin_token, RUTA_PEC, semaforo="\x00") == CONTROL
    assert _error(app_client, admin_token, RUTA_PEC, orden="pec") == "No se puede ordenar por «pec»."
    assert _error(app_client, admin_token, RUTA_REC, vista="pendientes") == (
        "La vista «pendientes» no existe en Recepciones.")
    assert _error(app_client, admin_token, RUTA_REC, vista="todos") == "La vista «todos» no existe en Recepciones."
    assert _error(app_client, admin_token, RUTA_REC, orden="monto") == "No se puede ordenar por «monto»."
    for ruta, malo, sigla in ((RUTA_PEC, "FOO", "PEC"), (RUTA_PEC, "EMITIDO,CONFIRMADA", "PEC"),
                              (RUTA_PEC, "COMPLETADA", "PEC"), (RUTA_REC, "PENDIENTE", "ENINV"),
                              (RUTA_REC, "BORRADOR,RECIBIDA", "ENINV")):
        esperado = f"El estado «{malo.split(',')[-1]}» no existe en {sigla}."
        assert _error(app_client, admin_token, ruta, estados=malo) == esperado, (ruta, malo)
        assert _error(app_client, admin_token, ruta, estado=malo) == esperado, (ruta, malo)
    # Todos los estados del PEC y de la recepción existen; los blancos no filtran (vista=todos en Recepciones no
    # existe: su «todas» es la vista sin filtro).
    _get(app_client, admin_token, RUTA_PEC, limit=0, estados="BORRADOR,EMITIDO,ENVIADO,EN_TRANSITO,PENDIENTE_ENTREGA,"
         "RECIBIDO,PARCIALMENTE_RECIBIDA,RECIBIDA,COMPLETADO,CANCELADO")
    _get(app_client, admin_token, RUTA_REC, limit=0, estados="BORRADOR,COMPLETADA,COMPLETADA_LOGISTICA,CANCELADA")
    assert (_get(app_client, admin_token, RUTA_PEC, vista=" ", semaforo="todos", estados=" , ", orden=" ",
                 limit=0)["total"] == _get(app_client, admin_token, RUTA_PEC, limit=0)["total"])
    assert (_get(app_client, admin_token, RUTA_REC, vista=" ", estados=" , ", orden=" ", limit=0)["total"]
            == _get(app_client, admin_token, RUTA_REC, limit=0)["total"])
    # La Lista de compras: su lista blanca y el mismo 422 (RP9); un carácter de control en la búsqueda (D46).
    for orden in ("id", "-atencion", "atencion", "cantidad"):
        assert _error(app_client, admin_token, RUTA_LISTA, orden=orden) == f"No se puede ordenar por «{orden}».", orden
    for params in ({"q": "\x00"}, {"search": "cu\x00na"}):
        assert _error(app_client, admin_token, RUTA_LISTA, **params) == CONTROL, params


def test_ids_que_no_son_numero_o_no_existen_no_dan_500(app_client, admin_token):
    from main import MENSAJE_DATOS_INVALIDOS
    for ruta, params in ((RUTA_PEC, {"supplier_id": "abc"}), (RUTA_REC, {"pec_id": "1.5"})):
        resp = app_client.get(ruta, params=params, headers=_auth(admin_token))
        assert resp.status_code == 400 and resp.json()["message"] == MENSAJE_DATOS_INVALIDOS, (ruta, resp.text)
    for ruta, params in ((RUTA_PEC, {"supplier_id": 10 ** 12}), (RUTA_REC, {"pec_id": 10 ** 12})):
        assert _get(app_client, admin_token, ruta, **params)["total"] == 0, ruta
    for ruta in (RUTA_PEC, RUTA_REC):
        resp = app_client.get(ruta, params={"con_conteos": "quizas"}, headers=_auth(admin_token))
        assert resp.status_code == 400, (ruta, resp.text)


def test_paginacion_fuera_de_rango_da_400_legible(app_client, admin_token):
    from app.core.listados import MAX_OFFSET
    from main import MENSAJE_DATOS_INVALIDOS
    for ruta, defecto in ((RUTA_PEC, 50), (RUTA_REC, 50), (RUTA_LISTA, 200)):
        for params in ({"limit": 201}, {"limit": -1}, {"offset": -1}, {"offset": MAX_OFFSET + 1},
                       {"offset": 10 ** 20}):
            resp = app_client.get(ruta, params=params, headers=_auth(admin_token))
            assert resp.status_code == 400, (ruta, params, resp.status_code, resp.text)
            assert resp.json()["message"] == MENSAJE_DATOS_INVALIDOS, (ruta, params)
        borde = _get(app_client, admin_token, ruta, offset=MAX_OFFSET, limit=1)
        assert borde["data"] == [], ruta


def test_las_rutas_declaran_los_parametros_nuevos(app_client, admin_token):
    """R5 y C8: q, estados, vista, semaforo (Pedidos), orden, con_conteos, con_resumen (Pedidos), limit con ge=0 y le=200
    (su defecto de hoy) y offset hasta MAX_OFFSET."""
    from app.core.listados import MAX_OFFSET
    from main import app
    caminos = app.openapi()["paths"]
    esperados = {
        RUTA_PEC: ({"estado", "supplier_id", "search", "q", "estados", "vista", "semaforo", "orden", "con_conteos",
                    "con_resumen", "limit", "offset"}, 50),
        RUTA_REC: ({"estado", "pec_id", "search", "q", "estados", "vista", "orden", "con_conteos", "limit",
                    "offset"}, 50),
        RUTA_LISTA: ({"estado", "search", "q", "proveedor", "fecha_desde", "fecha_hasta", "orden", "con_conteos",
                      "limit", "offset"}, 200),
    }
    for ruta, (nombres, defecto) in esperados.items():
        parametros = {p["name"]: p for p in caminos[ruta]["get"]["parameters"]}
        assert set(parametros) == nombres, (ruta, sorted(parametros))
        limite = parametros["limit"]["schema"]
        assert (limite["default"], limite["minimum"], limite["maximum"]) == (defecto, 0, 200), ruta
        assert parametros["offset"]["schema"]["maximum"] == MAX_OFFSET, ruta
        assert "kpi" not in parametros


# ─── 5) Sin los parámetros nuevos, cada lista responde como hoy (R5) ─────────────────────────────────────────────────

def _hoy_pec(db, estado=None, supplier_id=None, search=None, limit=50, offset=0):
    """Copia congelada de list_pec de 6f2accc (antes de T12), con el _pec_dict de hoy."""
    from app.api.v1.erp_compras import _pec_dict
    from app.core.busqueda import productos_ilike
    q = db.query(PurchaseOrderFull)
    if estado:
        q = q.filter(PurchaseOrderFull.estado == estado)
    if supplier_id:
        q = q.filter(PurchaseOrderFull.supplier_id == supplier_id)
    if search:
        like = f"%{search}%"
        q = q.filter(PurchaseOrderFull.numero.ilike(like) | PurchaseOrderFull.supplier_name.ilike(like)
                     | PurchaseOrderFull.ven_numero.ilike(like) | productos_ilike(PurchaseOrderFull.productos, like))
    total = q.count()
    items = q.order_by(PurchaseOrderFull.created_at.desc()).offset(offset).limit(limit).all()
    return {"status": "success", "total": total, "data": [_pec_dict(p) for p in items]}


def _hoy_recepciones(db, estado=None, pec_id=None, limit=50, offset=0):
    """Copia congelada de list_recepciones de 6f2accc."""
    from app.api.v1.erp_compras import _gr_dict
    q = db.query(GoodsReceipt)
    if estado:
        q = q.filter(GoodsReceipt.estado == estado)
    if pec_id:
        q = q.filter(GoodsReceipt.pec_id == pec_id)
    total = q.count()
    items = q.order_by(GoodsReceipt.created_at.desc()).offset(offset).limit(limit).all()
    return {"status": "success", "total": total, "data": [_gr_dict(g, db) for g in items]}


def _hoy_lista(db, estado=None, search=None, proveedor=None, fecha_desde=None, fecha_hasta=None, limit=200):
    """Copia congelada del filtro y el orden de list_lista_compras de 6f2accc, sobre la lista ya sincronizada."""
    from app.api.v1.erp_compras import _load_lista_compras, _sin_items_de_pedidos_cancelados
    filtrados = []
    for it in _sin_items_de_pedidos_cancelados(db, _load_lista_compras(db)):
        if estado:
            if it.get("estado") != estado:
                continue
        elif it.get("estado") == "DESCARTADO":
            continue
        if proveedor and proveedor.lower() not in (it.get("proveedor") or "").lower():
            continue
        if search:
            texto = search.lower()
            if not any(texto in (it.get(c) or "").lower() for c in ("producto", "pven_numero", "pec_numero", "notas",
                                                                     "proveedor")):
                continue
        fecha = (it.get("fecha") or "")[:10]
        if fecha_desde and fecha and fecha < fecha_desde:
            continue
        if fecha_hasta and fecha and fecha > fecha_hasta:
            continue
        filtrados.append(it)
    filtrados.sort(key=lambda x: x.get("id", 0), reverse=True)
    return {"status": "success", "data": filtrados[:limit], "total": len(filtrados)}


def _como_hoy(app_client, db, token, ruta, hoy, **params):
    nuevo = _get(app_client, token, ruta, **params)
    db.expire_all()
    esperado = jsonable_encoder(hoy(db, **params))
    assert set(nuevo) == set(esperado), (ruta, params, set(nuevo))
    assert {k: v for k, v in nuevo.items() if k != "data"} == {k: v for k, v in esperado.items() if k != "data"}, (
        ruta, params)
    assert _ids(nuevo) == _ids(esperado), (ruta, params)
    assert nuevo["data"] == esperado["data"], (ruta, params)


def test_sin_los_parametros_nuevos_cada_lista_responde_como_hoy(app_client, db, admin_token, supplier):
    """R5: con solo los parámetros de hoy cada lista responde lo mismo que la copia congelada de 6f2accc: las mismas
    claves, el mismo total, las mismas filas en el mismo orden con los mismos valores. La Lista de compras suma una sola
    clave, 'total' (el contrato {status, total, data} de TABLA-api que pide el brief); sus filas y su orden no cambian."""
    from app.api.v1.erp_compras import _load_lista_compras, _save_lista_compras
    f = _Fabrica(db)
    a = f.pec("EMITIDO", _dia(-2), supplier_id=supplier.id)
    f.pec("RECIBIDA", _dia(-2), supplier_id=supplier.id)
    f.pec("CANCELADO", None)
    f.pec("BORRADOR", _dia(5), ven_numero=f"PV-{f.sufijo}")
    for estado in ("BORRADOR", "COMPLETADA", "CANCELADA"):
        f.recepcion(estado, a)
    s = f.sufijo
    for params in ({"search": s}, {"search": s, "estado": "EMITIDO"}, {"search": s, "limit": 2, "offset": 1},
                   {"supplier_id": supplier.id}, {"search": s, "limit": 0}, {"search": f"PV-{s}"}):
        _como_hoy(app_client, db, admin_token, RUTA_PEC, _hoy_pec, **params)
    for params in ({"pec_id": a.id}, {"pec_id": a.id, "estado": "COMPLETADA"}, {"pec_id": a.id, "limit": 1,
                                                                                "offset": 1}):
        _como_hoy(app_client, db, admin_token, RUTA_REC, _hoy_recepciones, **params)
    original = _load_lista_compras(db)
    desde = max([it.get("id", 0) for it in original if isinstance(it.get("id"), int)], default=0) + 1000
    try:
        _save_lista_compras(db, original + _items_de_prueba(s, desde))
        for params in ({"search": s}, {"search": s, "estado": "PENDIENTE"}, {"search": s, "limit": 2},
                       {"search": s, "proveedor": "alfa"}, {"search": s, "fecha_desde": "2026-01-02"}, {}):
            _como_hoy(app_client, db, admin_token, RUTA_LISTA, _hoy_lista, **params)
            assert set(_get(app_client, admin_token, RUTA_LISTA, **params)) == {"status", "data", "total"}
    finally:
        _save_lista_compras(db, original)
