"""B4 T6A (TABLA-hub-ventas puntos 2 y 3 y el servidor de KANBAN-hub-ventas; R5, R6, R8, R21; C4, C5, C7, C8, C14;
RP2, RP8 a RP13, RP20, RP83; D34, D37): GET /api/v1/ventas/hub/documentos (app/api/v1/ventas_hub.py).

Se corre SOLO con el runner de ROLLBACK (python tests/rollback_runner.py test_hub_ventas_listado): cada prueba va en una
transaccion que se revierte. erp_test ya tiene datos: cada prueba busca por un sufijo unico (q) o compara contra el
servidor sobre los mismos datos. Sin parametrize (el runner no lo soporta): las variantes van en un bucle. La paridad
Python↔JS es de T2 (test_paridad_reglas_ventas.py); las pruebas de /ventas/flujo estan en test_flujo_ventas.py.
"""
import uuid
from datetime import timedelta

from sqlalchemy import text

from app.models.confirmation import SeguimientoConfirmacion
from app.models.customers import Customer
from app.models.erp_documents import CustomerRequest, SaleOrder, SalesQuotation

RUTA = "/api/v1/ventas/hub/documentos"
RUTA_FLUJO = "/api/v1/ventas/flujo"
UN_MINUTO = timedelta(minutes=1)
PESTANAS = ("todos", "no_resueltos", "sc", "cot", "ven", "acciones_tomadas")
GRUPOS = ("ATRASADO", "NO_RESUELTO", "ACCION_TOMADA", "CERRADO")
# Lo que cada fila agrega a _sc_dict, _cot_dict o _ven_dict (R6, C14).
CLAVES_DE_FILA = {"tipo", "resolucion", "dias_sin_mov", "dias_creado", "seguimiento_estado", "cambios_cliente"}


def _ahora():
    from app.core.fechas import ahora_utc
    return ahora_utc()


def _dias(n):
    return timedelta(days=n)


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _dias_de_alerta(db, sc=2, cot=2, ven=2):
    """RP83: los dias de alerta se escriben con admin_config.guardar_config, dentro de la transaccion revertida."""
    from app.core.admin_config import guardar_config
    guardar_config(db, {"alerta_sc_dias": sc, "alerta_cot_dias": cot, "alerta_ven_dias": ven})
    db.commit()


class _Fabrica:
    """Documentos de prueba con un sufijo unico (en el numero y en el cliente) y fechas fijas:
    created_at = updated_at = ahora − hace. Un db.add por objeto."""

    def __init__(self, db, ahora):
        self.db, self.ahora = db, ahora
        self.sufijo = uuid.uuid4().hex[:8].upper()
        self.n = 0

    def _numero(self, prefijo):
        self.n += 1
        return f"{prefijo}{self.sufijo}{self.n:02d}"

    def _guardar(self, objeto):
        self.db.add(objeto)
        self.db.commit()
        return objeto

    def _fecha(self, hace):
        return self.ahora - (hace if hace is not None else timedelta(0))

    def sc(self, estado="BORRADOR", hace=None, **campos):
        t = self._fecha(hace)
        sin_tipo = "tipo_solicitud" in campos and campos["tipo_solicitud"] is None
        campos.setdefault("tipo_solicitud", "Cotizacion de Producto")
        if sin_tipo:
            campos.pop("tipo_solicitud")   # el default del modelo pisa un None explicito: se anula despues
        sc = self._guardar(CustomerRequest(numero=self._numero("SC-"), customer_name=f"HUB {self.sufijo}",
                                           estado=estado, created_at=t, updated_at=t, **campos))
        if sin_tipo:
            # Una SC vieja sin tipo (la columna admite NULL), con SQL directo para no tocar updated_at (onupdate).
            self.db.execute(text("UPDATE customer_requests SET tipo_solicitud = NULL WHERE id = :id"), {"id": sc.id})
            self.db.commit()
            self.db.refresh(sc)
            assert sc.tipo_solicitud is None and sc.updated_at == t
        return sc

    def cot(self, estado="BORRADOR", hace=None, sc=None, **campos):
        t = self._fecha(hace)
        return self._guardar(SalesQuotation(numero=self._numero("COT-"), customer_name=f"HUB {self.sufijo}",
                                            sc_id=sc.id if sc is not None else None,
                                            sc_numero=sc.numero if sc is not None else None,
                                            estado=estado, created_at=t, updated_at=t, **campos))

    def pven(self, estado="PENDIENTE_COMPRA", hace=None, sc=None, cot=None, **campos):
        t = self._fecha(hace)
        return self._guardar(SaleOrder(numero=self._numero("PV-"), customer_name=f"HUB {self.sufijo}",
                                       sc_id=sc.id if sc is not None else None,
                                       cot_id=cot.id if cot is not None else None, estado=estado,
                                       created_at=t, updated_at=t, **campos))

    def seguimiento(self, tipo, doc, estado):
        return self._guardar(SeguimientoConfirmacion(document_type=tipo, document_id=doc.id,
                                                     document_numero=doc.numero, estado=estado,
                                                     iniciado_at=self.ahora, ultimo_contacto_at=self.ahora))


def _hub(app_client, token, **params):
    resp = app_client.get(RUTA, params=params, headers=_auth(token))
    assert resp.status_code == 200, resp.text
    cuerpo = resp.json()
    assert cuerpo["status"] == "success"
    return cuerpo


