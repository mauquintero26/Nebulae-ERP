"""B4 T6B (TABLA-listas-ventas puntos 1 a 4, KANBAN-ventas-listas puntos 1 y 2 y el punto 3 de TABLA-inventario visto desde
el servidor; R5, R8, R21; C3, C8, C9, C14, C19; RP3, RP8, RP9, RP11, RP12, RP15, RP19, RP20, RP22, RP89; D29, D34, D37,
D46): GET /api/v1/ventas/solicitudes, /cotizaciones y /pedidos paginadas en el servidor, con vistas, estados, orden
«atención», semáforo, conteos, resumen y las marcas de cada fila.

Se corre SOLO con el runner de ROLLBACK (python tests/rollback_runner.py test_listas_ventas_paginadas): cada prueba va en
una transaccion que se revierte. erp_test ya tiene datos: cada prueba busca por un sufijo unico (q) o, en con_resumen (que
no aplica la busqueda, RP19), compara la diferencia antes y despues de crear sus documentos, con el reloj fijo. Sin
parametrize: las variantes van en un bucle. La paridad con listas-ventas.js corre node (el patron de
test_paridad_reglas_ventas.py).
"""
import json
import shutil
import subprocess
import uuid
from datetime import timedelta, timezone
from pathlib import Path

import pytest
from fastapi.encoders import jsonable_encoder
from sqlalchemy import text

from app.core.busqueda import productos_ilike
from app.models.confirmation import SeguimientoConfirmacion
from app.models.customers import Customer
from app.models.erp_documents import CustomerRequest, SaleOrder, SalesQuotation

RUTAS = {"SC": "/api/v1/ventas/solicitudes", "COT": "/api/v1/ventas/cotizaciones", "VEN": "/api/v1/ventas/pedidos"}
UN_MINUTO = timedelta(minutes=1)
# Lo que cada fila agrega a lo de hoy (_sc_dict + cotizaciones, _cot_dict + pedidos_venta, _ven_dict + advisor_name):
# tipo (como las filas del Hub), las marcas de R8 y C14 y, en la SC, los pedidos ligeros de RP15.
ADITIVAS = {
    "SC": {"tipo", "pedidos_venta", "resolucion", "dias_sin_mov", "dias_creado", "seguimiento_estado"},
    "COT": {"tipo", "resolucion", "dias_sin_mov", "dias_creado", "seguimiento_estado"},
    "VEN": {"tipo", "resolucion", "dias_sin_mov", "dias_creado", "seguimiento_estado", "cambios_cliente"},
}
CONTROL = "La búsqueda no puede llevar caracteres de control."

_LIB = Path(__file__).resolve().parents[2] / "frontend" / "src" / "lib"


def _ahora():
    from app.core.fechas import ahora_utc
    return ahora_utc()


def _dias(n):
    return timedelta(days=n)


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _reloj(monkeypatch):
    """El reloj de las listas fijo (erp_ventas.ahora_utc): los conteos que dependen de la hora no cambian entre dos
    llamadas de la misma prueba."""
    from app.api.v1 import erp_ventas
    ahora = _ahora()
    monkeypatch.setattr(erp_ventas, "ahora_utc", lambda: ahora)
    return ahora


def _dias_de_alerta(db, sc=2, cot=2, ven=2):
    """RP83: los dias de alerta se escriben con admin_config.guardar_config, dentro de la transaccion revertida."""
    from app.core.admin_config import guardar_config
    guardar_config(db, {"alerta_sc_dias": sc, "alerta_cot_dias": cot, "alerta_ven_dias": ven})
    db.commit()


class _Fabrica:
    """Documentos de prueba con un sufijo unico (en el numero y en el cliente). created_at = updated_at = ahora − hace,
    menos `paso` por cada documento: asi dos documentos nunca empatan en created_at (el orden de hoy no tiene
    desempate). Un db.add por objeto."""

    def __init__(self, db, ahora):
        self.db, self.ahora = db, ahora
        self.sufijo = uuid.uuid4().hex[:8].upper()
        self.cliente = f"LV {self.sufijo}"
        self.n = 0
        self.paso = timedelta(milliseconds=1)

    def _siguiente(self, prefijo, hace):
        self.n += 1
        return f"{prefijo}{self.sufijo}{self.n:02d}", self.ahora - (hace or timedelta(0)) - self.paso * self.n

    def _guardar(self, objeto):
        self.db.add(objeto)
        self.db.commit()
        return objeto

    def sc(self, estado="BORRADOR", hace=None, **campos):
        numero, t = self._siguiente("SC-", hace)
        sin_tipo = "tipo_solicitud" in campos and campos["tipo_solicitud"] is None
        campos.setdefault("tipo_solicitud", "Cotizacion de Producto")
        if sin_tipo:
            campos.pop("tipo_solicitud")   # el default del modelo pisa un None explicito: se anula despues
        sc = self._guardar(CustomerRequest(numero=numero, customer_name=self.cliente, estado=estado,
                                           created_at=t, updated_at=t, **campos))
        if sin_tipo:
            # Una SC vieja sin tipo (la columna admite NULL), con SQL directo para no tocar updated_at (onupdate).
            self.db.execute(text("UPDATE customer_requests SET tipo_solicitud = NULL WHERE id = :id"), {"id": sc.id})
            self.db.commit()
            self.db.refresh(sc)
            assert sc.tipo_solicitud is None and sc.updated_at == t
        return sc

    def cot(self, estado="BORRADOR", hace=None, sc=None, **campos):
        numero, t = self._siguiente("COT-", hace)
        campos.setdefault("created_at", t)
        campos.setdefault("updated_at", t)
        return self._guardar(SalesQuotation(numero=numero, customer_name=self.cliente,
                                            sc_id=sc.id if sc is not None else None,
                                            sc_numero=sc.numero if sc is not None else None, estado=estado, **campos))

    def pven(self, estado="PENDIENTE_COMPRA", hace=None, sc=None, cot=None, **campos):
        numero, t = self._siguiente("PV-", hace)
        return self._guardar(SaleOrder(numero=numero, customer_name=self.cliente,
                                       sc_id=sc.id if sc is not None else None,
                                       cot_id=cot.id if cot is not None else None,
                                       cot_numero=cot.numero if cot is not None else None, estado=estado,
                                       created_at=t, updated_at=t, **campos))

    def seguimiento(self, tipo, doc, estado):
        return self._guardar(SeguimientoConfirmacion(document_type=tipo, document_id=doc.id,
                                                     document_numero=doc.numero, estado=estado,
                                                     iniciado_at=self.ahora, ultimo_contacto_at=self.ahora))


def _lista(app_client, token, tipo, **params):
    resp = app_client.get(RUTAS[tipo], params=params, headers=_auth(token))
    assert resp.status_code == 200, (tipo, params, resp.text)
    cuerpo = resp.json()
    assert cuerpo["status"] == "success"
    return cuerpo


def _ids(app_client, token, tipo, **params):
    return [f["id"] for f in _lista(app_client, token, tipo, **params)["data"]]


def _error(app_client, token, tipo, **params):
    resp = app_client.get(RUTAS[tipo], params=params, headers=_auth(token))
    assert resp.status_code == 422, (tipo, params, resp.status_code, resp.text)
    return resp.json()["detail"]


def _ligera(doc):
    return {"id": doc.id, "numero": doc.numero, "estado": doc.estado}


# ─── 1) Solicitudes: vistas, conteos y paginacion ────────────────────────────────────────────────────────────────────

def test_sc_vistas_conteos_y_paginacion(app_client, db, admin_token):
    """Prueba 1 de TABLA-listas-ventas (RP3, RP11): 3 activas (una con tipo_solicitud NULL, que no es Soporte), 1
    confirmada sin COT, 1 confirmada con COT, 1 cancelada y 1 de Soporte. con_conteos lleva la busqueda pero no la
    vista, los estados ni el semaforo (R5)."""
    f = _Fabrica(db, _ahora())
    activas = [f.sc("BORRADOR"), f.sc("ASIGNADA", tipo_solicitud=None), f.sc("PENDIENTE_CONFIRMACION")]
    sin_cot = f.sc("CONFIRMADA", gate1_confirmed_at=f.ahora)
    con_cot = f.sc("CONFIRMADA", gate1_confirmed_at=f.ahora)
    f.cot("BORRADOR", sc=con_cot)
    cancelada = f.sc("CANCELADA")
    soporte = f.sc("BORRADOR", tipo_solicitud="Soporte Tecnico")
    todas = activas + [sin_cot, con_cot, cancelada, soporte]

    r = _lista(app_client, admin_token, "SC", q=f.sufijo, vista="activas", con_conteos=1)
    assert r["total"] == 3 and {x["id"] for x in r["data"]} == {s.id for s in activas}
    conteos = {"activas": 3, "confirmadas": 2, "canceladas": 1, "soporte": 1}
    assert r["conteos"] == conteos
    for extra in ({}, {"vista": "soporte"}, {"estados": "CANCELADA"}, {"estado": "BORRADOR"},
                  {"semaforo": "atrasados"}):
        assert _lista(app_client, admin_token, "SC", q=f.sufijo, con_conteos=1, **extra)["conteos"] == conteos, extra

    vistas = {"confirmadas": [sin_cot, con_cot], "canceladas": [cancelada], "soporte": [soporte],
              "esperan_cotizacion": [sin_cot], "todas": todas, "todas_sin_soporte": todas[:-1]}
    for vista, docs in vistas.items():
        assert set(_ids(app_client, admin_token, "SC", q=f.sufijo, vista=vista)) == {d.id for d in docs}, vista
    # Sin vista, como hoy: todas.
    assert set(_ids(app_client, admin_token, "SC", q=f.sufijo)) == {d.id for d in todas}

    # Paginacion: limit=2&offset=2 de las 3 activas trae 1; limit=0 solo el total.
    r = _lista(app_client, admin_token, "SC", q=f.sufijo, vista="activas", limit=2, offset=2)
    assert r["total"] == 3 and len(r["data"]) == 1
    r = _lista(app_client, admin_token, "SC", q=f.sufijo, limit=0)
    assert r["total"] == 7 and r["data"] == []