def _error(app_client, token, **params):
    resp = app_client.get(RUTA, params=params, headers=_auth(token))
    assert resp.status_code == 422, (params, resp.status_code, resp.text)
    return resp.json()["detail"]


def _claves(data):
    return [(f["tipo"], f["id"]) for f in data]


def _clave(doc):
    tipo = {CustomerRequest: "SC", SalesQuotation: "COT", SaleOrder: "VEN"}[type(doc)]
    return tipo, doc.id


def _escenario(db, ahora):
    """Los 5 documentos de la prueba 1 de TABLA-hub-ventas (RP83: la COT BORRADOR de hoy es la COT vigente de la SC
    CONFIRMADA), con 2 dias de alerta en los tres tipos."""
    _dias_de_alerta(db)
    f = _Fabrica(db, ahora)
    f.producto = f"Tornillo{uuid.uuid4().hex[:10]}"
    d = {}
    d["sc_atrasada"] = f.sc("ASIGNADA", _dias(5))
    d["sc_confirmada"] = f.sc("CONFIRMADA", _dias(1), gate1_confirmed_at=ahora - _dias(1))
    d["cot"] = f.cot("BORRADOR", sc=d["sc_confirmada"], total_cop=100,
                     productos=[{"product_name": f.producto, "quantity": 1}])
    d["pven_entregado"] = f.pven("ENTREGADO", _dias(3), total_cop=300)
    d["pven_atrasado"] = f.pven("EN_PROCESO", _dias(10), total_cop=200)
    return f, d


def _orden_de_atencion(d):
    return [_clave(d["pven_atrasado"]), _clave(d["sc_atrasada"]), _clave(d["cot"]), _clave(d["sc_confirmada"]),
            _clave(d["pven_entregado"])]


# ─── 1) Orden «atención» ─────────────────────────────────────────────────────────────────────────────────────────────

def test_atencion_primero(app_client, db, admin_token):
    """Prueba 1: atrasados (el de mas dias sin movimiento primero), sin resolver, accion tomada y cerrados, con la
    resolucion de cada fila. Es el orden por defecto."""
    f, d = _escenario(db, _ahora())
    for params in ({"q": f.sufijo}, {"q": f.sufijo, "orden": "atencion"}):
        r = _hub(app_client, admin_token, **params)
        assert r["total"] == 5, params
        assert _claves(r["data"]) == _orden_de_atencion(d), params
        assert [x["resolucion"] for x in r["data"]] == ["ATRASADO", "ATRASADO", "NO_RESUELTO", "ACCION_TOMADA",
                                                        "CERRADO"]
        assert [x["dias_sin_mov"] for x in r["data"]] == [10, 5, 0, 1, 3]
        assert [x["dias_creado"] for x in r["data"]] == [10, 5, 0, 1, 3]
        assert [x["tipo"] for x in r["data"]] == ["VEN", "SC", "COT", "SC", "VEN"]


def test_atencion_frontera_estricta(app_client, db, admin_token, monkeypatch):
    """R8/RP2: atrasado es ESTRICTAMENTE mas de dias × 24 h sin movimiento; exactamente los dias no lo es. Dentro de
    atrasados y de sin resolver va primero el que lleva mas tiempo quieto."""
    from app.api.v1 import ventas_hub
    ahora = _ahora()
    monkeypatch.setattr(ventas_hub, "ahora_utc", lambda: ahora)
    _dias_de_alerta(db, sc=2, cot=3, ven=4)
    f = _Fabrica(db, ahora)
    justo = [f.sc("BORRADOR", _dias(2)), f.cot("ENVIADA", _dias(3)), f.pven("EN_TRANSITO", _dias(4))]
    pasado = [f.sc("BORRADOR", _dias(2) + UN_MINUTO), f.cot("ENVIADA", _dias(3) + UN_MINUTO),
              f.pven("EN_TRANSITO", _dias(4) + UN_MINUTO)]
    r = _hub(app_client, admin_token, q=f.sufijo, con_conteos=1)
    resolucion = {(x["tipo"], x["id"]): x["resolucion"] for x in r["data"]}
    assert {_clave(doc): resolucion[_clave(doc)] for doc in justo} == {_clave(doc): "NO_RESUELTO" for doc in justo}
    assert {_clave(doc): resolucion[_clave(doc)] for doc in pasado} == {_clave(doc): "ATRASADO" for doc in pasado}
    assert _claves(r["data"]) == [_clave(doc) for doc in reversed(pasado)] + [_clave(doc) for doc in reversed(justo)]
    assert r["conteos"]["grupos"] == {"ATRASADO": 3, "NO_RESUELTO": 3, "ACCION_TOMADA": 0, "CERRADO": 0}


# ─── 2) Paginación y total ───────────────────────────────────────────────────────────────────────────────────────────

def test_paginacion_y_total(app_client, db, admin_token):
    f, d = _escenario(db, _ahora())
    esperado = _orden_de_atencion(d)
    r = _hub(app_client, admin_token, q=f.sufijo, limit=2, offset=2)
    assert r["total"] == 5
    assert _claves(r["data"]) == esperado[2:4]
    r = _hub(app_client, admin_token, q=f.sufijo, limit=2, offset=4)
    assert _claves(r["data"]) == esperado[4:]
    # RP10: limit=0 trae solo el total (las columnas plegadas del tablero).
    r = _hub(app_client, admin_token, q=f.sufijo, limit=0)
    assert r["total"] == 5 and r["data"] == []
    # Sin limit: 25 por pagina (R6).
    todo = _hub(app_client, admin_token)
    assert len(todo["data"]) == min(25, todo["total"])


# ─── 3) Conteos de las pestañas y de los separadores ─────────────────────────────────────────────────────────────────

def test_conteos_de_pestanas_y_grupos(app_client, db, admin_token):
    """Prueba 3 con R6: conteos.pestanas lleva q, estados y paso pero NO vista, semaforo ni columna; conteos.grupos
    lleva todos los filtros. La respuesta no trae 'semaforo' ni 'resumen' (salen de /ventas/flujo y /ventas/stats)."""
    f, d = _escenario(db, _ahora())
    r = _hub(app_client, admin_token, q=f.sufijo, con_conteos=1)
    pestanas = {"todos": 5, "no_resueltos": 3, "sc": 2, "cot": 1, "ven": 2, "acciones_tomadas": 2}
    assert r["conteos"]["pestanas"] == pestanas
    assert r["conteos"]["grupos"] == {"ATRASADO": 2, "NO_RESUELTO": 1, "ACCION_TOMADA": 1, "CERRADO": 1}
    assert "semaforo" not in r and "resumen" not in r
    assert set(r) == {"status", "total", "data", "conteos"}
    # Ni la vista, ni el semaforo, ni la columna cambian las pestañas; los grupos si siguen esos filtros.
    casos = [
        ({"vista": "cot"}, 1, {"ATRASADO": 0, "NO_RESUELTO": 1, "ACCION_TOMADA": 0, "CERRADO": 0}),
        ({"vista": "ven"}, 2, {"ATRASADO": 1, "NO_RESUELTO": 0, "ACCION_TOMADA": 0, "CERRADO": 1}),
        ({"vista": "no_resueltos", "semaforo": "atrasados"}, 2,
         {"ATRASADO": 2, "NO_RESUELTO": 0, "ACCION_TOMADA": 0, "CERRADO": 0}),
        ({"semaforo": "no_resueltos"}, 3, {"ATRASADO": 2, "NO_RESUELTO": 1, "ACCION_TOMADA": 0, "CERRADO": 0}),
        ({"vista": "acciones_tomadas"}, 2, {"ATRASADO": 0, "NO_RESUELTO": 0, "ACCION_TOMADA": 1, "CERRADO": 1}),
        ({"columna": "Acción Tomada"}, 2, {"ATRASADO": 0, "NO_RESUELTO": 0, "ACCION_TOMADA": 1, "CERRADO": 1}),
    ]
    for extra, total, grupos in casos:
        r2 = _hub(app_client, admin_token, q=f.sufijo, con_conteos=1, **extra)
        assert r2["conteos"]["pestanas"] == pestanas, extra
        assert r2["total"] == total, extra
        assert r2["conteos"]["grupos"] == grupos, extra
    # Los estados y el paso SI cuentan en las pestañas.
    r3 = _hub(app_client, admin_token, q=f.sufijo, con_conteos=1, estados="VEN:ENTREGADO")
    assert r3["conteos"]["pestanas"] == {"todos": 1, "no_resueltos": 0, "sc": 0, "cot": 0, "ven": 1,
                                         "acciones_tomadas": 1}
    r4 = _hub(app_client, admin_token, q=f.sufijo, con_conteos=1, paso="COT")
    assert r4["conteos"]["pestanas"] == {"todos": 1, "no_resueltos": 1, "sc": 0, "cot": 1, "ven": 0,
                                         "acciones_tomadas": 0}
    # Sin con_conteos no hay conteos (la respuesta de una lista: {status, total, data}).
    assert set(_hub(app_client, admin_token, q=f.sufijo)) == {"status", "total", "data"}


# ─── 4) Filtros ──────────────────────────────────────────────────────────────────────────────────────────────────────