def test_sc_todas_sin_soporte_reemplaza_al_parametro_sin_soporte(app_client, db, admin_token):
    """KANBAN-ventas-listas prueba 4 con RP11 y C8: el tablero pide vista=todas_sin_soporte; sin_soporte no existe (un
    sin_soporte=true se ignora y trae las dos)."""
    f = _Fabrica(db, _ahora())
    normal = f.sc("ASIGNADA")
    sin_tipo = f.sc("BORRADOR", tipo_solicitud=None)
    soporte = f.sc("BORRADOR", tipo_solicitud="Soporte Tecnico")
    por_estado = f.sc("N/A_SOPORTE")
    assert set(_ids(app_client, admin_token, "SC", q=f.sufijo, vista="todas_sin_soporte")) == {normal.id, sin_tipo.id}
    assert set(_ids(app_client, admin_token, "SC", q=f.sufijo, sin_soporte="true")) == {
        normal.id, sin_tipo.id, soporte.id, por_estado.id}
    assert set(_ids(app_client, admin_token, "SC", q=f.sufijo, vista="soporte")) == {soporte.id, por_estado.id}


# ─── 2) Solicitudes: con_resumen sobre todas (sin busqueda ni Soporte) ───────────────────────────────────────────────

def test_sc_resumen_sobre_todas_sin_busqueda_ni_soporte(app_client, db, admin_token, monkeypatch):
    """RP19 (3) y (4): con_resumen cuenta todas las solicitudes de la lista, sin vista, estados, semaforo ni busqueda, y
    sin Soporte. sin_atender es la de N8 (Nueva con mas de los dias de alerta sin cambios; estricto) y vencidas, las
    activas con la fecha de vencimiento pasada. Claves y orden de plan:5614."""
    ahora = _reloj(monkeypatch)
    _dias_de_alerta(db, sc=2)
    antes = _lista(app_client, admin_token, "SC", con_resumen=1, limit=0)["resumen"]
    f = _Fabrica(db, ahora)
    f.paso = timedelta(0)
    f.sc("BORRADOR", _dias(5))                                            # activa y sin atender
    f.sc("BORRADOR", _dias(2))                                            # justo los dias: no es sin atender
    f.sc("ASIGNADA", fecha_vencimiento=ahora - timedelta(hours=1))        # activa y vencida
    f.sc("ASIGNADA", fecha_vencimiento=ahora)                             # vence justo ahora: no esta vencida
    f.sc("PENDIENTE_CONFIRMACION", tipo_solicitud=None)                   # activa (tipo NULL no es Soporte)
    f.sc("CONFIRMADA", gate1_confirmed_at=ahora, fecha_vencimiento=ahora - _dias(1))   # espera COT; no es activa
    con_cot = f.sc("CONFIRMADA", gate1_confirmed_at=ahora)
    f.cot("BORRADOR", sc=con_cot)                                         # genero cotizacion
    f.sc("CANCELADA")
    f.sc("BORRADOR", _dias(5), tipo_solicitud="Soporte Tecnico")          # Soporte: no cuenta en nada
    f.sc("CONFIRMADA", tipo_solicitud="Soporte Tecnico")
    f.sc("N/A_SOPORTE")
    r = _lista(app_client, admin_token, "SC", con_resumen=1, limit=0)
    despues = r["resumen"]
    assert list(despues) == ["activas", "confirmadas", "canceladas", "total", "con_cot", "esperan_cot", "sin_atender",
                             "vencidas"]
    assert {k: despues[k] - antes[k] for k in despues} == {
        "activas": 5, "confirmadas": 2, "canceladas": 1, "total": 8, "con_cot": 1, "esperan_cot": 1,
        "sin_atender": 1, "vencidas": 1}
    for extra in ({"q": f.sufijo}, {"search": f"nada-{f.sufijo}"}, {"vista": "soporte"}, {"estados": "BORRADOR"},
                  {"semaforo": "atrasados"}, {"estado": "CANCELADA"}):
        assert _lista(app_client, admin_token, "SC", con_resumen=1, limit=0, **extra)["resumen"] == despues, extra
    # Sin con_resumen no hay resumen (la respuesta de hoy).
    assert set(_lista(app_client, admin_token, "SC", q=f.sufijo)) == {"status", "total", "data"}


# ─── 3) Solicitudes: las filas traen cotizaciones, pedidos y chips ───────────────────────────────────────────────────

def test_sc_filas_traen_cotizaciones_pedidos_y_chips(app_client, db, admin_token):
    """RP15 (5) y D37: cada SC trae sus pedidos ligeros por sc_id y por el cot_id de CUALQUIERA de sus COT (como
    get_solicitud y el Hub), en una consulta IN. C14: seguimiento_estado (estados_para_alertas, RP12.6) y cambios_cliente
    por fila. R8: resolucion, dias_sin_mov y dias_creado del servidor."""
    from app.api.v1.erp_ventas import _sc_dict
    f = _Fabrica(db, _ahora())
    sc1 = f.sc("ASIGNADA", _dias(1), cambios_cliente_at=f.ahora, cambios_cliente_tipo="CAMBIOS",
               cambios_cliente_comentario="Son 8, no 6")
    cot_a = f.cot("BORRADOR", sc=sc1)
    cot_b = f.cot("RECHAZADA", sc=sc1)
    pven_a = f.pven("EN_PROCESO", sc=sc1, cot=cot_a)
    pven_b = f.pven("PENDIENTE_COMPRA", cot=cot_b)          # solo por el cot_id de una COT (rechazada) de la SC
    pven_c = f.pven("CANCELADO", sc=sc1)
    agotada = f.sc("PENDIENTE_CONFIRMACION")
    f.seguimiento("SC", agotada, "AGOTADO")
    detenida = f.sc("PENDIENTE_CONFIRMACION")
    f.seguimiento("SC", detenida, "DETENIDO")
    sola = f.sc("BORRADOR", _dias(3))
    solo_pedido = f.sc("CONFIRMADA", gate1_confirmed_at=f.ahora)
    f.pven("EN_PROCESO", sc=solo_pedido)                     # D16: un pedido vigente sin COT la deja resuelta

    filas = {x["id"]: x for x in _lista(app_client, admin_token, "SC", q=f.sufijo)["data"]}
    assert set(filas) == {sc1.id, agotada.id, detenida.id, sola.id, solo_pedido.id}
    fila = filas[sc1.id]
    db.expire_all()
    assert set(fila) == set(_sc_dict(sc1)) | {"cotizaciones"} | ADITIVAS["SC"]
    assert fila["tipo"] == "SC"
    assert fila["cotizaciones"] == [_ligera(cot_a), _ligera(cot_b)]
    assert fila["pedidos_venta"] == [_ligera(pven_a), _ligera(pven_b), _ligera(pven_c)]
    assert fila["cambios_cliente"]["tipo"] == "CAMBIOS" and fila["cambios_cliente"]["at"].endswith("Z")
    assert (fila["resolucion"], fila["dias_sin_mov"], fila["dias_creado"]) == ("ACCION_TOMADA", 1, 1)
    assert fila["seguimiento_estado"] is None
    assert filas[agotada.id]["seguimiento_estado"] == "AGOTADO"
    assert filas[detenida.id]["seguimiento_estado"] == "DETENIDO"
    assert (filas[sola.id]["cotizaciones"], filas[sola.id]["pedidos_venta"]) == ([], [])
    assert filas[sola.id]["cambios_cliente"] is None
    assert filas[solo_pedido.id]["resolucion"] == "ACCION_TOMADA"
    assert [p["estado"] for p in filas[solo_pedido.id]["pedidos_venta"]] == ["EN_PROCESO"]


# ─── 4) Solicitudes: estados, orden y semaforo ───────────────────────────────────────────────────────────────────────

def test_sc_estados_orden_y_semaforo(app_client, db, admin_token):
    """R5, R8 (atencion_primero_listas = «Sí; con un clic en una columna ordenas como quieras»), D29 y D46: estados en
    CSV; 'estado' sigue igual (un valor); el orden por defecto sigue siendo el mas reciente; 'atencion' = atrasados, sin
    resolver, accion tomada y cerrados; semaforo=atrasados y semaforo=todos."""
    _dias_de_alerta(db)
    f = _Fabrica(db, _ahora())
    atrasada = f.sc("ASIGNADA", _dias(5))
    confirmada = f.sc("CONFIRMADA", _dias(1), gate1_confirmed_at=f.ahora - _dias(1))
    nueva = f.sc("BORRADOR")
    con_cot = f.sc("ASIGNADA", _dias(3))
    f.cot("BORRADOR", _dias(3), sc=con_cot)
    cancelada = f.sc("CANCELADA", _dias(4))

    def ids(**params):
        return _ids(app_client, admin_token, "SC", q=f.sufijo, **params)

    r = _lista(app_client, admin_token, "SC", q=f.sufijo, orden="atencion")
    assert [x["id"] for x in r["data"]] == [atrasada.id, confirmada.id, nueva.id, con_cot.id, cancelada.id]
    assert [x["resolucion"] for x in r["data"]] == ["ATRASADO", "NO_RESUELTO", "NO_RESUELTO", "ACCION_TOMADA",
                                                    "CERRADO"]
    assert [x["dias_sin_mov"] for x in r["data"]] == [5, 1, 0, 3, 4]
    # D29: sin orden, el mas reciente primero (como hoy), igual que 'reciente' y '-creado'.
    por_creacion = [nueva.id, confirmada.id, con_cot.id, cancelada.id, atrasada.id]
    assert ids() == ids(orden="reciente") == ids(orden="-creado") == por_creacion
    assert ids(orden="creado") == list(reversed(por_creacion))
    assert ids(orden="sin_movimiento") == [atrasada.id, cancelada.id, con_cot.id, confirmada.id, nueva.id]
    # 'estado' sigue el flujo de la SC (ETIQUETAS_ESTADO): Nueva, Asignada, ..., Confirmada, ..., Cancelada.
    assert ids(orden="estado") == [nueva.id, con_cot.id, atrasada.id, confirmada.id, cancelada.id]
    for orden in ("numero", "-numero", "tipo", "-tipo", "cliente", "asesor", "-asesor", "vencimiento", "-vencimiento",
                  "-estado"):
        assert len(ids(orden=orden)) == 5, orden
    # Semaforo: solo lo atrasado (la misma regla que la fila); 'todos' es sin filtro (D46).
    assert ids(semaforo="atrasados") == [atrasada.id]
    assert ids(semaforo="todos") == ids()
    # estados en CSV; 'estado' (compatibilidad) sigue siendo un valor por igualdad.
    assert set(ids(estados="ASIGNADA,CANCELADA")) == {atrasada.id, con_cot.id, cancelada.id}
    assert set(ids(estados=" ASIGNADA , ASIGNADA ")) == {atrasada.id, con_cot.id}
    assert set(ids(estado="ASIGNADA")) == {atrasada.id, con_cot.id}
    assert ids(estado="ASIGNADA,CANCELADA") == []
    assert ids(estados="ASIGNADA", semaforo="atrasados", orden="atencion") == [atrasada.id]


# ─── 5) Cotizaciones: pedido caido, confirmadas y busqueda por el pedido ─────────────────────────────────────────────

def test_cot_vistas_pedido_caido_y_busqueda_por_el_pedido(app_client, db, admin_token):
    """Prueba 2 con RP3 y RP8: una CONFIRMADA con su PVEN CANCELADO y sin confirmacion vigente sale en activas y no en
    confirmadas; la re-confirmada (gate2 puesto) tras cancelar el pedido sale en confirmadas. Buscar por el numero del
    PVEN encuentra la COT (q y search)."""
    f = _Fabrica(db, _ahora())
    borrador = f.cot("BORRADOR")
    caida = f.cot("CONFIRMADA")
    pv_caido = f.pven("CANCELADO", cot=caida)
    reconfirmada = f.cot("CONFIRMADA", gate2_confirmed_at=f.ahora)
    f.pven("CANCELADO", cot=reconfirmada)
    con_pedido = f.cot("CONFIRMADA")
    f.pven("EN_PROCESO", cot=con_pedido)
    rechazada = f.cot("RECHAZADA")
    vencida = f.cot("VENCIDA")
    vistas = {"activas": {borrador, caida, vencida}, "confirmadas": {reconfirmada, con_pedido},
              "rechazadas": {rechazada}, "todas": {borrador, caida, reconfirmada, con_pedido, rechazada, vencida}}
    for vista, docs in vistas.items():
        assert set(_ids(app_client, admin_token, "COT", q=f.sufijo, vista=vista)) == {d.id for d in docs}, vista
    assert set(_ids(app_client, admin_token, "COT", q=f.sufijo)) == {d.id for d in vistas["todas"]}
    conteos = {"activas": 3, "confirmadas": 2, "rechazadas": 1}
    for extra in ({}, {"vista": "rechazadas"}, {"estados": "BORRADOR"}, {"semaforo": "atrasados"}):
        assert _lista(app_client, admin_token, "COT", q=f.sufijo, con_conteos=1, **extra)["conteos"] == conteos, extra
    # COT-LISTA: el navegador encontraba la COT por el numero de su pedido (JSON.stringify): ahora el servidor.
    for params in ({"q": pv_caido.numero}, {"search": pv_caido.numero}, {"q": pv_caido.numero.lower()}):
        assert _ids(app_client, admin_token, "COT", **params) == [caida.id], params


def test_cot_resumen_sobre_todas_sin_busqueda(app_client, db, admin_token, monkeypatch):
    """RP19 (3), RP3 y RP89: con_resumen de COT sobre todas las cotizaciones (sin busqueda, vista ni estados). Claves
    de plan:5623. monto_confirmado suma las de f_cot_confirmada (la re-confirmada incluida, no la del pedido caido sin
    gate2); por_convertir = confirmadas − con_pedido; sin_calc y vencen_pronto miran las activas; vencen_pronto =
    valida_hasta entre hoy y hoy + 7 dias en Colombia (ambos incluidos); sin_atender, activas con mas de los dias de
    alerta sin movimiento (estricto)."""
    from app.core.fechas import hoy_colombia
    ahora = _reloj(monkeypatch)
    _dias_de_alerta(db, cot=2)
    hoy = hoy_colombia(ahora)
    antes = _lista(app_client, admin_token, "COT", con_resumen=1, limit=0)["resumen"]
    f = _Fabrica(db, ahora)
    f.paso = timedelta(0)
    f.cot("BORRADOR", total_cop=0)                                             # activa, sin calcular
    f.cot("ENVIADA", _dias(5), total_cop=100)                                  # activa, sin atender
    f.cot("ENVIADA", _dias(2), total_cop=100)                                  # justo los dias: no
    f.cot("PENDIENTE_CONFIRMACION", total_cop=100, valida_hasta=hoy + timedelta(days=3))   # vence pronto
    f.cot("BORRADOR", total_cop=100, valida_hasta=hoy)                         # vence pronto (hoy)
    f.cot("BORRADOR", total_cop=100, valida_hasta=hoy + timedelta(days=7))     # vence pronto (hoy + 7)
    f.cot("BORRADOR", total_cop=100, valida_hasta=hoy + timedelta(days=8))     # todavia no
    f.cot("VENCIDA", total_cop=100, valida_hasta=hoy - timedelta(days=1))      # activa; ya vencio
    f.cot("CONFIRMADA", total_cop=1000, gate2_confirmed_at=ahora)             # confirmada, por convertir
    con_pedido = f.cot("CONFIRMADA", total_cop=2000)
    f.pven("EN_PROCESO", cot=con_pedido)                                       # confirmada con pedido
    caida = f.cot("CONFIRMADA", total_cop=4000)
    f.pven("CANCELADO", cot=caida)                                             # pedido caido sin gate2: activa
    reconfirmada = f.cot("CONFIRMADA", total_cop=8000, gate2_confirmed_at=ahora,
                         valida_hasta=hoy + timedelta(days=1))
    f.pven("CANCELADO", cot=reconfirmada)                                      # confirmada (no vence: no es activa)
    f.cot("RECHAZADA", total_cop=0, valida_hasta=hoy)                          # rechazada: no es sin calcular
    despues = _lista(app_client, admin_token, "COT", con_resumen=1, limit=0)["resumen"]
    assert list(despues) == ["activas", "confirmadas", "con_pedido", "por_convertir", "rechazadas", "total",
                             "monto_confirmado", "sin_calc", "vencen_pronto", "sin_atender"]
    assert {k: despues[k] - antes[k] for k in despues} == {
        "activas": 9, "confirmadas": 3, "con_pedido": 1, "por_convertir": 2, "rechazadas": 1, "total": 13,
        "monto_confirmado": 11000, "sin_calc": 1, "vencen_pronto": 3, "sin_atender": 1}
    assert float(despues["monto_confirmado"]).is_integer()
    for extra in ({"q": f.sufijo}, {"vista": "rechazadas"}, {"estados": "CONFIRMADA"}, {"semaforo": "atrasados"}):
        assert _lista(app_client, admin_token, "COT", con_resumen=1, limit=0, **extra)["resumen"] == despues, extra
    assert set(_lista(app_client, admin_token, "COT", q=f.sufijo)) == {"status", "total", "data"}