def test_filtros_vista_semaforo_estados_q_y_paso(app_client, db, admin_token):
    f, d = _escenario(db, _ahora())
    k = {nombre: _clave(doc) for nombre, doc in d.items()}

    def claves(**params):
        return _claves(_hub(app_client, admin_token, q=f.sufijo, **params)["data"])

    assert claves(vista="no_resueltos", semaforo="atrasados") == [k["pven_atrasado"], k["sc_atrasada"]]
    assert claves(semaforo="atrasados") == [k["pven_atrasado"], k["sc_atrasada"]]
    assert claves(vista="no_resueltos") == [k["pven_atrasado"], k["sc_atrasada"], k["cot"]]
    assert claves(vista="acciones_tomadas") == [k["sc_confirmada"], k["pven_entregado"]]
    assert claves(vista="sc") == [k["sc_atrasada"], k["sc_confirmada"]]
    assert claves(vista="cot") == [k["cot"]]
    assert claves(vista="ven") == [k["pven_atrasado"], k["pven_entregado"]]
    assert claves(vista="todos") == _orden_de_atencion(d)
    # r1 (M1): semaforo=todos es «sin filtro», como vista=todos (el frontend lo manda al quitar el filtro o con «Ver
    # todo», y la sesion lo puede restaurar).
    assert claves(semaforo="todos") == _orden_de_atencion(d)
    assert claves(semaforo="todos", vista="no_resueltos") == claves(vista="no_resueltos")
    assert claves(estados="VEN:ENTREGADO") == [k["pven_entregado"]]
    assert claves(estados="SC:ASIGNADA, VEN:EN_PROCESO") == [k["pven_atrasado"], k["sc_atrasada"]]
    assert claves(estados="PVEN:EN_PROCESO") == [k["pven_atrasado"]]   # PVEN es alias de VEN
    assert claves(estados="SC:CANCELADA") == []
    # El paso del diagrama (cond_paso): cada documento cae en un solo paso. La SC confirmada tiene su COT: no es «SC».
    assert claves(paso="SC") == [k["sc_atrasada"]]
    assert claves(paso="COT") == [k["cot"]]
    assert claves(paso="PVEN") == [k["pven_atrasado"]]
    assert claves(paso="ENTREGADO") == [k["pven_entregado"]]
    assert claves(paso="FACTURADO") == []
    assert claves(paso="COT", vista="sc") == []
    # q por el producto de una linea de la COT (productos_ilike) trae solo la COT.
    r = _hub(app_client, admin_token, q=f.producto)
    assert _claves(r["data"]) == [k["cot"]]
    # q con espacios en los bordes se recorta (texto_busqueda); en blanco no filtra.
    assert _claves(_hub(app_client, admin_token, q=f"  {f.producto}  ")["data"]) == [k["cot"]]
    assert _hub(app_client, admin_token, q="   ", limit=0)["total"] == _hub(app_client, admin_token, limit=0)["total"]
    # Revisión de T6A r1: un tabulador o un salto de linea EN MEDIO (texto pegado) se busca como un espacio, no da 422.
    for interior in ("\t", "\r\n", "\x85"):
        con_control = _hub(app_client, admin_token, q=f"{f.producto}{interior}x", limit=0)
        con_espacio = _hub(app_client, admin_token, q=f"{f.producto} x", limit=0)
        assert con_control["total"] == con_espacio["total"], repr(interior)


def test_busqueda_por_asesor_y_numeros_de_origen(app_client, db, admin_token):
    """q mira, en cada tipo, el numero, el cliente, el asesor y los numeros de origen (sc_numero, cot_numero)."""
    ahora = _ahora()
    f = _Fabrica(db, ahora)
    marca = uuid.uuid4().hex[:10]
    sc = f.sc("ASIGNADA", advisor_name=f"Asesor{marca}")
    cot = f.cot("BORRADOR", sc=sc, cotizador=f"Cotizador{marca}")
    pven = f.pven("EN_PROCESO", sc=sc, cot=cot, cot_numero=cot.numero, sc_numero=sc.numero)
    assert set(_claves(_hub(app_client, admin_token, q=f"Asesor{marca}")["data"])) == {_clave(sc)}
    # El asesor del pedido es el de su COT (H4): la busqueda por el cotizador lo encuentra.
    assert set(_claves(_hub(app_client, admin_token, q=f"Cotizador{marca}")["data"])) == {_clave(cot), _clave(pven)}
    assert set(_claves(_hub(app_client, admin_token, q=cot.numero)["data"])) == {_clave(cot), _clave(pven)}
    assert set(_claves(_hub(app_client, admin_token, q=sc.numero)["data"])) == {_clave(sc), _clave(cot), _clave(pven)}


def test_columna_del_tablero(app_client, db, admin_token):
    """KANBAN-hub-ventas (C4, C7): columna=<clave> con expr_columna_hub; Cancelado trae CANCELADO, CANCELADA, RECHAZADA
    y DEVUELTO_TOTAL. Dentro de una columna abierta va primero lo atrasado. RP10: columna=Cancelado&limit=0."""
    ahora = _ahora()
    _dias_de_alerta(db)
    f = _Fabrica(db, ahora)
    sc_borrador_viejo = f.sc("BORRADOR", _dias(5))
    sc_confirmada_sin_cot = f.sc("CONFIRMADA", _dias(2))
    sc_asignada_con_cot = f.sc("ASIGNADA", _dias(3))
    cot_borrador = f.cot("BORRADOR", _dias(1), sc=sc_asignada_con_cot)
    pven_proceso = f.pven("EN_PROCESO", _dias(1))
    pven_entregado = f.pven("ENTREGADO", _dias(1))
    pven_cancelado = f.pven("CANCELADO", _dias(2))
    pven_devuelto = f.pven("DEVUELTO_TOTAL", _dias(3))
    cot_rechazada = f.cot("RECHAZADA", _dias(4))
    sc_cancelada = f.sc("CANCELADA", _dias(5))

    def columna(clave, **params):
        return _hub(app_client, admin_token, q=f.sufijo, columna=clave, **params)

    cancelado = columna("Cancelado", orden="-creado")
    assert _claves(cancelado["data"]) == [_clave(x) for x in (pven_cancelado, pven_devuelto, cot_rechazada,
                                                              sc_cancelada)]
    plegada = columna("Cancelado", limit=0)
    assert plegada["data"] == [] and plegada["total"] == 4
    assert _claves(columna("No Resuelto")["data"]) == [_clave(x) for x in (sc_borrador_viejo, sc_confirmada_sin_cot,
                                                                           cot_borrador)]
    assert _claves(columna("No Resuelto")["data"])[0] == _clave(sc_borrador_viejo)   # lo atrasado primero
    assert columna("No Resuelto")["data"][0]["resolucion"] == "ATRASADO"
    assert _claves(columna("En Gestión")["data"]) == [_clave(pven_proceso)]
    assert _claves(columna("Acción Tomada")["data"]) == [_clave(sc_asignada_con_cot), _clave(pven_entregado)]
    # La columna se combina con el resto del estado (vista, semaforo, estados).
    assert _claves(columna("Cancelado", vista="ven", orden="-creado")["data"]) == [_clave(pven_cancelado),
                                                                                  _clave(pven_devuelto)]
    assert _claves(columna("No Resuelto", semaforo="atrasados")["data"]) == [_clave(sc_borrador_viejo)]