def test_cot_varios_estados_traen_pedidos_venta_y_chips(app_client, db, admin_token):
    """KANBAN-ventas-listas prueba 5: con estados=CONFIRMADA,BORRADOR cada fila trae pedidos_venta (COT-LISTA). C14 y
    R8: seguimiento_estado, cambios_cliente y resolucion por fila."""
    from app.api.v1.erp_ventas import _cot_dict
    f = _Fabrica(db, _ahora())
    confirmada = f.cot("CONFIRMADA")
    pv1 = f.pven("CANCELADO", cot=confirmada)
    pv2 = f.pven("PENDIENTE_COMPRA", cot=confirmada)
    borrador = f.cot("BORRADOR", cambios_cliente_at=f.ahora, cambios_cliente_tipo="NO_LA_NECESITA")
    pendiente = f.cot("PENDIENTE_CONFIRMACION")
    f.seguimiento("COT", pendiente, "AGOTADO")
    r = _lista(app_client, admin_token, "COT", q=f.sufijo, estados="CONFIRMADA,BORRADOR")
    filas = {x["id"]: x for x in r["data"]}
    assert r["total"] == 2 and set(filas) == {confirmada.id, borrador.id}
    db.expire_all()
    assert set(filas[confirmada.id]) == set(_cot_dict(confirmada)) | {"pedidos_venta"} | ADITIVAS["COT"]
    assert filas[confirmada.id]["pedidos_venta"] == [_ligera(pv1), _ligera(pv2)]
    assert filas[borrador.id]["pedidos_venta"] == []
    assert filas[confirmada.id]["resolucion"] == "ACCION_TOMADA"   # tiene un pedido vigente
    assert filas[borrador.id]["resolucion"] == "NO_RESUELTO"
    assert filas[borrador.id]["cambios_cliente"]["tipo"] == "NO_LA_NECESITA"
    assert {x["tipo"] for x in r["data"]} == {"COT"}
    fila = next(x for x in _lista(app_client, admin_token, "COT", q=f.sufijo)["data"] if x["id"] == pendiente.id)
    assert fila["seguimiento_estado"] == "AGOTADO"
    assert filas[confirmada.id]["seguimiento_estado"] is None


def test_cot_orden_sin_movimiento_reciente_y_atencion(app_client, db, admin_token):
    """KANBAN-ventas-listas prueba 3 con RP9: 'sin_movimiento' pone primero la que lleva mas tiempo quieta y 'reciente',
    la creada mas tarde; un orden que no existe da 422 «No se puede ordenar por «x».». 'atencion' como el Hub."""
    _dias_de_alerta(db)
    f = _Fabrica(db, _ahora())
    nueva = f.cot("BORRADOR", created_at=f.ahora - _dias(1), updated_at=f.ahora - _dias(1), total_cop=300)
    quieta = f.cot("ENVIADA", created_at=f.ahora - _dias(5), updated_at=f.ahora - _dias(3), total_cop=100)
    rechazada = f.cot("RECHAZADA", created_at=f.ahora - _dias(4), updated_at=f.ahora - _dias(4), total_cop=200)

    def ids(**params):
        return _ids(app_client, admin_token, "COT", q=f.sufijo, **params)

    # quieta: creada hace 5 dias y movida hace 3; rechazada: quieta desde hace 4; nueva: creada y movida hace 1.
    assert ids(orden="sin_movimiento") == [rechazada.id, quieta.id, nueva.id]
    assert ids(orden="reciente") == ids() == [nueva.id, rechazada.id, quieta.id]
    assert ids(orden="atencion") == [quieta.id, nueva.id, rechazada.id]
    assert ids(orden="total") == [quieta.id, rechazada.id, nueva.id]
    assert ids(orden="-total") == [nueva.id, rechazada.id, quieta.id]
    assert ids(orden="estado") == [nueva.id, quieta.id, rechazada.id]
    for orden in ("numero", "cliente", "cotizador", "anticipo", "entrega", "-entrega", "creado"):
        assert len(ids(orden=orden)) == 3, orden
    assert ids(semaforo="atrasados") == [quieta.id]
    assert _error(app_client, admin_token, "COT", orden="x") == "No se puede ordenar por «x»."


# ─── 6) Pedidos de venta: los 18 estados, vistas, conteos y el resumen de H47 ────────────────────────────────────────

def test_pven_18_estados_vistas_conteos_y_resumen(app_client, db, admin_token):
    """Prueba 3 con RP19 (1) y C9: un pedido por cada uno de los 18 estados (y uno desconocido). La vista es la pestaña
    (grupo_pedido): cancelado trae CANCELADO y DEVUELTO_TOTAL, pend_compra trae PENDIENTE_PAGO y en_curso, los que no
    estan cerrados. conteos por pestaña sin vista ni estados. El resumen es H47 sobre TODO el filtro: con
    estados=EN_PROCESO,LISTO_ENTREGA suma solo esos; con vista=cancelado, monto_cop es 0."""
    from app.core.textos_actividad import ETIQUETAS_ESTADO
    f = _Fabrica(db, _ahora())
    pedidos = {}
    for i, estado in enumerate(ETIQUETAS_ESTADO["VEN"]):
        pedidos[estado] = f.pven(estado, total_cop=1000 * (i + 1), anticipo_cop=100 * (i + 1),
                                 saldo_cop=900 * (i + 1))
    assert len(pedidos) == 18
    raro = f.pven("ESTADO_RARO", total_cop=7, anticipo_cop=0, saldo_cop=7)

    def estados(**params):
        r = _lista(app_client, admin_token, "VEN", q=f.sufijo, limit=200, **params)
        return {x["estado"] for x in r["data"]}

    cerrados = {"ENTREGADO", "FACTURADO", "CANCELADO", "DEVUELTO_TOTAL"}
    vistas = {
        "pend_compra": {"PENDIENTE_COMPRA", "PENDIENTE_PAGO", "BORRADOR", "PENDIENTE_ANTICIPO", "CONFIRMADO"},
        "en_proceso": {"EN_PROCESO", "EN_TRANSITO", "PAGADO", "PARCIALMENTE_DISPONIBLE"},
        "listo_entrega": {"LISTO_ENTREGA", "DISPONIBLE", "PENDIENTE_SALDO", "LISTO_PARA_ENTREGA",
                          "PARCIALMENTE_ENTREGADO"},
        "entregado": {"ENTREGADO"}, "facturado": {"FACTURADO"}, "cancelado": {"CANCELADO", "DEVUELTO_TOTAL"},
        "todos": set(pedidos) | {"ESTADO_RARO"},
        "en_curso": (set(pedidos) - cerrados) | {"ESTADO_RARO"},
    }
    for vista, esperados in vistas.items():
        assert estados(vista=vista) == esperados, vista
    assert estados() == vistas["todos"]

    conteos = {"todos": 19, "pend_compra": 5, "en_proceso": 4, "listo_entrega": 5, "entregado": 1, "facturado": 1,
               "cancelado": 2}
    for extra in ({}, {"vista": "cancelado"}, {"estados": "EN_PROCESO"}, {"estado": "FACTURADO"},
                  {"semaforo": "atrasados"}):
        assert _lista(app_client, admin_token, "VEN", q=f.sufijo, con_conteos=1, **extra)["conteos"] == conteos, extra

    assert estados(estados="EN_PROCESO,LISTO_ENTREGA") == {"EN_PROCESO", "LISTO_ENTREGA"}
    assert _lista(app_client, admin_token, "VEN", q=f.sufijo, estado="EN_PROCESO")["total"] == 1   # como hoy

    def suma(campo, cuales):
        return sum(float(getattr(pedidos[e], campo)) for e in cuales)

    dos = ("EN_PROCESO", "LISTO_ENTREGA")
    r = _lista(app_client, admin_token, "VEN", q=f.sufijo, estados=",".join(dos))
    assert r["resumen"] == {"monto_cop": suma("total_cop", dos), "saldo_cop": suma("saldo_cop", dos),
                            "anticipo_cop": suma("anticipo_cop", dos), "por_estado": {e: 1 for e in dos}}
    r = _lista(app_client, admin_token, "VEN", q=f.sufijo, vista="cancelado")
    assert r["resumen"] == {"monto_cop": 0, "saldo_cop": 0, "anticipo_cop": 0,
                            "por_estado": {"CANCELADO": 1, "DEVUELTO_TOTAL": 1}}
    con_dinero = [e for e in pedidos if e not in ("CANCELADO", "DEVUELTO_TOTAL")]
    r = _lista(app_client, admin_token, "VEN", q=f.sufijo, limit=0)
    assert r["data"] == [] and r["total"] == 19
    assert r["resumen"]["monto_cop"] == suma("total_cop", con_dinero) + 7
    assert r["resumen"]["por_estado"] == {**{e: 1 for e in pedidos}, "ESTADO_RARO": 1}
    assert raro.id in _ids(app_client, admin_token, "VEN", q=f.sufijo, vista="todos", limit=200)