# ─── 5) Hidratación de las filas ─────────────────────────────────────────────────────────────────────────────────────

def test_hidratacion_de_las_filas(app_client, db, admin_token):
    """Prueba 5: cada fila trae su _sc_dict / _cot_dict / _ven_dict, resolucion, dias_sin_mov, dias_creado,
    seguimiento_estado y cambios_cliente (C14). Las SC traen las listas ligeras cotizaciones y pedidos_venta (por sc_id
    y por el cot_id de sus COT); las COT, pedidos_venta (D37); los pedidos, el asesor de H4."""
    from app.api.v1.erp_ventas import _cot_dict, _sc_dict, _ven_dict
    ahora = _ahora()
    f = _Fabrica(db, ahora)
    sc1 = f.sc("ASIGNADA", _dias(1), advisor_name=f"Beto {f.sufijo}", cambios_cliente_at=ahora,
               cambios_cliente_tipo="CAMBIOS", cambios_cliente_comentario="Son 8, no 6")
    cot_a = f.cot("BORRADOR", sc=sc1, cotizador=f"Ana {f.sufijo}")
    cot_b = f.cot("RECHAZADA", sc=sc1)
    pven_a = f.pven("EN_PROCESO", sc=sc1, cot=cot_a)
    pven_b = f.pven("PENDIENTE_COMPRA", cot=cot_b)          # solo por el cot_id de una COT de la SC
    pven_c = f.pven("EN_PROCESO", sc=sc1)                    # sin COT: el asesor es el de la SC
    sc_pendiente = f.sc("PENDIENTE_CONFIRMACION")
    f.seguimiento("SC", sc_pendiente, "AGOTADO")
    cot_pendiente = f.cot("PENDIENTE_CONFIRMACION")
    f.seguimiento("COT", cot_pendiente, "DETENIDO")
    cot_cambios = f.cot("BORRADOR", cambios_cliente_at=ahora, cambios_cliente_tipo="NO_LA_NECESITA")

    filas = {(x["tipo"], x["id"]): x for x in _hub(app_client, admin_token, q=f.sufijo, limit=50)["data"]}
    assert set(filas) == {_clave(x) for x in (sc1, cot_a, cot_b, pven_a, pven_b, pven_c, sc_pendiente,
                                              cot_pendiente, cot_cambios)}
    for (tipo, _), fila in filas.items():
        assert CLAVES_DE_FILA <= set(fila), (tipo, set(fila))
    ligera = lambda doc: {"id": doc.id, "numero": doc.numero, "estado": doc.estado}

    fila_sc = filas[_clave(sc1)]
    db.refresh(sc1)
    assert set(_sc_dict(sc1)) | CLAVES_DE_FILA | {"cotizaciones", "pedidos_venta"} == set(fila_sc)
    assert fila_sc["cotizaciones"] == [ligera(cot_a), ligera(cot_b)]
    assert fila_sc["pedidos_venta"] == [ligera(pven_a), ligera(pven_b), ligera(pven_c)]
    assert fila_sc["cambios_cliente"] == {"at": fila_sc["cambios_cliente"]["at"], "tipo": "CAMBIOS",
                                          "comentario": "Son 8, no 6"}
    assert fila_sc["cambios_cliente"]["at"].endswith("Z")
    assert fila_sc["seguimiento_estado"] is None
    assert fila_sc["resolucion"] == "ACCION_TOMADA"   # tiene una COT activa

    fila_cot = filas[_clave(cot_a)]
    db.refresh(cot_a)
    assert set(_cot_dict(cot_a)) | CLAVES_DE_FILA | {"pedidos_venta"} == set(fila_cot)
    assert fila_cot["pedidos_venta"] == [ligera(pven_a)]
    assert filas[_clave(cot_b)]["pedidos_venta"] == [ligera(pven_b)]
    assert filas[_clave(cot_pendiente)]["pedidos_venta"] == []
    # RP2: la COT ya trae confirmacion_vigente (gate2); no hay una clave confirmacion_cliente.
    assert fila_cot["confirmacion_vigente"] is False and "confirmacion_cliente" not in fila_cot

    db.refresh(pven_a)
    assert set(_ven_dict(pven_a)) | CLAVES_DE_FILA | {"advisor_name"} == set(filas[_clave(pven_a)])
    assert filas[_clave(pven_a)]["advisor_name"] == f"Ana {f.sufijo}"     # H4: el cotizador de su COT
    assert filas[_clave(pven_c)]["advisor_name"] == f"Beto {f.sufijo}"    # sin COT: el asesor de su SC
    assert filas[_clave(pven_b)]["advisor_name"] is None
    assert filas[_clave(pven_a)]["cambios_cliente"] is None
    assert filas[_clave(pven_a)]["seguimiento_estado"] is None

    assert filas[_clave(sc_pendiente)]["seguimiento_estado"] == "AGOTADO"
    assert filas[_clave(cot_pendiente)]["seguimiento_estado"] == "DETENIDO"
    assert filas[_clave(cot_cambios)]["cambios_cliente"]["tipo"] == "NO_LA_NECESITA"
    assert filas[_clave(cot_cambios)]["seguimiento_estado"] is None


def test_soporte_fuera_y_tipo_nulo_dentro(app_client, db, admin_token):
    """R8 y RP11: las SC de Soporte Tecnico (por tipo o por el estado N/A_SOPORTE) no entran al Hub ni a sus conteos; una
    SC con tipo_solicitud NULL si (no es Soporte)."""
    f = _Fabrica(db, _ahora())
    sin_tipo = f.sc("BORRADOR", tipo_solicitud=None)
    normal = f.sc("BORRADOR")
    f.sc("BORRADOR", _dias(9), tipo_solicitud="Soporte Tecnico")
    f.sc("N/A_SOPORTE", _dias(9))
    r = _hub(app_client, admin_token, q=f.sufijo, con_conteos=1)
    assert set(_claves(r["data"])) == {_clave(sin_tipo), _clave(normal)}
    assert r["total"] == 2
    assert r["conteos"]["pestanas"]["sc"] == 2 and r["conteos"]["pestanas"]["todos"] == 2
    assert _hub(app_client, admin_token, q=f.sufijo, estados="SC:N/A_SOPORTE")["total"] == 0
    assert _hub(app_client, admin_token, q=f.sufijo, paso="SC")["total"] == 2


# ─── Orden por columna (R6: un clic en un titulo ordena TODA la tabla) y errores (R21) ───────────────────────────────

def test_orden_por_columna(app_client, db, admin_token):
    f, d = _escenario(db, _ahora())
    k = {nombre: _clave(doc) for nombre, doc in d.items()}

    def claves(orden):
        return _claves(_hub(app_client, admin_token, q=f.sufijo, orden=orden)["data"])

    scs_por_id = sorted([k["sc_atrasada"], k["sc_confirmada"]], key=lambda c: -c[1])
    assert claves("monto") == [k["cot"], k["pven_atrasado"], k["pven_entregado"]] + scs_por_id   # SC sin monto al final
    assert claves("-monto") == [k["pven_entregado"], k["pven_atrasado"], k["cot"]] + scs_por_id
    assert claves("tipo") == scs_por_id + [k["cot"]] + sorted([k["pven_atrasado"], k["pven_entregado"]],
                                                               key=lambda c: -c[1])
    # 'estado' ordena por la posicion en el flujo: SC (Asignada antes que Confirmada), COT y luego el pedido.
    assert claves("estado") == [k["sc_atrasada"], k["sc_confirmada"], k["cot"], k["pven_atrasado"],
                                k["pven_entregado"]]
    assert claves("-estado") == list(reversed(claves("estado")))
    assert claves("-creado") == [k["cot"], k["sc_confirmada"], k["pven_entregado"], k["sc_atrasada"],
                                 k["pven_atrasado"]]
    assert claves("creado") == list(reversed(claves("-creado")))
    assert claves("reciente") == claves("-creado")
    assert claves("sin_movimiento") == [k["pven_atrasado"], k["sc_atrasada"], k["pven_entregado"],
                                        k["sc_confirmada"], k["cot"]]
    for orden in ("numero", "-numero", "cliente", "-cliente", "asesor", "-asesor"):
        assert len(claves(orden)) == 5, orden