def test_pven_saldo_pendiente_y_pagado(app_client, db, admin_token):
    """TABLA-inventario punto 3, RP22 y D37: saldo=pendiente es saldo_cop > 0 y saldo=pagado, saldo_cop <= 0 o NULL
    (la regla de columnaEntrega). Con los estados de las columnas «Listo» de Entregas. El resumen sigue el filtro."""
    f = _Fabrica(db, _ahora())
    debe = f.pven("LISTO_ENTREGA", total_cop=1000, anticipo_cop=500, saldo_cop=500)
    pagado = f.pven("DISPONIBLE", total_cop=800, anticipo_cop=800, saldo_cop=0)
    a_favor = f.pven("PENDIENTE_SALDO", total_cop=600, anticipo_cop=700, saldo_cop=-100)
    sin_saldo = f.pven("LISTO_PARA_ENTREGA", total_cop=400, anticipo_cop=400)
    db.execute(text("UPDATE sale_orders SET saldo_cop = NULL WHERE id = :id"), {"id": sin_saldo.id})
    db.commit()
    otro = f.pven("EN_PROCESO", total_cop=700, anticipo_cop=0, saldo_cop=700)
    listos = "LISTO_ENTREGA,DISPONIBLE,PENDIENTE_SALDO,LISTO_PARA_ENTREGA"

    def ids(**params):
        return set(_ids(app_client, admin_token, "VEN", q=f.sufijo, **params))

    assert ids(saldo="pendiente") == {debe.id, otro.id}
    assert ids(saldo="pagado") == {pagado.id, a_favor.id, sin_saldo.id}
    assert ids(estados=listos, saldo="pendiente") == {debe.id}
    assert ids(estados=listos, saldo="pagado") == {pagado.id, a_favor.id, sin_saldo.id}
    assert ids(estados="ENTREGADO,PARCIALMENTE_ENTREGADO,FACTURADO") == set()
    r = _lista(app_client, admin_token, "VEN", q=f.sufijo, saldo="pendiente")
    assert r["resumen"] == {"monto_cop": 1700, "saldo_cop": 1200, "anticipo_cop": 500,
                            "por_estado": {"LISTO_ENTREGA": 1, "EN_PROCESO": 1}}
    # saldo es un filtro extra: los conteos lo llevan (R5 solo saca vista, estados, semaforo, paso y columna).
    assert _lista(app_client, admin_token, "VEN", q=f.sufijo, saldo="pagado", con_conteos=1)["conteos"]["todos"] == 3


def test_pven_atencion_semaforo_y_filas(app_client, db, admin_token):
    """R8: orden atencion y semaforo=atrasados en Pedidos; cada fila trae su _ven_dict, el asesor de H4 y las marcas
    (resolucion, dias_sin_mov, dias_creado; seguimiento_estado y cambios_cliente en None, como en el Hub)."""
    from app.api.v1.erp_ventas import _ven_dict
    _dias_de_alerta(db)
    f = _Fabrica(db, _ahora())
    sc = f.sc("CONFIRMADA", advisor_name=f"Beto {f.sufijo}")
    cot = f.cot("CONFIRMADA", sc=sc, cotizador=f"Ana {f.sufijo}")
    atrasado = f.pven("EN_PROCESO", _dias(10), cot=cot, total_cop=100, anticipo_cop=50, saldo_cop=50)
    nuevo = f.pven("PENDIENTE_COMPRA", _dias(1), sc=sc, total_cop=300, anticipo_cop=0, saldo_cop=300)
    listo = f.pven("LISTO_ENTREGA", _dias(3), total_cop=200, anticipo_cop=200, saldo_cop=0)
    entregado = f.pven("ENTREGADO", _dias(2), total_cop=400, anticipo_cop=100, saldo_cop=300)

    def ids(**params):
        return _ids(app_client, admin_token, "VEN", q=f.sufijo, **params)

    r = _lista(app_client, admin_token, "VEN", q=f.sufijo, orden="atencion")
    assert [x["id"] for x in r["data"]] == [atrasado.id, nuevo.id, listo.id, entregado.id]
    assert [x["resolucion"] for x in r["data"]] == ["ATRASADO", "NO_RESUELTO", "ACCION_TOMADA", "CERRADO"]
    assert [x["dias_sin_mov"] for x in r["data"]] == [10, 1, 3, 2]
    filas = {x["id"]: x for x in r["data"]}
    db.expire_all()
    assert set(filas[atrasado.id]) == set(_ven_dict(atrasado)) | {"advisor_name"} | ADITIVAS["VEN"]
    assert filas[atrasado.id]["advisor_name"] == f"Ana {f.sufijo}"     # H4: el cotizador de su COT
    assert filas[nuevo.id]["advisor_name"] == f"Beto {f.sufijo}"       # sin COT: el asesor de su SC
    assert all(x["tipo"] == "VEN" and x["cambios_cliente"] is None and x["seguimiento_estado"] is None
               for x in r["data"])
    assert ids(semaforo="atrasados") == [atrasado.id]
    assert ids() == [nuevo.id, entregado.id, listo.id, atrasado.id]       # D29: el mas reciente primero
    assert ids(orden="total") == [atrasado.id, listo.id, nuevo.id, entregado.id]
    # Empates (nuevo y entregado deben 300): el desempate es el id desc (D34).
    assert ids(orden="-saldo") == [entregado.id, nuevo.id, atrasado.id, listo.id]
    assert ids(orden="saldo") == [listo.id, atrasado.id, entregado.id, nuevo.id]
    assert ids(orden="anticipo") == [nuevo.id, atrasado.id, entregado.id, listo.id]
    assert ids(orden="estado") == [nuevo.id, atrasado.id, listo.id, entregado.id]
    for orden in ("numero", "-numero", "cliente", "entrega", "-entrega", "creado", "sin_movimiento"):
        assert len(ids(orden=orden)) == 4, orden


# ─── 7) La regla de atraso de la fila es la del filtro (frontera estricta, reloj fijo) ───────────────────────────────

def test_resolucion_de_la_fila_y_semaforo_con_la_frontera_estricta(app_client, db, admin_token, monkeypatch):
    """R8/RP2: atrasado es ESTRICTAMENTE mas de dias × 24 h sin movimiento. La resolucion de cada fila y
    semaforo=atrasados dicen lo mismo en las tres listas, con el mismo reloj."""
    ahora = _reloj(monkeypatch)
    _dias_de_alerta(db, sc=2, cot=3, ven=4)
    f = _Fabrica(db, ahora)
    f.paso = timedelta(0)
    justo = {"SC": f.sc("BORRADOR", _dias(2)), "COT": f.cot("ENVIADA", _dias(3)), "VEN": f.pven("EN_TRANSITO", _dias(4))}
    pasado = {"SC": f.sc("BORRADOR", _dias(2) + UN_MINUTO), "COT": f.cot("ENVIADA", _dias(3) + UN_MINUTO),
              "VEN": f.pven("EN_TRANSITO", _dias(4) + UN_MINUTO)}
    for tipo in RUTAS:
        filas = {x["id"]: x for x in _lista(app_client, admin_token, tipo, q=f.sufijo)["data"]}
        assert filas[justo[tipo].id]["resolucion"] == "NO_RESUELTO", tipo
        assert filas[pasado[tipo].id]["resolucion"] == "ATRASADO", tipo
        assert _ids(app_client, admin_token, tipo, q=f.sufijo, semaforo="atrasados") == [pasado[tipo].id], tipo
        assert _ids(app_client, admin_token, tipo, q=f.sufijo, orden="atencion")[0] == pasado[tipo].id, tipo


# ─── 8) Busqueda: q y su alias search (RP8) ──────────────────────────────────────────────────────────────────────────

def test_q_y_search_dan_el_mismo_total(app_client, db, admin_token):
    """RP8 (5): en cada lista q=<sufijo> y search=<sufijo> dan el mismo total; gana q; los espacios de los bordes se
    quitan; un q en blanco no tapa a search; un tabulador en medio es un espacio (D46)."""
    f = _Fabrica(db, _ahora())
    for _ in range(2):
        sc = f.sc("ASIGNADA")
        cot = f.cot("BORRADOR", sc=sc)
        f.pven("EN_PROCESO", sc=sc, cot=cot)
    for tipo in RUTAS:
        def total(**params):
            return _lista(app_client, admin_token, tipo, limit=0, **params)["total"]
        assert total(q=f.sufijo) == total(search=f.sufijo) == 2, tipo
        assert total(q=f"  {f.sufijo}  ") == total(search=f"  {f.sufijo} ") == 2, tipo
        assert total(q=f.sufijo, search=f"nada-{f.sufijo}") == 2, tipo
        assert total(q="   ", search=f.sufijo) == 2, tipo
        assert total(q=f"LV\t{f.sufijo}") == total(q=f"LV {f.sufijo}") == 2, tipo


# ─── 9) Errores en español (R21, RP9, D46: por igualdad) ─────────────────────────────────────────────────────────────