def test_errores_en_espanol(app_client, db, admin_token):
    """R5, RP9 y R21: los parametros de negocio se validan a mano y responden 422 con el texto exacto en español."""
    assert _error(app_client, admin_token, orden="hackeo") == "No se puede ordenar por «hackeo»."
    for orden in ("-atencion", "-reciente", "-sin_movimiento", "monto; drop table"):
        assert _error(app_client, admin_token, orden=orden) == f"No se puede ordenar por «{orden}».", orden
    assert _error(app_client, admin_token, vista="analisis") == "La vista «analisis» no existe en el Hub de Ventas."
    assert _error(app_client, admin_token, semaforo="acciones_tomadas") == (
        "El filtro del semáforo «acciones_tomadas» no existe: usa atrasados o no_resueltos.")
    assert _error(app_client, admin_token, paso="LISTA") == "El paso «LISTA» no existe en el flujo de Ventas."
    assert _error(app_client, admin_token, columna="Cerrado") == "La columna «Cerrado» no existe en el tablero del Hub."
    for malo in ("ASIGNADA", "XX:ASIGNADA", "SC:", ":ASIGNADA"):
        assert _error(app_client, admin_token, estados=malo) == (
            f"El estado «{malo}» no es válido: usa TIPO:ESTADO, con TIPO SC, COT o VEN (por ejemplo SC:ASIGNADA)."), malo
    muchos = ",".join(f"SC:E{i}" for i in range(21))
    assert _error(app_client, admin_token, estados=muchos) == "Puedes filtrar por 20 estados como máximo."
    # r1 (M13): un caracter de control en q o en los estados no llega al SQL (era un 500).
    control = "La búsqueda no puede llevar caracteres de control."
    assert _error(app_client, admin_token, q="\x00") == control
    assert _error(app_client, admin_token, q="tor\x00nillo") == control
    assert _error(app_client, admin_token, estados="SC:\x00") == control
    # r1 (M10): cada estado se valida contra los de su tipo (ETIQUETAS_ESTADO; los del pedido, heredados incluidos).
    for par, texto in (("SC:FOO", "El estado «FOO» no existe en SC."),
                       ("COT:ASIGNADA", "El estado «ASIGNADA» no existe en COT."),
                       ("VEN:ENTREGAD", "El estado «ENTREGAD» no existe en VEN."),
                       ("PVEN:ENTREGAD", "El estado «ENTREGAD» no existe en VEN."),
                       ("SC:ASIGNADA,VEN:FOO", "El estado «FOO» no existe en VEN.")):
        assert _error(app_client, admin_token, estados=par) == texto, par


def test_estados_conocidos_de_cada_tipo(app_client, admin_token):
    """r1 (M10): los estados de la SC y la COT son los de ETIQUETAS_ESTADO; los del pedido, los 18 de estados_pedido
    (los heredados de la tienda y de fase4 incluidos), que son tambien los de ETIQUETAS_ESTADO['VEN']."""
    from app.api.v1 import ventas_hub
    from app.core.textos_actividad import ETIQUETAS_ESTADO
    assert set(ventas_hub._ESTADOS_DEL_TIPO["VEN"]) == set(ETIQUETAS_ESTADO["VEN"])
    assert len(ventas_hub._ESTADOS_DEL_TIPO["VEN"]) == 18
    for tipo in ("SC", "COT"):
        assert set(ventas_hub._ESTADOS_DEL_TIPO[tipo]) == set(ETIQUETAS_ESTADO[tipo]), tipo
    pares = ",".join(["SC:COTIZADA", "SC:EN_ESPERA_CONFIRMACION", "COT:VENCIDA", "VEN:PAGADO", "VEN:PENDIENTE_ANTICIPO",
                      "VEN:PARCIALMENTE_ENTREGADO", "PVEN:DEVUELTO_TOTAL"])
    _hub(app_client, admin_token, estados=pares, limit=0)


def test_paginacion_fuera_de_rango_da_400_legible(app_client, admin_token):
    """r1 (M12, M14): un limit o un offset fuera de rango dan el 400 legible del manejador global ({status: 'error',
    message, errores}), nunca un 500. offset=10**20 llegaba al SQL y PostgreSQL respondia «bigint out of range»."""
    from app.core.listados import MAX_OFFSET
    from main import MENSAJE_DATOS_INVALIDOS
    for params in ({"limit": 201}, {"limit": -1}, {"offset": -1}, {"offset": 10 ** 20}, {"offset": MAX_OFFSET + 1}):
        resp = app_client.get(RUTA, params=params, headers=_auth(admin_token))
        assert resp.status_code == 400, (params, resp.status_code, resp.text)
        cuerpo = resp.json()
        assert cuerpo["status"] == "error" and cuerpo["message"] == MENSAJE_DATOS_INVALIDOS, (params, cuerpo)
        assert isinstance(cuerpo["errores"], list) and cuerpo["errores"], (params, cuerpo)
    # En el borde todavia responde (una pagina vacia, con el total de siempre).
    r = _hub(app_client, admin_token, offset=MAX_OFFSET, limit=1)
    assert r["data"] == [] and r["total"] == _hub(app_client, admin_token, limit=0)["total"]


def test_el_asesor_se_recorta_igual_en_sql_y_en_python(app_client, db, admin_token):
    """r1 (M7): el asesor del UNION (busqueda y orden) se limpia como _texto_o_none, que muestra la fila: str.strip()
    quita espacios, tabuladores, saltos de linea y los demas espacios de Unicode."""
    from sqlalchemy import literal, select
    from app.api.v1.erp_ventas import _texto_o_none
    from app.api.v1.ventas_hub import _ESPACIOS, _texto
    assert set(_ESPACIOS) == {chr(c) for c in range(0x110000) if chr(c).isspace()}
    muestras = ["\tAna\n", " Ana ", "\r\n", " Beto ", "Ana\x0b", "\x1cAna\x1f", "", "   ", "Ana Beto", "　",
                " Ana ", "\x85Ana"]
    for muestra in muestras:
        assert db.scalar(select(_texto(literal(muestra)))) == _texto_o_none(muestra), repr(muestra)
    # De punta a punta: un cotizador hecho solo de un tabulador y un salto de linea no cuenta (H4): el asesor del pedido
    # es el de su SC, en la fila y en la busqueda.
    f = _Fabrica(db, _ahora())
    marca = uuid.uuid4().hex[:10]
    sc = f.sc("ASIGNADA", advisor_name=f"Beto{marca}")
    cot = f.cot("BORRADOR", sc=sc, cotizador="\t\n")
    pven = f.pven("EN_PROCESO", sc=sc, cot=cot)
    filas = {(x["tipo"], x["id"]): x for x in _hub(app_client, admin_token, q=f"Beto{marca}")["data"]}
    assert set(filas) == {_clave(sc), _clave(pven)}
    assert filas[_clave(pven)]["advisor_name"] == f"Beto{marca}"