def test_errores_en_espanol(app_client, admin_token):
    for tipo in RUTAS:
        for orden in ("hackeo", "-atencion", "-reciente", "-sin_movimiento", "total; drop table"):
            assert _error(app_client, admin_token, tipo, orden=orden) == f"No se puede ordenar por «{orden}».", (
                tipo, orden)
        assert _error(app_client, admin_token, tipo, semaforo="no_resueltos") == (
            "El filtro del semáforo «no_resueltos» no existe: usa atrasados."), tipo
        muchos = ",".join(f"E{i}" for i in range(21))
        assert _error(app_client, admin_token, tipo, estados=muchos) == "Puedes filtrar por 20 estados como máximo."
        for params in ({"q": "\x00"}, {"search": "tor\x00nillo"}, {"estados": "\x00"}, {"q": "a\x7fb"}):
            assert _error(app_client, admin_token, tipo, **params) == CONTROL, (tipo, params)
    # Cada lista con sus ordenes: lo de otra lista no vale.
    assert _error(app_client, admin_token, "SC", orden="saldo") == "No se puede ordenar por «saldo»."
    assert _error(app_client, admin_token, "COT", orden="vencimiento") == "No se puede ordenar por «vencimiento»."
    assert _error(app_client, admin_token, "VEN", orden="tipo") == "No se puede ordenar por «tipo»."
    assert _error(app_client, admin_token, "SC", vista="analisis") == "La vista «analisis» no existe en Solicitudes."
    assert _error(app_client, admin_token, "SC", vista="todos") == "La vista «todos» no existe en Solicitudes."
    assert _error(app_client, admin_token, "COT", vista="canceladas") == (
        "La vista «canceladas» no existe en Cotizaciones.")
    assert _error(app_client, admin_token, "VEN", vista="todas") == "La vista «todas» no existe en Pedidos de venta."
    assert _error(app_client, admin_token, "VEN", saldo="debe") == (
        "El filtro de saldo «debe» no existe: usa pendiente o pagado.")
    # D46: cada estado se valida contra los del tipo (ETIQUETAS_ESTADO; los 18 del pedido, heredados incluidos).
    for tipo, malo, sigla in (("SC", "FOO", "SC"), ("SC", "SC:ASIGNADA", "SC"), ("COT", "ASIGNADA", "COT"),
                              ("VEN", "ENTREGAD", "VEN"), ("VEN", "EN_PROCESO,FOO", "VEN")):
        esperado = f"El estado «{malo.split(',')[-1]}» no existe en {sigla}."
        assert _error(app_client, admin_token, tipo, estados=malo) == esperado, (tipo, malo)
    # Los heredados si existen.
    _lista(app_client, admin_token, "SC", estados="COTIZADA,EN_ESPERA_CONFIRMACION,N/A_SOPORTE", limit=0)
    _lista(app_client, admin_token, "COT", estados="VENCIDA,ENVIADA", limit=0)
    _lista(app_client, admin_token, "VEN", estados="PAGADO,PENDIENTE_ANTICIPO,DEVUELTO_TOTAL", limit=0)
    # Los valores en blanco no filtran (como vista=todos y semaforo=todos).
    for tipo in RUTAS:
        assert (_lista(app_client, admin_token, tipo, vista=" ", semaforo="todos", estados=" , ", orden=" ",
                       limit=0)["total"] == _lista(app_client, admin_token, tipo, limit=0)["total"]), tipo


def test_paginacion_fuera_de_rango_da_400_legible(app_client, admin_token):
    """D46 (M12, M14 de T6A): limit y offset fuera de rango dan el 400 legible del manejador global, nunca un 500.
    limit conserva su valor por defecto (50) y limit=0 trae solo el total."""
    from app.core.listados import MAX_OFFSET
    from main import MENSAJE_DATOS_INVALIDOS
    for tipo, ruta in RUTAS.items():
        for params in ({"limit": 201}, {"limit": -1}, {"offset": -1}, {"offset": MAX_OFFSET + 1},
                       {"offset": 10 ** 20}):
            resp = app_client.get(ruta, params=params, headers=_auth(admin_token))
            assert resp.status_code == 400, (tipo, params, resp.status_code, resp.text)
            assert resp.json()["message"] == MENSAJE_DATOS_INVALIDOS, (tipo, params)
        todo = _lista(app_client, admin_token, tipo)
        assert len(todo["data"]) == min(50, todo["total"]), tipo
        borde = _lista(app_client, admin_token, tipo, offset=MAX_OFFSET, limit=1)
        assert borde["data"] == [] and borde["total"] == todo["total"], tipo


def test_las_rutas_declaran_los_parametros_nuevos_y_no_kpi_ni_sin_soporte(app_client, admin_token):
    """R5 y C8: desaparecen 'kpi' y 'sin_soporte'; las tres listas declaran q, estados, vista, semaforo, orden,
    con_conteos y limit con ge=0 y le=200 (su defecto de hoy, 50); offset hasta MAX_OFFSET."""
    from app.core.listados import MAX_OFFSET
    from main import app
    caminos = app.openapi()["paths"]
    comunes = {"estado", "search", "q", "estados", "vista", "semaforo", "orden", "con_conteos", "limit", "offset"}
    propios = {"SC": {"customer_id", "con_resumen"}, "COT": {"sc_id", "con_resumen"},
               "VEN": {"cot_id", "canal_venta", "saldo"}}
    for tipo, ruta in RUTAS.items():
        parametros = {p["name"]: p for p in caminos[ruta]["get"]["parameters"]}
        assert set(parametros) == comunes | propios[tipo], (tipo, sorted(parametros))
        assert "kpi" not in parametros and "sin_soporte" not in parametros
        limite = parametros["limit"]["schema"]
        assert (limite["default"], limite["minimum"], limite["maximum"]) == (50, 0, 200), tipo
        assert parametros["offset"]["schema"]["maximum"] == MAX_OFFSET, tipo


# ─── 10) Sin los parametros nuevos, cada lista responde como hoy (R5) ────────────────────────────────────────────────

def _hoy_solicitudes(db, estado=None, customer_id=None, search=None, limit=50, offset=0):
    """Copia congelada de list_solicitudes de aa45805 (antes de T6B)."""
    from app.api.v1.erp_ventas import _sc_dict
    q = db.query(CustomerRequest)
    if estado:
        q = q.filter(CustomerRequest.estado == estado)
    if customer_id:
        q = q.filter(CustomerRequest.customer_id == customer_id)
    if search:
        like = f"%{search}%"
        q = q.filter(CustomerRequest.numero.ilike(like) | CustomerRequest.customer_name.ilike(like)
                     | CustomerRequest.advisor_name.ilike(like) | productos_ilike(CustomerRequest.productos, like))
    total = q.count()
    items = q.order_by(CustomerRequest.created_at.desc()).offset(offset).limit(limit).all()
    ids = [s.id for s in items]
    cots_por_sc = {}
    if ids:
        for c_id, c_num, c_est, c_sc in (db.query(SalesQuotation.id, SalesQuotation.numero, SalesQuotation.estado,
                                                  SalesQuotation.sc_id)
                                         .filter(SalesQuotation.sc_id.in_(ids)).order_by(SalesQuotation.id.asc())):
            cots_por_sc.setdefault(c_sc, []).append({"id": c_id, "numero": c_num, "estado": c_est})
    return {"status": "success", "total": total,
            "data": [{**_sc_dict(s), "cotizaciones": cots_por_sc.get(s.id, [])} for s in items]}


def _hoy_cotizaciones(db, estado=None, sc_id=None, search=None, limit=50, offset=0):
    """Copia congelada de list_cotizaciones de aa45805 (antes de T6B)."""
    from app.api.v1.erp_ventas import _cot_dict
    q = db.query(SalesQuotation)
    if estado:
        q = q.filter(SalesQuotation.estado == estado)
    if sc_id:
        q = q.filter(SalesQuotation.sc_id == sc_id)
    if search:
        like = f"%{search}%"
        q = q.filter(SalesQuotation.numero.ilike(like) | SalesQuotation.customer_name.ilike(like)
                     | SalesQuotation.cotizador.ilike(like) | SalesQuotation.sc_numero.ilike(like)
                     | productos_ilike(SalesQuotation.productos, like))
    total = q.count()
    items = q.order_by(SalesQuotation.created_at.desc()).offset(offset).limit(limit).all()
    ids = [c.id for c in items]
    pvs_por_cot = {}
    if ids:
        for v_id, v_num, v_est, v_cot in (db.query(SaleOrder.id, SaleOrder.numero, SaleOrder.estado, SaleOrder.cot_id)
                                          .filter(SaleOrder.cot_id.in_(ids)).order_by(SaleOrder.id.asc())):
            pvs_por_cot.setdefault(v_cot, []).append({"id": v_id, "numero": v_num, "estado": v_est})
    return {"status": "success", "total": total,
            "data": [{**_cot_dict(c), "pedidos_venta": pvs_por_cot.get(c.id, [])} for c in items]}


def _hoy_pedidos(db, estado=None, cot_id=None, canal_venta=None, search=None, limit=50, offset=0):
    """Copia congelada de list_pedidos de aa45805 (antes de T6B), con el resumen de H47."""
    from sqlalchemy import case, func
    from app.api.v1.erp_ventas import _asesores_de_pedidos, _ven_dict
    from app.core.estados_pedido import ESTADOS_VEN_SIN_DINERO
    from app.core.ventas_dinero import redondear_peso
    q = db.query(SaleOrder)
    if estado:
        q = q.filter(SaleOrder.estado == estado)
    if cot_id:
        q = q.filter(SaleOrder.cot_id == cot_id)
    if canal_venta:
        q = q.filter(SaleOrder.canal_venta == canal_venta)
    if search:
        like = f"%{search}%"
        q = q.filter(SaleOrder.numero.ilike(like) | SaleOrder.customer_name.ilike(like)
                     | SaleOrder.sc_numero.ilike(like) | SaleOrder.cot_numero.ilike(like)
                     | SaleOrder.pweb_numero.ilike(like) | productos_ilike(SaleOrder.productos, like))
    total = q.count()
    vigente = SaleOrder.estado.notin_(ESTADOS_VEN_SIN_DINERO)

    def suma(col):
        return func.coalesce(func.sum(case((vigente, col), else_=0)), 0)

    monto, saldo, anticipo = q.with_entities(suma(SaleOrder.total_cop), suma(SaleOrder.saldo_cop),
                                             suma(SaleOrder.anticipo_cop)).one()
    por_estado = dict(q.with_entities(SaleOrder.estado, func.count(SaleOrder.id)).group_by(SaleOrder.estado).all())
    items = q.order_by(SaleOrder.created_at.desc()).offset(offset).limit(limit).all()
    asesores = _asesores_de_pedidos(db, items)
    return {"status": "success", "total": total,
            "resumen": {"monto_cop": float(redondear_peso(monto)), "saldo_cop": float(redondear_peso(saldo)),
                        "anticipo_cop": float(redondear_peso(anticipo)), "por_estado": por_estado},
            "data": [{**_ven_dict(v), "advisor_name": asesores.get(v.id)} for v in items]}


def _como_hoy(app_client, db, token, tipo, hoy, **params):
    """La respuesta nueva sin los parametros nuevos: las mismas claves de arriba, el mismo total (y el mismo resumen),
    las mismas filas en el mismo orden con los mismos valores; cada fila solo AGREGA las claves de ADITIVAS."""
    db.expire_all()
    esperado = jsonable_encoder(hoy(db, **params))
    nuevo = _lista(app_client, token, tipo, **params)
    assert set(nuevo) == set(esperado), (tipo, params, set(nuevo))
    assert {k: v for k, v in nuevo.items() if k != "data"} == {k: v for k, v in esperado.items() if k != "data"}, (
        tipo, params)
    assert [x["id"] for x in nuevo["data"]] == [x["id"] for x in esperado["data"]], (tipo, params)
    for fila, vieja in zip(nuevo["data"], esperado["data"]):
        assert {k: fila[k] for k in vieja} == vieja, (tipo, params, fila["id"])
        assert set(fila) - set(vieja) == ADITIVAS[tipo], (tipo, params, set(fila) - set(vieja))
    return nuevo


def test_sin_los_parametros_nuevos_cada_lista_responde_como_hoy(app_client, db, admin_token):
    """R5: con solo los parametros de hoy (search, estado, customer_id/sc_id/cot_id/canal_venta, limit, offset) cada lista
    responde lo mismo que la copia congelada de aa45805: los selectores, el Dashboard y el Asistente no cambian. Lo unico
    nuevo son las claves que cada fila agrega (ADITIVAS)."""
    f = _Fabrica(db, _ahora())
    cliente = Customer(first_name="Lista", last_name=f.sufijo, email=f"lv-{f.sufijo.lower()}@test.nebulae")
    db.add(cliente)
    db.commit()
    sc1 = f.sc("ASIGNADA", _dias(1), customer_id=cliente.id, advisor_name="Ana")
    sc2 = f.sc("CONFIRMADA", gate1_confirmed_at=f.ahora, customer_id=cliente.id)
    f.sc("BORRADOR", _dias(2))
    f.sc("ASIGNADA", tipo_solicitud="Soporte Tecnico")
    cot1 = f.cot("CONFIRMADA", sc=sc2, total_cop=1000, cotizador="Ana")
    f.cot("BORRADOR", sc=sc1, total_cop=500)
    f.cot("RECHAZADA", sc=sc1)
    f.pven("CANCELADO", cot=cot1, total_cop=1000, anticipo_cop=0, saldo_cop=1000)
    f.pven("EN_PROCESO", sc=sc2, cot=cot1, total_cop=1000, anticipo_cop=400, saldo_cop=600)
    f.pven("ENTREGADO", total_cop=300, anticipo_cop=300, saldo_cop=0, canal_venta="WEB")
    f.pven("DEVUELTO_TOTAL", total_cop=700, anticipo_cop=700, saldo_cop=0)
    s = f.sufijo
    for params in ({"search": s}, {"search": s, "estado": "ASIGNADA"}, {"search": s, "limit": 2, "offset": 1},
                   {"customer_id": cliente.id}, {"search": s, "limit": 0}):
        _como_hoy(app_client, db, admin_token, "SC", _hoy_solicitudes, **params)
    for params in ({"search": s}, {"search": s, "estado": "CONFIRMADA"}, {"sc_id": sc1.id},
                   {"search": s, "limit": 1, "offset": 1}):
        _como_hoy(app_client, db, admin_token, "COT", _hoy_cotizaciones, **params)
    for params in ({"search": s}, {"search": s, "estado": "CANCELADO"}, {"cot_id": cot1.id},
                   {"search": s, "canal_venta": "WEB"}, {"search": s, "limit": 2, "offset": 1}):
        _como_hoy(app_client, db, admin_token, "VEN", _hoy_pedidos, **params)


# ─── 11) Consultas: sin una por fila (RP20) ──────────────────────────────────────────────────────────────────────────

def test_mismo_numero_de_consultas_con_3_y_con_25_filas(app_client, db, admin_token, contador_sql):
    """RP20: la pagina se hidrata con consultas IN (la ficha del cliente con selectinload, las COT y los pedidos
    ligeros, el seguimiento y el asesor de H4): con 3 y con 25 filas cada lista hace las mismas consultas, solo SELECT y
    sin commits."""
    ahora = _ahora()
    cliente = Customer(first_name="Lista", last_name=uuid.uuid4().hex[:8], email=f"lv-{uuid.uuid4().hex[:10]}@test.nebulae")
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

    def medir(tipo, sufijo, filas, **params):
        with contador_sql.ventana() as v:
            r = _lista(app_client, admin_token, tipo, q=sufijo, limit=100, **params)
        assert len(r["data"]) == filas and r["total"] == filas
        assert v.commits == 0
        assert all(s.lstrip().upper().startswith("SELECT") for s in v.sentencias), v.sentencias
        return v.consultas

    pocas, muchas = crear(3), crear(25)
    completo = {"SC": {"con_conteos": 1, "con_resumen": 1, "orden": "atencion"},
                "COT": {"con_conteos": 1, "con_resumen": 1, "orden": "atencion"},
                "VEN": {"con_conteos": 1, "orden": "atencion"}}
    # Medido en T6B. Por defecto (solo q): la sesion (1) + dias de alerta (1) + total y pagina (2) + ficha del cliente
    # (1) + SC: COT y pedidos ligeros (2) y seguimiento (1) = 8; COT: pedidos ligeros (1) y seguimiento (1) = 7; VEN:
    # resumen de H47 (2) y asesores de H4 (2) = 9. Con todo: + conteos (1) y, en SC y COT, + resumen (1): 10, 9 y 10.
    # Antes de T6B (aa45805), sin las marcas: SC 5, COT 5, VEN 8.
    topes = {"SC": (8, 10), "COT": (7, 9), "VEN": (9, 10)}
    for tipo in RUTAS:
        por_defecto = (medir(tipo, pocas, 3), medir(tipo, muchas, 25))
        con_todo = (medir(tipo, pocas, 3, **completo[tipo]), medir(tipo, muchas, 25, **completo[tipo]))
        assert por_defecto[0] == por_defecto[1] and con_todo[0] == con_todo[1], (tipo, por_defecto, con_todo)
        assert por_defecto[1] <= topes[tipo][0] and con_todo[1] <= topes[tipo][1], (tipo, por_defecto, con_todo)


# ─── 12) Paridad del resumen y de las pestañas con listas-ventas.js y estados-pedido.js (node) ───────────────────────

_PREAMBULO = """
const trozos = [];
for await (const t of process.stdin) trozos.push(t);
const entrada = JSON.parse(Buffer.concat(trozos).toString('utf8'));
const hub = await import(entrada.hub);
const listas = await import(entrada.listas);
const pedidos = await import(entrada.pedidos);
"""