# ─── Rutas, roles y rendimiento ──────────────────────────────────────────────────────────────────────────────────────

def test_las_rutas_responden_y_no_chocan(app_client, admin_token, vendedor_token):
    """GET /ventas/hub/documentos y /ventas/flujo responden 200 a todos los roles del ERP (un asesor tambien) y 401 sin
    sesion; ninguna otra ruta de /api/v1/ventas las tapa: responde el router de ventas_hub (su forma y su tag)."""
    from main import app
    for token in (admin_token, vendedor_token):
        hub = app_client.get(RUTA, params={"limit": 1}, headers=_auth(token))
        assert hub.status_code == 200, hub.text
        assert hub.json()["status"] == "success" and isinstance(hub.json()["data"], list) and "total" in hub.json()
        flujo = app_client.get(RUTA_FLUJO, headers=_auth(token))
        assert flujo.status_code == 200, flujo.text
        assert set(flujo.json()["data"]["pasos"]) == {"SC", "COT", "PVEN", "ENTREGADO", "FACTURADO"}
    caminos = app.openapi()["paths"]
    for ruta in (RUTA, RUTA_FLUJO):
        assert app_client.get(ruta).status_code == 401, ruta
        assert caminos[ruta]["get"]["tags"] == ["Ventas Hub"], ruta


def test_mismo_numero_de_consultas_con_3_y_con_25_filas_por_tipo(app_client, db, admin_token, contador_sql):
    """RP20: la hidratacion son consultas IN con selectinload(customer), sin una por fila: con 3 y con 25 filas por tipo
    el endpoint hace el mismo numero de consultas, y nunca escribe."""
    ahora = _ahora()
    cliente = Customer(first_name="Hub", last_name=uuid.uuid4().hex[:8], email=f"hub-{uuid.uuid4().hex[:10]}@test.nebulae")
    db.add(cliente)
    db.commit()

    def crear(n):
        f = _Fabrica(db, ahora)
        for i in range(n):
            sc = f.sc("PENDIENTE_CONFIRMACION", customer_id=cliente.id, cambios_cliente_at=ahora,
                      cambios_cliente_tipo="CAMBIOS")
            cot = f.cot("PENDIENTE_CONFIRMACION", sc=sc, customer_id=cliente.id, cotizador="Ana")
            f.pven("EN_PROCESO", sc=sc, cot=cot, customer_id=cliente.id)
            if i == 0:
                f.seguimiento("SC", sc, "AGOTADO")
                f.seguimiento("COT", cot, "AGOTADO")
        return f.sufijo

    def medir(sufijo, filas):
        with contador_sql.ventana() as v:
            r = _hub(app_client, admin_token, q=sufijo, limit=100, con_conteos=1)
        assert len(r["data"]) == filas and r["total"] == filas
        assert v.commits == 0
        assert all(s.lstrip().upper().startswith("SELECT") for s in v.sentencias), v.sentencias
        return v.consultas

    pocas = medir(crear(3), 9)
    muchas = medir(crear(25), 75)
    assert pocas == muchas, (pocas, muchas)
    # Medido en T6A: 18 = la sesion (1) + dias de alerta (1) + pestañas y grupos (2) + total y pagina (2) + SC, COT y
    # pedidos con su ficha del cliente (6) + COT y pedidos ligeros (2) + seguimiento SC y COT (2) + asesores H4 (2).
    assert muchas <= 18, muchas


# ─── RP13: los números del Hub y del semáforo del flujo coinciden ────────────────────────────────────────────────────

def test_no_resueltos_de_la_pestana_igual_al_semaforo_del_flujo(app_client, db, admin_token):
    """RP13 (a): con datos propios y el token de admin, semaforo.no_resueltos de /ventas/flujo es igual a
    conteos.pestanas.no_resueltos del Hub (sobre todo el Hub, sin q). Ademas, los botones del semaforo filtran
    exactamente lo que cuenta el flujo: semaforo=atrasados y semaforo=no_resueltos dan sus totales."""
    _escenario(db, _ahora())
    flujo = app_client.get(RUTA_FLUJO, headers=_auth(admin_token))
    assert flujo.status_code == 200, flujo.text
    semaforo = flujo.json()["data"]["semaforo"]
    # r1 (M3): el semaforo del flujo trae, por lo menos, los del escenario (2 atrasados y 3 sin resolver).
    assert semaforo["atrasados"] >= 2
    assert semaforo["no_resueltos"] >= 3
    hub = _hub(app_client, admin_token, con_conteos=1, limit=0)
    assert hub["conteos"]["pestanas"]["no_resueltos"] == semaforo["no_resueltos"]
    assert _hub(app_client, admin_token, semaforo="no_resueltos", limit=0)["total"] == semaforo["no_resueltos"]
    assert _hub(app_client, admin_token, semaforo="atrasados", limit=0)["total"] == semaforo["atrasados"]