def _node(cuerpo, **datos):
    """Corre `cuerpo` (JS que termina en console.log(JSON.stringify(...))) con hub-ventas.js, listas-ventas.js y
    estados-pedido.js importados y `entrada` = los datos; devuelve lo que imprime, leido como JSON."""
    node = shutil.which("node")
    rutas = {"hub": _LIB / "hub-ventas.js", "listas": _LIB / "listas-ventas.js", "pedidos": _LIB / "estados-pedido.js"}
    if not node or not all(r.exists() for r in rutas.values()):
        pytest.skip("sin node o sin frontend/src/lib: no se puede comprobar la paridad")
    entrada = {clave: ruta.as_uri() for clave, ruta in rutas.items()} | datos
    r = subprocess.run([node, "--input-type=module", "-e", _PREAMBULO + cuerpo], input=json.dumps(entrada),
                       capture_output=True, text=True, encoding="utf-8", timeout=60)
    assert r.returncode == 0, f"node fallo:\n{r.stderr}"
    return json.loads(r.stdout)


def _ms(dt):
    return int(dt.replace(tzinfo=timezone.utc).timestamp() * 1000)


def test_resumen_y_pestanas_son_los_de_listas_ventas_js(app_client, db, admin_token, monkeypatch):
    """Prueba 4 con RP3 y RP19 (3): el con_resumen de SC y de COT (la diferencia antes/despues) es lo que calculan
    esSolicitudActiva, pestanaDeSolicitud, generoCotizacion, esperaCotizacion, pestanaCotizacion, pedidoVigente y
    superaDiasAlerta de listas-ventas.js sobre las filas que devuelve la lista con q=<sufijo>. Y la vista de cada pedido
    es la pestaña de grupoPedido de estados-pedido.js (los 18 estados y uno desconocido, que solo sale en Todos)."""
    from app.core.estados_pedido import VISTA_DE_GRUPO
    from app.core.fechas import hoy_colombia
    from app.core.textos_actividad import ETIQUETAS_ESTADO
    from app.api.v1 import erp_ventas
    ahora = _ahora().replace(microsecond=0)
    monkeypatch.setattr(erp_ventas, "ahora_utc", lambda: ahora)
    dias = {"SC": 2, "COT": 3, "VEN": 4}
    _dias_de_alerta(db, sc=dias["SC"], cot=dias["COT"], ven=dias["VEN"])
    hoy = hoy_colombia(ahora)
    antes = {t: _lista(app_client, admin_token, t, con_resumen=1, limit=0)["resumen"] for t in ("SC", "COT")}
    f = _Fabrica(db, ahora)
    viejo = _dias(9)
    # Solicitudes (el escenario de test_paridad_reglas_ventas, mas vencidas y sin atender)
    f.sc("BORRADOR", viejo)
    f.sc("ASIGNADA", fecha_vencimiento=ahora - timedelta(hours=2))
    f.sc("ASIGNADA", tipo_solicitud=None)
    f.sc("CONFIRMADA", viejo, gate1_confirmed_at=ahora - viejo)
    rech = f.sc("CONFIRMADA")
    f.cot("RECHAZADA", sc=rech)
    venc = f.sc("CONFIRMADA")
    f.cot("VENCIDA", sc=venc, total_cop=10, valida_hasta=hoy - timedelta(days=2))
    con_pven = f.sc("CONFIRMADA")
    f.pven("EN_PROCESO", sc=con_pven)
    temprana = f.sc("PENDIENTE_CONFIRMACION", viejo)
    f.cot("BORRADOR", sc=temprana, valida_hasta=hoy + timedelta(days=2))
    f.sc("CANCELADA")
    f.sc("BORRADOR", viejo, tipo_solicitud="Soporte Tecnico")
    f.sc("N/A_SOPORTE")
    f.sc("CONFIRMADA", tipo_solicitud="Soporte Tecnico")
    # Cotizaciones sueltas
    f.cot("BORRADOR", viejo, total_cop=0)
    f.cot("ENVIADA", total_cop=50, valida_hasta=hoy + timedelta(days=7))
    f.cot("RECHAZADA", total_cop=0)
    f.cot("CONFIRMADA", viejo, total_cop=300, gate2_confirmed_at=ahora - viejo)
    f.cot("CONFIRMADA", viejo, total_cop=500)
    conf_pven = f.cot("CONFIRMADA", total_cop=700, gate2_confirmed_at=ahora)
    f.pven("EN_PROCESO", cot=conf_pven)
    caido = f.cot("CONFIRMADA", total_cop=1100)
    f.pven("CANCELADO", cot=caido)
    caido_gate2 = f.cot("CONFIRMADA", total_cop=1300, gate2_confirmed_at=ahora)
    f.pven("CANCELADO", cot=caido_gate2)
    mixto = f.cot("CONFIRMADA", total_cop=1700)
    f.pven("CANCELADO", cot=mixto)
    f.pven("PENDIENTE_COMPRA", cot=mixto)

    scs = _lista(app_client, admin_token, "SC", q=f.sufijo, limit=200)["data"]
    cots = _lista(app_client, admin_token, "COT", q=f.sufijo, limit=200)["data"]
    assert len(scs) == 12 and len(cots) == 12
    servidor = {}
    for t in ("SC", "COT"):
        despues = _lista(app_client, admin_token, t, con_resumen=1, limit=0)["resumen"]
        servidor[t] = {k: despues[k] - antes[t][k] for k in despues}
    js = _node("""
      const {scs, cots, ahora, dias, hoy, hoy7} = entrada;
      const pestanaSC = listas.pestanaDeSolicitud;
      const sinSoporte = scs.filter(s => pestanaSC(s) !== 'Soporte');
      const n = (xs, p) => xs.filter(p).length;
      const sc = {
        activas: n(scs, listas.esSolicitudActiva),
        confirmadas: n(scs, s => pestanaSC(s) === 'Confirmadas'),
        canceladas: n(scs, s => pestanaSC(s) === 'Canceladas'),
        total: sinSoporte.length,
        con_cot: n(sinSoporte, listas.generoCotizacion),
        esperan_cot: n(sinSoporte, listas.esperaCotizacion),
        sin_atender: n(sinSoporte, s => s.estado === 'BORRADOR'
                                     && listas.superaDiasAlerta(s.updated_at || s.fecha_solicitud, dias.SC, ahora)),
        vencidas: n(scs, s => listas.esSolicitudActiva(s) && !!s.fecha_vencimiento
                              && new Date(hub.comoUTC(s.fecha_vencimiento)).getTime() < ahora),
      };
      const pestana = listas.pestanaCotizacion;
      const activas = cots.filter(c => pestana(c) === 'Activas');
      const confirmadas = cots.filter(c => pestana(c) === 'Confirmadas');
      const conPedido = n(cots, c => c.estado === 'CONFIRMADA' && listas.pedidoVigente(c) !== null);
      const cot = {
        activas: activas.length, confirmadas: confirmadas.length, con_pedido: conPedido,
        por_convertir: confirmadas.length - conPedido, rechazadas: n(cots, c => pestana(c) === 'Rechazadas'),
        total: cots.length, monto_confirmado: confirmadas.reduce((s, c) => s + (Number(c.total_cop) || 0), 0),
        sin_calc: n(activas, c => !(c.total_cop > 0)),
        vencen_pronto: n(activas, c => !!c.valida_hasta && c.valida_hasta >= hoy && c.valida_hasta <= hoy7),
        sin_atender: n(activas, c => listas.superaDiasAlerta(c.updated_at || c.created_at, dias.COT, ahora)),
      };
      console.log(JSON.stringify({SC: sc, COT: cot}));
    """, scs=scs, cots=cots, ahora=_ms(ahora), dias=dias, hoy=hoy.isoformat(),
               hoy7=(hoy + timedelta(days=7)).isoformat())
    assert js == servidor, (js, servidor)
    # La prueba muerde: cada cuenta es distinta de cero.
    for t, cuentas in servidor.items():
        assert all(v > 0 for v in cuentas.values()), (t, cuentas)

    # La pestaña de cada pedido (vista del servidor) es la de grupoPedido.
    f2 = _Fabrica(db, ahora)
    estados = list(ETIQUETAS_ESTADO["VEN"]) + ["ESTADO_RARO"]
    por_estado = {e: f2.pven(e).id for e in estados}
    vista_de = {}
    for vista in VISTA_DE_GRUPO.values():
        for x in _lista(app_client, admin_token, "VEN", q=f2.sufijo, vista=vista, limit=200)["data"]:
            assert x["estado"] not in vista_de, x["estado"]
            vista_de[x["estado"]] = vista
    assert set(_ids(app_client, admin_token, "VEN", q=f2.sufijo, vista="todos", limit=200)) == set(por_estado.values())
    js = _node("""
      const {estados, vistaDeGrupo} = entrada;
      const out = {};
      for (const e of estados) { const g = pedidos.grupoPedido(e); out[e] = g ? (vistaDeGrupo[g] ?? null) : null; }
      console.log(JSON.stringify(out));
    """, estados=estados, vistaDeGrupo=dict(VISTA_DE_GRUPO))
    assert js == {e: vista_de.get(e) for e in estados}
    assert js["ESTADO_RARO"] is None and js["DEVUELTO_TOTAL"] == "cancelado" and js["PENDIENTE_PAGO"] == "pend_compra"
