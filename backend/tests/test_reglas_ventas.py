"""B4 T1C (R8, C5, C7; RP2, RP3, RP11, RP12, RP13, RP14, RP71; D16): la regla unica de atraso, resolucion y pasos de
Ventas (app/core/resolucion_ventas.py) y las constantes nuevas de los pedidos (app/core/estados_pedido.py).

Se corre SOLO con el runner de ROLLBACK (python tests/rollback_runner.py test_reglas_ventas): cada prueba va en una
transaccion que se revierte. Como erp_test ya tiene datos, las cuentas se comparan como «despues − antes» sobre documentos
con un sufijo unico. Sin parametrize (el runner no lo soporta): las matrices van en un bucle. La paridad con el frontend
(hub-ventas.js, listas-ventas.js y estados-pedido.js) es de T2 (test_paridad_reglas_ventas.py).
"""
import datetime as _dtmod
import uuid
from datetime import datetime, timedelta

from sqlalchemy import and_, exists, func, or_, select, text
from sqlalchemy.dialects import postgresql

from app.models.confirmation import SeguimientoConfirmacion
from app.models.erp_documents import CustomerRequest, SalesQuotation, SaleOrder

DIAS = {"SC": 2, "COT": 3, "VEN": 4}
ESTADOS_NO_RESOLUCION_DE_ALERTAS = ("BORRADOR", "PENDIENTE_CONFIRMACION", "ASIGNADA", "ENVIADA",
                                    "PENDIENTE_COMPRA", "PENDIENTE_PAGO", "EN_PROCESO", "EN_TRANSITO")
UN_MINUTO = timedelta(minutes=1)


def _ahora():
    from app.core.fechas import ahora_utc
    return ahora_utc()


def _guardar(db, objeto):
    db.add(objeto)
    db.commit()
    return objeto


class _Fabrica:
    """Documentos de prueba con un sufijo unico y fechas fijas: created_at = updated_at = ahora − hace."""

    def __init__(self, db, ahora):
        self.db, self.ahora = db, ahora
        self.sufijo = uuid.uuid4().hex[:8].upper()
        self.n = 0

    def _numero(self, prefijo):
        self.n += 1
        return f"{prefijo}{self.sufijo}{self.n:02d}"

    def _fecha(self, hace):
        return self.ahora - (hace if hace is not None else timedelta(0))

    def sc(self, estado="BORRADOR", hace=None, **campos):
        t = self._fecha(hace)
        sin_tipo = "tipo_solicitud" in campos and campos["tipo_solicitud"] is None
        campos.setdefault("tipo_solicitud", "Cotizacion de Producto")
        if sin_tipo:
            campos.pop("tipo_solicitud")   # el default del modelo pisa un None explicito: se anula despues
        sc = _guardar(self.db, CustomerRequest(numero=self._numero("SC-"), customer_name=f"T1C {self.sufijo}",
                                               estado=estado, created_at=t, updated_at=t, **campos))
        if sin_tipo:
            # Una SC vieja sin tipo (la columna admite NULL). Con SQL directo para no tocar updated_at (onupdate).
            self.db.execute(text("UPDATE customer_requests SET tipo_solicitud = NULL WHERE id = :id"), {"id": sc.id})
            self.db.commit()
            self.db.refresh(sc)
            assert sc.tipo_solicitud is None and sc.updated_at == t
        return sc

    def cot(self, estado="BORRADOR", hace=None, sc=None, **campos):
        t = self._fecha(hace)
        return _guardar(self.db, SalesQuotation(numero=self._numero("COT-"), customer_name=f"T1C {self.sufijo}",
                                                sc_id=sc.id if sc is not None else None, estado=estado,
                                                created_at=t, updated_at=t, **campos))

    def pven(self, estado="PENDIENTE_COMPRA", hace=None, sc=None, cot=None, **campos):
        t = self._fecha(hace)
        sc_id = sc.id if sc is not None else (cot.sc_id if cot is not None else None)
        return _guardar(self.db, SaleOrder(numero=self._numero("PV-"), customer_name=f"T1C {self.sufijo}",
                                           sc_id=sc_id, cot_id=cot.id if cot is not None else None, estado=estado,
                                           created_at=t, updated_at=t, **campos))


def _dias(n):
    return timedelta(days=n)


# ─── Constantes ──────────────────────────────────────────────────────────────────────────────────────────────────────

def test_constantes_de_resolucion():
    from app.core import resolucion_ventas as rv
    from app.core.estados_pedido import ESTADOS_VEN_CERRADOS
    assert rv.TIPO_SOPORTE == "Soporte Tecnico"
    assert rv.ESTADO_SOPORTE == "N/A_SOPORTE"
    # RP2: los 8 de alertas_resumen, en su orden; sin EN_GESTION.
    assert rv.ESTADOS_NO_RESOLUCION == ESTADOS_NO_RESOLUCION_DE_ALERTAS
    assert "EN_GESTION" not in rv.ESTADOS_NO_RESOLUCION
    assert dict(rv.ESTADOS_CERRADOS) == {"SC": ("CANCELADA",), "COT": ("RECHAZADA",), "VEN": ESTADOS_VEN_CERRADOS}
    assert set(rv.ESTADOS_ACCION_TOMADA) == {"SC", "COT", "VEN"}
    assert dict(rv.RANGO) == {"ATRASADO": 0, "NO_RESUELTO": 1, "ACCION_TOMADA": 2, "CERRADO": 3}
    assert rv.PASOS_FLUJO_VENTAS == ("SC", "COT", "PVEN", "ENTREGADO", "FACTURADO")
    # Las copias de B3 (RP12.2) con nombre publico.
    assert dict(rv.ESTADOS_CON_CAMBIOS_VIGENTES) == {"SC": ("ASIGNADA", "BORRADOR"), "COT": ("BORRADOR",)}


def test_estados_accion_tomada_y_cerrados_coinciden_con_clasificar():
    """Cada estado conocido (ETIQUETAS_ESTADO) cae en ESTADOS_ACCION_TOMADA / ESTADOS_CERRADOS de su tipo exactamente
    cuando clasificar lo pone ahi. CONFIRMADA es accion tomada solo con su documento siguiente (reglas 3 y 5)."""
    from app.core import resolucion_ventas as rv
    from app.core.textos_actividad import ETIQUETAS_ESTADO
    contexto = {"SC": {"sc_con_cot_activa": True}, "COT": {"cot_con_pedido_vigente": True}, "VEN": {}}
    for tipo in ("SC", "COT", "VEN"):
        for estado in ETIQUETAS_ESTADO[tipo]:
            flags = contexto[tipo] if estado == "CONFIRMADA" else {}
            r = rv.clasificar(tipo, estado, 1000, DIAS, **flags)
            assert (r == "ACCION_TOMADA") == (estado in rv.ESTADOS_ACCION_TOMADA[tipo]), (tipo, estado, r)
            assert (r == "CERRADO") == (estado in rv.ESTADOS_CERRADOS[tipo]), (tipo, estado, r)


# ─── clasificar (RP2): la tabla, en orden ────────────────────────────────────────────────────────────────────────────

def test_clasificar_matriz():
    from app.core.resolucion_ventas import clasificar
    sc_lim, cot_lim, ven_lim = 2 * 24, 3 * 24, 4 * 24
    m = 1 / 60  # un minuto en horas
    casos = [
        # (tipo, estado, horas_sin_mov, flags, esperado)
        ("SC", "BORRADOR", 0, {}, "NO_RESUELTO"),
        ("SC", "BORRADOR", sc_lim, {}, "NO_RESUELTO"),            # frontera estricta: exactamente dias×24 h no
        ("SC", "BORRADOR", sc_lim + m, {}, "ATRASADO"),           # un minuto mas, si
        ("SC", "ASIGNADA", 100, {}, "ATRASADO"),                  # ASIGNADA incluida (alertas_resumen)
        ("SC", "ASIGNADA", 10, {}, "NO_RESUELTO"),
        ("SC", "PENDIENTE_CONFIRMACION", 100, {"sc_con_cot_activa": True}, "ACCION_TOMADA"),   # regla 3
        ("SC", "CONFIRMADA", 100, {"confirmacion_vigente": True}, "ATRASADO"),                 # regla 4
        ("SC", "CONFIRMADA", 100, {}, "NO_RESUELTO"),             # sin confirmacion vigente nunca atrasa
        ("SC", "CONFIRMADA", 10, {"confirmacion_vigente": True}, "NO_RESUELTO"),
        ("SC", "CONFIRMADA", 100, {"sc_con_cot_activa": True, "confirmacion_vigente": True}, "ACCION_TOMADA"),
        ("SC", "CANCELADA", 100, {}, "CERRADO"),
        ("SC", "CANCELADA", 100, {"sc_con_cot_activa": True}, "CERRADO"),                       # regla 2 antes de 3
        ("SC", "BORRADOR", 100, {"es_soporte": True}, None),                                    # regla 1
        ("SC", "N/A_SOPORTE", 100, {}, None),
        ("COT", "BORRADOR", 100, {"es_soporte": True}, "ATRASADO"),       # r1: Soporte solo en SC (como el SQL)
        ("COT", "N/A_SOPORTE", 100, {}, "ACCION_TOMADA"),
        ("VEN", "EN_PROCESO", 200, {"es_soporte": True}, "ATRASADO"),
        ("VEN", "N/A_SOPORTE", 200, {"es_soporte": True}, "ACCION_TOMADA"),
        ("SC", "COTIZADA", 100, {}, "ACCION_TOMADA"),             # heredado: regla 8
        ("COT", "BORRADOR", cot_lim, {}, "NO_RESUELTO"),
        ("COT", "BORRADOR", cot_lim + m, {}, "ATRASADO"),
        ("COT", "ENVIADA", 100, {}, "ATRASADO"),
        ("COT", "PENDIENTE_CONFIRMACION", 1, {}, "NO_RESUELTO"),
        ("COT", "CONFIRMADA", 100, {"confirmacion_vigente": True}, "ATRASADO"),                # regla 5
        ("COT", "CONFIRMADA", 1, {"confirmacion_vigente": True}, "NO_RESUELTO"),
        ("COT", "CONFIRMADA", 100, {}, "NO_RESUELTO"),
        ("COT", "CONFIRMADA", 100, {"cot_con_pedido_vigente": True, "confirmacion_vigente": True}, "ACCION_TOMADA"),
        ("COT", "RECHAZADA", 100, {}, "CERRADO"),
        ("COT", "VENCIDA", 1000, {}, "NO_RESUELTO"),              # regla 7: nunca atrasada
        ("COT", "VENCIDA", 1000, {"confirmacion_vigente": True}, "NO_RESUELTO"),
        ("COT", "EN_GESTION", 1000, {}, "ACCION_TOMADA"),         # RP2: EN_GESTION ya no es «no resuelto»
        ("VEN", "PENDIENTE_COMPRA", ven_lim, {}, "NO_RESUELTO"),
        ("VEN", "PENDIENTE_COMPRA", ven_lim + m, {}, "ATRASADO"),
        ("VEN", "EN_PROCESO", 200, {"sc_con_cot_activa": True}, "ATRASADO"),   # las banderas de SC no aplican
        ("VEN", "EN_TRANSITO", 200, {}, "ATRASADO"),
        ("VEN", "PENDIENTE_PAGO", 200, {}, "ATRASADO"),
        ("VEN", "LISTO_ENTREGA", 200, {}, "ACCION_TOMADA"),
        ("VEN", "PENDIENTE_ANTICIPO", 200, {}, "ACCION_TOMADA"),  # fuera de no_resolucion, como alertas_resumen
        ("VEN", "ENTREGADO", 200, {}, "CERRADO"),
        ("VEN", "FACTURADO", 200, {}, "CERRADO"),
        ("VEN", "CANCELADO", 200, {}, "CERRADO"),
        ("VEN", "DEVUELTO_TOTAL", 200, {}, "CERRADO"),
        ("PVEN", "EN_PROCESO", 200, {}, "ATRASADO"),              # PVEN es alias de VEN
        ("SC", "BORRADOR", None, {}, "NO_RESUELTO"),              # sin fecha no supera nada
    ]
    for tipo, estado, horas, flags, esperado in casos:
        assert clasificar(tipo, estado, horas, DIAS, **flags) == esperado, (tipo, estado, horas, flags)
    # dias_alerta tambien puede ser el numero de dias del tipo.
    assert clasificar("SC", "BORRADOR", 48, 2) == "NO_RESUELTO"
    assert clasificar("SC", "BORRADOR", 48 + m, 2) == "ATRASADO"


def test_clasificar_firma_de_rp2():
    """RP2: horas y dias posicionales; las banderas solo por nombre; confirmacion_vigente (no confirmacion_cliente)."""
    import inspect
    from app.core.resolucion_ventas import clasificar
    params = inspect.signature(clasificar).parameters
    assert list(params) == ["tipo", "estado", "horas_sin_mov", "dias_alerta", "sc_con_cot_activa",
                            "cot_con_pedido_vigente", "confirmacion_vigente", "es_soporte"]
    for nombre in ("sc_con_cot_activa", "cot_con_pedido_vigente", "confirmacion_vigente", "es_soporte"):
        assert params[nombre].kind is inspect.Parameter.KEYWORD_ONLY and params[nombre].default is False


def test_horas_desde_movimiento():
    from app.core.resolucion_ventas import horas_desde_movimiento
    ahora = datetime(2026, 10, 28, 12, 0, 0)
    assert horas_desde_movimiento(ahora - timedelta(hours=5), None, ahora) == 5
    assert horas_desde_movimiento(None, ahora - timedelta(hours=7), ahora) == 7   # sin updated_at, created_at
    assert horas_desde_movimiento(ahora - timedelta(hours=1), ahora - timedelta(hours=9), ahora) == 1
    assert horas_desde_movimiento(None, None, ahora) is None


# ─── columna_hub (C7) ────────────────────────────────────────────────────────────────────────────────────────────────

def test_columna_hub_conserva_las_columnas_del_bloque_1():
    from app.core.resolucion_ventas import columna_hub
    casos = [
        ("SC", "CONFIRMADA", False, "No Resuelto"),      # H3: falta cotizarla
        ("SC", "CONFIRMADA", True, "Acción Tomada"),
        ("SC", "PENDIENTE_CONFIRMACION", True, "Acción Tomada"),   # R20: la alerta la lleva su cotizacion
        ("SC", "BORRADOR", False, "No Resuelto"),
        ("SC", "ASIGNADA", False, "No Resuelto"),
        ("SC", "CANCELADA", False, "Cancelado"),
        ("COT", "RECHAZADA", False, "Cancelado"),
        ("COT", "ENVIADA", False, "En Gestión"),
        ("COT", "CONFIRMADA", False, "Acción Tomada"),
        ("COT", "BORRADOR", False, "No Resuelto"),
        ("COT", "VENCIDA", False, "No Resuelto"),
        ("VEN", "CANCELADO", False, "Cancelado"),
        ("VEN", "DEVUELTO_TOTAL", False, "Cancelado"),   # C7: DEVUELTO_TOTAL → Cancelado
        ("VEN", "ENTREGADO", False, "Acción Tomada"),
        ("VEN", "FACTURADO", False, "Acción Tomada"),
        ("VEN", "LISTO_ENTREGA", False, "Acción Tomada"),
        ("VEN", "EN_PROCESO", False, "En Gestión"),
        ("VEN", "EN_TRANSITO", False, "En Gestión"),
        ("VEN", "PENDIENTE_COMPRA", False, "No Resuelto"),
        ("PVEN", "DEVUELTO_TOTAL", False, "Cancelado"),
    ]
    for tipo, estado, con_cot, esperado in casos:
        assert columna_hub(tipo, estado, con_cot) == esperado, (tipo, estado, con_cot)
    assert columna_hub("SC", "CONFIRMADA") == "No Resuelto"   # sc_con_cot_activa=False por defecto


# ─── Subconsultas y filtros SQL: copias exactas (RP11, RP12) ─────────────────────────────────────────────────────────

def _sql(expr):
    return str(expr.compile(dialect=postgresql.dialect()))


def test_sc_sin_documentos_activos_es_la_copia_de_erp_ventas():
    """RP11.1: la misma subconsulta de _sc_sin_documentos_activos (con su correlate), armada con cot_activa_de_sc y
    pven_vigente_de_sc; sc_con_documentos_activos es su negacion (D16)."""
    from app.api.v1 import erp_ventas
    from app.core import resolucion_ventas as rv
    assert _sql(rv.sc_sin_documentos_activos()) == _sql(erp_ventas._sc_sin_documentos_activos())
    assert _sql(rv.sc_sin_documentos_activos()) == _sql(and_(~rv.cot_activa_de_sc(), ~rv.pven_vigente_de_sc()))
    assert _sql(rv.sc_con_documentos_activos()) == _sql(or_(rv.cot_activa_de_sc(), rv.pven_vigente_de_sc()))


def test_filtro_cambios_cliente_vigentes_es_la_copia_de_erp_ventas():
    from app.api.v1 import erp_ventas
    from app.core import resolucion_ventas as rv
    assert dict(rv.ESTADOS_CON_CAMBIOS_VIGENTES) == erp_ventas._ESTADOS_CON_CAMBIOS_VIGENTES
    for modelo, entidad in ((CustomerRequest, "SC"), (SalesQuotation, "COT")):
        assert _sql(rv.filtro_cambios_cliente_vigentes(modelo, entidad)) == \
            _sql(erp_ventas._filtro_cambios_cliente_vigentes(modelo, entidad))


def test_sin_soporte_deja_pasar_el_tipo_nulo(db):
    """RP11.2: un tipo_solicitud NULL no es Soporte; el tipo 'Soporte Tecnico' y el estado N/A_SOPORTE si."""
    from app.core.resolucion_ventas import sin_soporte
    f = _Fabrica(db, _ahora())
    sin_tipo = f.sc("BORRADOR", tipo_solicitud=None)
    db.refresh(sin_tipo)
    assert sin_tipo.tipo_solicitud is None
    normal = f.sc("BORRADOR")
    soporte = f.sc("BORRADOR", tipo_solicitud="Soporte Tecnico")
    na = f.sc("N/A_SOPORTE", tipo_solicitud="Cotizacion de Producto")
    ids = [sin_tipo.id, normal.id, soporte.id, na.id]
    pasan = set(db.scalars(select(CustomerRequest.id).where(CustomerRequest.id.in_(ids),
                                                            sin_soporte(CustomerRequest))))
    assert pasan == {sin_tipo.id, normal.id}


# ─── expresiones (SQL) = clasificar (Python) ─────────────────────────────────────────────────────────────────────────

def test_expresiones_dan_el_mismo_rango_que_clasificar(db):
    from app.core import resolucion_ventas as rv
    ahora = _ahora()
    f = _Fabrica(db, ahora)
    d = _dias
    # Contexto (con fecha de hoy: no entra en las aserciones).
    sc_ctx_cot = f.sc("CONFIRMADA", d(5), gate1_confirmed_at=ahora - d(5))
    sc_ctx_temprana = f.sc("PENDIENTE_CONFIRMACION", d(5))
    sc_ctx_pven = f.sc("BORRADOR", d(5))
    sc_ctx_rech_pven = f.sc("BORRADOR", d(5))
    sc_ctx_rech = f.sc("BORRADOR", d(5))
    f.cot("BORRADOR", sc=sc_ctx_cot)
    f.cot("ENVIADA", sc=sc_ctx_temprana)
    f.pven("EN_PROCESO", sc=sc_ctx_pven)                         # D16: pedido vigente por sc_id, sin COT
    cot_rech_con_pven = f.cot("RECHAZADA", sc=sc_ctx_rech_pven)
    f.pven("EN_PROCESO", cot=cot_rech_con_pven)                  # D16: pedido por el cot_id de una COT de la SC
    f.cot("RECHAZADA", sc=sc_ctx_rech)                           # N7: la rechazada no cuenta
    esperado_sc = {
        f.sc("BORRADOR", d(2)).id: 1,
        f.sc("BORRADOR", d(2) + UN_MINUTO).id: 0,
        f.sc("ASIGNADA", d(5)).id: 0,
        f.sc("CONFIRMADA", d(5), gate1_confirmed_at=ahora - d(5)).id: 0,
        f.sc("CONFIRMADA", d(5)).id: 1,
        sc_ctx_cot.id: 2,
        sc_ctx_temprana.id: 2,
        sc_ctx_pven.id: 2,
        sc_ctx_rech_pven.id: 2,
        sc_ctx_rech.id: 0,
        f.sc("CANCELADA", d(5)).id: 3,
        f.sc("BORRADOR", d(5), tipo_solicitud="Soporte Tecnico").id: None,
        f.sc("N/A_SOPORTE", d(5)).id: None,
        f.sc("BORRADOR", d(5), tipo_solicitud=None).id: 0,
        f.sc("COTIZADA", d(5)).id: 2,
    }
    cot_con_pven = f.cot("CONFIRMADA", d(5), gate2_confirmed_at=ahora - d(5))
    f.pven("EN_PROCESO", cot=cot_con_pven)
    cot_pven_caido = f.cot("CONFIRMADA", d(5), gate2_confirmed_at=ahora - d(5))
    f.pven("CANCELADO", cot=cot_pven_caido)
    esperado_cot = {
        f.cot("BORRADOR", d(3)).id: 1,
        f.cot("BORRADOR", d(3) + UN_MINUTO).id: 0,
        f.cot("CONFIRMADA", d(5), gate2_confirmed_at=ahora - d(5)).id: 0,
        f.cot("CONFIRMADA", d(1), gate2_confirmed_at=ahora - d(1)).id: 1,
        f.cot("CONFIRMADA", d(5)).id: 1,
        cot_con_pven.id: 2,
        cot_pven_caido.id: 0,
        f.cot("RECHAZADA", d(5)).id: 3,
        f.cot("VENCIDA", d(50)).id: 1,
        f.cot("ENVIADA", d(5)).id: 0,
    }
    esperado_ven = {
        f.pven("PENDIENTE_COMPRA", d(4)).id: 1,
        f.pven("PENDIENTE_COMPRA", d(4) + UN_MINUTO).id: 0,
        f.pven("LISTO_ENTREGA", d(10)).id: 2,
        f.pven("ENTREGADO", d(10)).id: 3,
        f.pven("DEVUELTO_TOTAL", d(10)).id: 3,
        f.pven("EN_TRANSITO", d(10)).id: 0,
        f.pven("PENDIENTE_ANTICIPO", d(10)).id: 2,
        f.pven("N/A_SOPORTE", d(10)).id: 2,          # r1: Soporte solo en SC; en un pedido es un estado mas (regla 8)
    }
    esperado_cot[f.cot("N/A_SOPORTE", d(10)).id] = 2   # r1: igual en una COT
    nombre_de_rango = {v: k for k, v in rv.RANGO.items()}
    for tipo, modelo, esperado in (("SC", CustomerRequest, esperado_sc), ("COT", SalesQuotation, esperado_cot),
                                   ("VEN", SaleOrder, esperado_ven)):
        exprs = rv.expresiones(tipo, modelo, DIAS, ahora)
        assert set(exprs) == {"rango", "dias_sin_mov", "dias_creado", "sc_con_cot_activa", "cot_con_pedido_vigente"}
        columna = rv.expr_columna_hub(tipo, modelo)
        filas = db.execute(select(modelo, *[e.label(k) for k, e in exprs.items()], columna.label("columna"))
                           .where(modelo.id.in_(list(esperado)))).all()
        assert len(filas) == len(esperado)
        for fila in filas:
            doc = fila[0]
            assert fila.rango == esperado[doc.id], (tipo, doc.numero, doc.estado, fila.rango)
            horas = rv.horas_desde_movimiento(doc.updated_at, doc.created_at, ahora)
            confirmacion = (doc.estado == "CONFIRMADA" and doc.gate1_confirmed_at is not None) if tipo == "SC" \
                else (doc.gate2_confirmed_at is not None if tipo == "COT" else False)
            # r1: en COT y VEN la bandera de Soporte no cambia nada (el SQL no la mira): se prueban los dos valores.
            banderas = [doc.tipo_solicitud == "Soporte Tecnico" or doc.estado == "N/A_SOPORTE"] if tipo == "SC" \
                else [False, True]
            for es_soporte in banderas:
                r = rv.clasificar(tipo, doc.estado, horas, DIAS, sc_con_cot_activa=bool(fila.sc_con_cot_activa),
                                  cot_con_pedido_vigente=bool(fila.cot_con_pedido_vigente),
                                  confirmacion_vigente=confirmacion, es_soporte=es_soporte)
                assert r == nombre_de_rango.get(fila.rango), (tipo, doc.numero, doc.estado, es_soporte, r, fila.rango)
            assert fila.dias_sin_mov == int(horas // 24), (doc.numero, fila.dias_sin_mov, horas)
            assert fila.dias_creado == int(rv.horas_desde_movimiento(None, doc.created_at, ahora) // 24)
            assert fila.columna == rv.columna_hub(tipo, doc.estado, bool(fila.sc_con_cot_activa)), doc.numero
    # D16: la SC con un pedido vigente (por sc_id o por el cot_id de una COT rechazada) tiene documentos activos.
    con_docs = dict(db.execute(select(CustomerRequest.id, rv.expresiones("SC", CustomerRequest, DIAS, ahora)
                                      ["sc_con_cot_activa"])
                               .where(CustomerRequest.id.in_([sc_ctx_pven.id, sc_ctx_rech_pven.id, sc_ctx_rech.id,
                                                              sc_ctx_cot.id]))).all())
    assert con_docs == {sc_ctx_pven.id: True, sc_ctx_rech_pven.id: True, sc_ctx_rech.id: False, sc_ctx_cot.id: True}


# ─── contar_atrasados: la copia fiel de alertas_resumen ──────────────────────────────────────────────────────────────

class _RelojFijo(datetime):
    """datetime.datetime con utcnow fijo, para que alertas_resumen y contar_atrasados usen el mismo instante."""

    fijo = None

    @classmethod
    def utcnow(cls):
        return cls.fijo


class _DatetimeConRelojFijo:
    """El modulo datetime tal cual, salvo datetime.datetime (con utcnow fijo)."""

    datetime = _RelojFijo

    def __getattr__(self, nombre):
        return getattr(_dtmod, nombre)


def _alertas_atrasados(app_client, admin_token):
    resp = app_client.get("/api/v1/ventas/alertas/resumen", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["atrasados"]


def _solo_cuenta_alertas(db, dias, ahora):
    """Las SC que alertas_resumen cuenta y contar_atrasados no (las dos diferencias permitidas), con la logica del
    endpoint de hoy: (a) las de Soporte Tecnico (R8) y (b) D16, una SC CONFIRMADA sin COT activa pero con un pedido
    vigente (por sc_id o por el cot_id de una de sus COT)."""
    from app.api.v1 import erp_ventas
    cr = CustomerRequest
    limite = ahora - timedelta(days=dias["SC"])
    es_soporte = or_(func.coalesce(cr.tipo_solicitud, "") == "Soporte Tecnico", cr.estado == "N/A_SOPORTE")
    sc_atrasada = and_(cr.estado.in_(ESTADOS_NO_RESOLUCION_DE_ALERTAS), cr.updated_at < limite,
                       erp_ventas._sc_sin_documentos_activos())
    sin_cot_activa = ~exists().where(SalesQuotation.sc_id == cr.id, SalesQuotation.estado != "RECHAZADA")
    sc_confirmada = and_(cr.estado == "CONFIRMADA", cr.gate1_confirmed_at.isnot(None), cr.updated_at < limite,
                         sin_cot_activa)
    soporte = db.scalar(select(func.count(cr.id)).where(es_soporte, or_(sc_atrasada, sc_confirmada)))
    d16 = db.scalar(select(func.count(cr.id)).where(~es_soporte, sc_confirmada,
                                                    ~erp_ventas._sc_sin_documentos_activos()))
    return soporte, d16


def test_contar_atrasados_es_la_copia_fiel_de_alertas_resumen(app_client, db, admin_token, monkeypatch):
    """Sobre TODA la base y sobre documentos nuevos: GET /ventas/alertas/resumen (antes de T6A) y contar_atrasados dan
    lo mismo, salvo las SC de Soporte (R8) y la SC confirmada con pedido vigente y sin COT activa (D16)."""
    from app.api.v1 import erp_ventas
    from app.core import resolucion_ventas as rv
    ahora = _ahora()
    _RelojFijo.fijo = ahora
    monkeypatch.setattr(erp_ventas, "datetime", _DatetimeConRelojFijo())
    dias = rv.leer_dias_alerta(db)

    api_antes = _alertas_atrasados(app_client, admin_token)
    antes = rv.contar_atrasados(db, dias, ahora)
    assert set(antes) == {"sc", "sc_confirmadas_sin_accion", "cot", "cot_confirmadas_sin_accion", "ven"}

    f = _Fabrica(db, ahora)
    viejo = {k: timedelta(days=dias[k] + 3) for k in dias}
    f.sc("BORRADOR", viejo["SC"])                                              # sc +1
    f.sc("ASIGNADA", viejo["SC"])                                              # sc +1 (ASIGNADA incluida)
    f.sc("BORRADOR")                                                           # reciente: no
    sc_con_cot = f.sc("BORRADOR", viejo["SC"])
    f.cot("BORRADOR", sc=sc_con_cot)                                           # la alerta la lleva su COT (reciente)
    f.sc("CONFIRMADA", viejo["SC"], gate1_confirmed_at=ahora - viejo["SC"])    # sc_confirmadas_sin_accion +1
    f.sc("CONFIRMADA", viejo["SC"])                                            # sin marca gate1: no
    f.sc("CANCELADA", viejo["SC"])                                             # no
    f.sc("BORRADOR", viejo["SC"], tipo_solicitud="Soporte Tecnico")            # solo alertas_resumen (R8)
    sc_d16 = f.sc("CONFIRMADA", viejo["SC"], gate1_confirmed_at=ahora - viejo["SC"])
    f.pven("EN_PROCESO", sc=sc_d16)                                            # solo alertas_resumen (D16)
    f.cot("PENDIENTE_CONFIRMACION", viejo["COT"])                              # cot +1
    f.cot("RECHAZADA", viejo["COT"])                                           # no
    f.cot("CONFIRMADA", viejo["COT"], gate2_confirmed_at=ahora - viejo["COT"])  # cot_confirmadas_sin_accion +1
    cot_con_pven = f.cot("CONFIRMADA", viejo["COT"], gate2_confirmed_at=ahora - viejo["COT"])
    f.pven("PENDIENTE_COMPRA", cot=cot_con_pven)                               # el asesor ya actuo (pedido reciente)
    f.pven("PENDIENTE_COMPRA", viejo["VEN"])                                   # ven +1
    f.pven("LISTO_ENTREGA", viejo["VEN"])                                      # no

    api_despues = _alertas_atrasados(app_client, admin_token)
    despues = rv.contar_atrasados(db, dias, ahora)
    delta = {k: despues[k] - antes[k] for k in despues}
    assert delta == {"sc": 2, "sc_confirmadas_sin_accion": 1, "cot": 1, "cot_confirmadas_sin_accion": 1, "ven": 1}
    assert api_despues - api_antes == sum(delta.values()) + 2   # + la de Soporte + la de D16

    soporte, d16 = _solo_cuenta_alertas(db, dias, ahora)
    assert api_despues - sum(despues.values()) == soporte + d16, (
        f"toda la base: alertas_resumen={api_despues}, contar_atrasados={sum(despues.values())} {despues}, "
        f"solo en alertas: Soporte={soporte}, D16={d16}")


def test_contar_atrasados_frontera_estricta(db):
    from app.core import resolucion_ventas as rv
    ahora = _ahora()
    antes = rv.contar_atrasados(db, DIAS, ahora)
    f = _Fabrica(db, ahora)
    f.sc("BORRADOR", _dias(2))                       # exactamente 2 dias: no
    f.sc("BORRADOR", _dias(2) + UN_MINUTO)           # un minuto mas: si
    f.cot("ENVIADA", _dias(3))
    f.cot("ENVIADA", _dias(3) + UN_MINUTO)
    f.pven("EN_TRANSITO", _dias(4))
    f.pven("EN_TRANSITO", _dias(4) + UN_MINUTO)
    despues = rv.contar_atrasados(db, DIAS, ahora)
    assert {k: despues[k] - antes[k] for k in despues} == {"sc": 1, "sc_confirmadas_sin_accion": 0, "cot": 1,
                                                           "cot_confirmadas_sin_accion": 0, "ven": 1}


# ─── leer_dias_alerta (RP71) ─────────────────────────────────────────────────────────────────────────────────────────

def test_leer_dias_alerta_una_consulta_y_lo_mismo_que_get_alert_days(db, contador_sql):
    from app.api.v1.erp_ventas import _get_alert_days
    from app.core.resolucion_ventas import leer_dias_alerta
    with contador_sql.ventana() as v:
        dias = leer_dias_alerta(db)
    assert v.consultas == 1
    assert dias == {"SC": _get_alert_days(db, "alerta_sc_dias"), "COT": _get_alert_days(db, "alerta_cot_dias"),
                    "VEN": _get_alert_days(db, "alerta_ven_dias")}


def test_leer_dias_alerta_interpreta_como_get_alert_days(db, monkeypatch):
    from app.core import admin_config
    from app.core.resolucion_ventas import leer_dias_alerta
    pedidas = []
    casos = [
        ({}, {"SC": 2, "COT": 2, "VEN": 2}),
        ({"alerta_sc_dias": "5", "alerta_cot_dias": "abc", "alerta_ven_dias": None}, {"SC": 5, "COT": 2, "VEN": 2}),
        ({"alerta_sc_dias": " 7 ", "alerta_cot_dias": "3.5", "alerta_ven_dias": "-1"}, {"SC": 7, "COT": 2, "VEN": -1}),
        ({"alerta_sc_dias": "0", "alerta_cot_dias": "", "alerta_ven_dias": "30"}, {"SC": 0, "COT": 2, "VEN": 30}),
    ]
    for valores, esperado in casos:
        def falso(_db, claves, valores=valores):
            pedidas.append(list(claves))
            return dict(valores)
        monkeypatch.setattr(admin_config, "leer_config", falso)
        assert leer_dias_alerta(db) == esperado, valores
    assert all(c == ["alerta_sc_dias", "alerta_cot_dias", "alerta_ven_dias"] for c in pedidas)


# ─── cond_paso: cada documento en un solo paso (prueba 1 de FLUJO-ventas-datos) ──────────────────────────────────────

def test_cond_paso_cada_documento_cae_en_un_solo_paso(db):
    from app.core import resolucion_ventas as rv
    ahora = _ahora()
    f = _Fabrica(db, ahora)
    esperado = {}   # (tipo, id) -> paso o None
    sc = f.sc("BORRADOR")
    esperado[("SC", sc.id)] = "SC"                               # SC sin COT
    sc2 = f.sc("BORRADOR")
    esperado[("SC", sc2.id)] = None                              # SC con COT activa: se cuenta en COT
    esperado[("COT", f.cot("BORRADOR", sc=sc2).id)] = "COT"
    sc3 = f.sc("CONFIRMADA")
    esperado[("SC", sc3.id)] = "SC"                              # SC con COT RECHAZADA: sigue en SC
    esperado[("COT", f.cot("RECHAZADA", sc=sc3).id)] = None
    cot = f.cot("CONFIRMADA")
    esperado[("COT", cot.id)] = None                             # COT con pedido vigente: se cuenta en PVEN
    esperado[("VEN", f.pven("EN_PROCESO", cot=cot).id)] = "PVEN"
    cot2 = f.cot("CONFIRMADA")
    esperado[("COT", cot2.id)] = "COT"                           # COT con su pedido cancelado
    esperado[("VEN", f.pven("CANCELADO", cot=cot2).id)] = None
    esperado[("COT", f.cot("VENCIDA").id)] = "COT"               # VENCIDA cuenta como abierta (Bloque 1)
    esperado[("VEN", f.pven("ENTREGADO").id)] = "ENTREGADO"
    esperado[("VEN", f.pven("FACTURADO").id)] = "FACTURADO"
    esperado[("VEN", f.pven("DEVUELTO_TOTAL").id)] = None
    esperado[("VEN", f.pven("LISTO_ENTREGA").id)] = "PVEN"
    esperado[("SC", f.sc("N/A_SOPORTE").id)] = None
    esperado[("SC", f.sc("BORRADOR", tipo_solicitud="Soporte Tecnico").id)] = None
    esperado[("SC", f.sc("CANCELADA").id)] = None
    esperado[("SC", f.sc("BORRADOR", tipo_solicitud=None).id)] = "SC"   # RP11.3: tipo NULL no es Soporte
    sc4 = f.sc("BORRADOR")
    esperado[("SC", sc4.id)] = None                              # pedido vigente sin COT (RP11): se cuenta en PVEN
    esperado[("VEN", f.pven("PENDIENTE_COMPRA", sc=sc4).id)] = "PVEN"

    tipo_de_modelo = {CustomerRequest: "SC", SalesQuotation: "COT", SaleOrder: "VEN"}
    ids = {t: [i for (tt, i) in esperado if tt == t] for t in ("SC", "COT", "VEN")}
    pasos_de = {}
    for paso in rv.PASOS_FLUJO_VENTAS:
        modelo, cond = rv.cond_paso(paso)
        tipo = tipo_de_modelo[modelo]
        for (doc_id,) in db.execute(select(modelo.id).where(cond, modelo.id.in_(ids[tipo]))).all():
            pasos_de.setdefault((tipo, doc_id), []).append(paso)
    for clave, paso in esperado.items():
        assert pasos_de.get(clave, []) == ([paso] if paso else []), (clave, pasos_de.get(clave))


# ─── contar_no_resueltos (RP13) ──────────────────────────────────────────────────────────────────────────────────────

def test_contar_no_resueltos_cuenta_los_rangos_sin_resolver(db):
    from app.core import resolucion_ventas as rv
    ahora = _ahora()
    antes = rv.contar_no_resueltos(db)
    assert set(antes) == {"sc", "cot", "ven"}
    f = _Fabrica(db, ahora)
    sc_con_cot = f.sc("CONFIRMADA", _dias(5), gate1_confirmed_at=ahora)
    nuevos = {
        "SC": [f.sc("BORRADOR"), f.sc("ASIGNADA", _dias(9)), f.sc("CONFIRMADA"),       # +3
               sc_con_cot, f.sc("BORRADOR", tipo_solicitud="Soporte Tecnico"), f.sc("CANCELADA")],
        "COT": [f.cot("ENVIADA"), f.cot("CONFIRMADA"), f.cot("VENCIDA", _dias(40)),      # +3
                f.cot("RECHAZADA"), f.cot("BORRADOR", sc=sc_con_cot)],                    # +1 (la COT de la SC)
        "VEN": [f.pven("EN_PROCESO"), f.pven("LISTO_ENTREGA"), f.pven("ENTREGADO")],      # +1
    }
    cot_con_pven = f.cot("CONFIRMADA", gate2_confirmed_at=ahora)
    nuevos["COT"].append(cot_con_pven)
    nuevos["VEN"].append(f.pven("PENDIENTE_COMPRA", cot=cot_con_pven))                  # +1 (y su COT no)
    despues = rv.contar_no_resueltos(db)
    assert {k: despues[k] - antes[k] for k in despues} == {"sc": 3, "cot": 4, "ven": 2}
    # Son exactamente las filas cuyo rango de expresiones es ATRASADO o NO_RESUELTO (RP13).
    for tipo, modelo in (("SC", CustomerRequest), ("COT", SalesQuotation), ("VEN", SaleOrder)):
        rango = rv.expresiones(tipo, modelo, DIAS, ahora)["rango"]
        n = db.scalar(select(func.count(modelo.id)).where(modelo.id.in_([d.id for d in nuevos[tipo]]),
                                                         rango.in_((0, 1))))
        assert n == {"SC": 3, "COT": 4, "VEN": 2}[tipo], tipo


# ─── resumen_flujo_ventas ────────────────────────────────────────────────────────────────────────────────────────────

def _deltas(antes, despues):
    out = {}
    for paso, datos in despues["pasos"].items():
        a = antes["pasos"][paso]
        por_estado = {e: n - a["por_estado"].get(e, 0) for e, n in datos["por_estado"].items()
                      if n != a["por_estado"].get(e, 0)}
        atr = None if datos["atrasados"] is None else datos["atrasados"] - a["atrasados"]
        out[paso] = {"total": datos["total"] - a["total"], "atrasados": atr, "por_estado": por_estado}
    return out


def test_resumen_flujo_ventas_pasos_atrasados_y_semaforo(db):
    from app.core import resolucion_ventas as rv
    from app.core.fechas import iso_z
    ahora = _ahora()
    antes = rv.resumen_flujo_ventas(db, DIAS, ahora)
    assert set(antes) == {"cambios_cliente", "sin_respuesta", "pasos", "semaforo", "dias_alerta", "generado_at"}
    assert list(antes["pasos"]) == list(rv.PASOS_FLUJO_VENTAS)
    for datos in antes["pasos"].values():
        assert set(datos) == {"total", "atrasados", "mas_antiguo_dias", "por_estado"}

    f = _Fabrica(db, ahora)
    f.sc("BORRADOR", _dias(5))
    f.sc("ASIGNADA", _dias(3))
    f.sc("CONFIRMADA", _dias(5), gate1_confirmed_at=ahora - _dias(5))
    sc_con_cot = f.sc("BORRADOR")
    f.cot("BORRADOR", _dias(5), sc=sc_con_cot)
    f.cot("PENDIENTE_CONFIRMACION", _dias(5))
    f.cot("CONFIRMADA", _dias(5), gate2_confirmed_at=ahora - _dias(5))
    cot_con_pven = f.cot("CONFIRMADA", gate2_confirmed_at=ahora)
    f.pven("EN_PROCESO", _dias(5), cot=cot_con_pven)
    f.pven("LISTO_ENTREGA", _dias(5))
    f.pven("ENTREGADO", _dias(1))
    f.pven("FACTURADO", _dias(1))
    f.pven("DEVUELTO_TOTAL", _dias(5))
    f.sc("BORRADOR", _dias(5), tipo_solicitud="Soporte Tecnico")
    despues = rv.resumen_flujo_ventas(db, DIAS, ahora)

    assert _deltas(antes, despues) == {
        "SC": {"total": 3, "atrasados": 3, "por_estado": {"BORRADOR": 1, "ASIGNADA": 1, "CONFIRMADA": 1}},
        "COT": {"total": 3, "atrasados": 3, "por_estado": {"BORRADOR": 1, "PENDIENTE_CONFIRMACION": 1,
                                                          "CONFIRMADA": 1}},
        "PVEN": {"total": 2, "atrasados": 1, "por_estado": {"EN_PROCESO": 1, "LISTO_ENTREGA": 1}},
        "ENTREGADO": {"total": 1, "atrasados": None, "por_estado": {"ENTREGADO": 1}},
        "FACTURADO": {"total": 1, "atrasados": None, "por_estado": {"FACTURADO": 1}},
    }
    assert despues["semaforo"]["atrasados"] - antes["semaforo"]["atrasados"] == 7
    assert despues["semaforo"]["no_resueltos"] - antes["semaforo"]["no_resueltos"] == 7
    # El semaforo es la suma de las mismas cuentas de la pastilla (contar_atrasados) y de RP13.
    assert despues["semaforo"]["atrasados"] == sum(rv.contar_atrasados(db, DIAS, ahora).values())
    assert despues["semaforo"]["no_resueltos"] == sum(rv.contar_no_resueltos(db).values())
    for paso in ("SC", "COT", "PVEN"):
        assert despues["pasos"][paso]["mas_antiguo_dias"] >= 5, paso
    assert despues["pasos"]["ENTREGADO"]["mas_antiguo_dias"] >= 1
    assert despues["pasos"]["FACTURADO"]["mas_antiguo_dias"] is None
    for paso, datos in despues["pasos"].items():
        assert datos["total"] == sum(datos["por_estado"].values()), paso
    assert despues["dias_alerta"] == DIAS
    assert despues["generado_at"] == iso_z(ahora) and despues["generado_at"].endswith("Z")


def test_resumen_flujo_ventas_cambios_del_cliente_y_sin_respuesta(db, user_vendedor, user_admin):
    """RP12: cambios_cliente {SC, COT} con el filtro de _contar_cambios_cliente (y asesor_id como el ASESOR) y
    sin_respuesta {SC, COT}: seguimientos AGOTADO cuyo documento sigue en PENDIENTE_CONFIRMACION."""
    from app.core import resolucion_ventas as rv
    ahora = _ahora()
    yo, otro = user_vendedor.id, user_admin.id

    def leer():
        return (rv.resumen_flujo_ventas(db, DIAS, ahora), rv.resumen_flujo_ventas(db, DIAS, ahora, asesor_id=yo),
                rv.resumen_flujo_ventas(db, DIAS, ahora, asesor_id=otro))

    antes = leer()
    f = _Fabrica(db, ahora)
    marca = {"cambios_cliente_at": ahora, "cambios_cliente_tipo": "CAMBIOS"}
    sc_mia = f.sc("ASIGNADA", advisor_user_id=yo, **marca)                  # SC +1 (mia)
    f.sc("BORRADOR", advisor_user_id=otro, **marca)                         # SC +1 (ajena)
    f.sc("CANCELADA", advisor_user_id=yo, **marca)                          # no: la marca ya no esta vigente
    f.cot("BORRADOR", sc=sc_mia, **marca)                                   # COT +1 (mia, por el asesor de su SC)
    f.cot("ENVIADA", sc=sc_mia, **marca)                                    # no vigente

    def seguimiento(tipo, doc, estado):
        _guardar(db, SeguimientoConfirmacion(document_type=tipo, document_id=doc.id, document_numero=doc.numero,
                                             estado=estado, iniciado_at=ahora, ultimo_contacto_at=ahora))

    seguimiento("SC", f.sc("PENDIENTE_CONFIRMACION"), "AGOTADO")            # sin_respuesta SC +1
    seguimiento("SC", f.sc("CONFIRMADA"), "AGOTADO")                        # el cliente ya respondio: no
    seguimiento("SC", f.sc("PENDIENTE_CONFIRMACION"), "ACTIVO")             # todavia programado: no
    seguimiento("COT", f.cot("PENDIENTE_CONFIRMACION"), "AGOTADO")          # sin_respuesta COT +1
    seguimiento("COT", f.cot("PENDIENTE_CONFIRMACION"), "DETENIDO")         # no
    despues = leer()

    def delta(i, clave):
        return {k: despues[i][clave][k] - antes[i][clave][k] for k in ("SC", "COT")}

    assert delta(0, "cambios_cliente") == {"SC": 2, "COT": 1}
    assert delta(1, "cambios_cliente") == {"SC": 1, "COT": 1}
    assert delta(2, "cambios_cliente") == {"SC": 1, "COT": 0}
    assert delta(0, "sin_respuesta") == {"SC": 1, "COT": 1}


# ─── Filtros f_* (RP3): los de las listas del Bloque 1 ───────────────────────────────────────────────────────────────

def _cumplen(db, modelo, cond, docs):
    ids = [d.id for d in docs]
    return set(db.scalars(select(modelo.id).where(modelo.id.in_(ids), cond)))


def test_filtros_de_solicitudes(db):
    from app.core import resolucion_ventas as rv
    f = _Fabrica(db, _ahora())
    borrador, sin_tipo = f.sc("BORRADOR"), f.sc("ASIGNADA", tipo_solicitud=None)
    confirmada_sin_cot, confirmada_rech, confirmada_con_cot = f.sc("CONFIRMADA"), f.sc("CONFIRMADA"), \
        f.sc("CONFIRMADA")
    f.cot("RECHAZADA", sc=confirmada_rech)
    f.cot("VENCIDA", sc=confirmada_con_cot)            # VENCIDA es una cotizacion en juego (N4)
    cancelada, soporte, na = f.sc("CANCELADA"), f.sc("BORRADOR", tipo_solicitud="Soporte Tecnico"), \
        f.sc("N/A_SOPORTE")
    todos = [borrador, sin_tipo, confirmada_sin_cot, confirmada_rech, confirmada_con_cot, cancelada, soporte, na]
    assert _cumplen(db, CustomerRequest, rv.f_sc_activa(), todos) == {borrador.id, sin_tipo.id}
    assert _cumplen(db, CustomerRequest, rv.f_sc_espera_cot(), todos) == {confirmada_sin_cot.id, confirmada_rech.id}


def test_filtros_de_cotizaciones(db):
    """RP3: f_cot_confirmada = CONFIRMADA y (gate2 o algun pedido no CANCELADO); f_cot_activa = no RECHAZADA y no
    confirmada; una COT CONFIRMADA con todos sus pedidos CANCELADO es activa solo sin gate2 (las dos variantes)."""
    from app.core import resolucion_ventas as rv
    ahora = _ahora()
    f = _Fabrica(db, ahora)
    borrador, rechazada, vencida = f.cot("BORRADOR"), f.cot("RECHAZADA"), f.cot("VENCIDA")
    conf_gate2 = f.cot("CONFIRMADA", gate2_confirmed_at=ahora)
    conf_reabrir = f.cot("CONFIRMADA")
    conf_pven = f.cot("CONFIRMADA")
    f.pven("EN_PROCESO", cot=conf_pven)
    caido_sin_gate2 = f.cot("CONFIRMADA")
    f.pven("CANCELADO", cot=caido_sin_gate2)
    caido_con_gate2 = f.cot("CONFIRMADA", gate2_confirmed_at=ahora)
    f.pven("CANCELADO", cot=caido_con_gate2)
    mixto = f.cot("CONFIRMADA")
    f.pven("CANCELADO", cot=mixto)
    f.pven("PENDIENTE_COMPRA", cot=mixto)
    todos = [borrador, rechazada, vencida, conf_gate2, conf_reabrir, conf_pven, caido_sin_gate2, caido_con_gate2,
             mixto]
    ids = lambda *docs: {d.id for d in docs}
    assert _cumplen(db, SalesQuotation, rv.f_cot_confirmada(), todos) == ids(conf_gate2, conf_pven, caido_con_gate2,
                                                                              mixto)
    assert _cumplen(db, SalesQuotation, rv.f_cot_activa(), todos) == ids(borrador, vencida, conf_reabrir,
                                                                          caido_sin_gate2)
    assert _cumplen(db, SalesQuotation, rv.f_cot_con_pedido(), todos) == ids(conf_pven, mixto)
    assert _cumplen(db, SalesQuotation, rv.f_cot_pedido_caido(), todos) == ids(caido_sin_gate2, caido_con_gate2)


def test_filtros_de_pedidos(db):
    from app.core import resolucion_ventas as rv
    f = _Fabrica(db, _ahora())
    docs = {e: f.pven(e) for e in ("PENDIENTE_COMPRA", "EN_PROCESO", "LISTO_ENTREGA", "PAGADO", "ENTREGADO",
                                   "FACTURADO", "CANCELADO", "DEVUELTO_TOTAL")}
    en_curso = {docs[e].id for e in ("PENDIENTE_COMPRA", "EN_PROCESO", "LISTO_ENTREGA", "PAGADO")}
    con_dinero = en_curso | {docs["ENTREGADO"].id, docs["FACTURADO"].id}
    assert _cumplen(db, SaleOrder, rv.f_pven_en_curso(), docs.values()) == en_curso
    assert _cumplen(db, SaleOrder, rv.f_pven_con_dinero(), docs.values()) == con_dinero


# ─── estados_pedido: constantes nuevas (KPI-ventas 1, TABLA-listas-ventas; RP14) ─────────────────────────────────────

GRUPOS_DE_GRUPO_PEDIDO = {   # lo que devuelve grupoPedido de frontend/src/lib/estados-pedido.js
    "PENDIENTE_COMPRA": "Pend. Compra", "EN_PROCESO": "En Proceso", "EN_TRANSITO": "En Proceso",
    "LISTO_ENTREGA": "Listo Entrega", "ENTREGADO": "Entregado", "FACTURADO": "Facturado", "CANCELADO": "Cancelado",
    "PENDIENTE_PAGO": "Pend. Compra", "PAGADO": "En Proceso", "BORRADOR": "Pend. Compra",
    "PENDIENTE_ANTICIPO": "Pend. Compra", "CONFIRMADO": "Pend. Compra", "PARCIALMENTE_DISPONIBLE": "En Proceso",
    "DISPONIBLE": "Listo Entrega", "PENDIENTE_SALDO": "Listo Entrega", "LISTO_PARA_ENTREGA": "Listo Entrega",
    "PARCIALMENTE_ENTREGADO": "Listo Entrega", "DEVUELTO_TOTAL": "Cancelado",
}


def test_estados_ven_cerrados_y_sin_dinero():
    from app.core import estados_pedido
    assert estados_pedido.ESTADOS_VEN_CERRADOS == ("ENTREGADO", "FACTURADO", "CANCELADO", "DEVUELTO_TOTAL")
    assert estados_pedido.ESTADOS_VEN_SIN_DINERO == ("CANCELADO", "DEVUELTO_TOTAL")
    # RP14: el docstring «Exporta» nombra lo nuevo.
    for nombre in ("ESTADOS_VEN_CERRADOS", "ESTADOS_VEN_SIN_DINERO", "grupo_pedido", "VISTA_DE_GRUPO",
                   "estados_de_vista"):
        assert nombre in estados_pedido.__doc__, nombre


def test_grupo_pedido_de_los_18_estados_igual_que_grupoPedido():
    from app.core.estados_pedido import grupo_pedido
    from app.core.textos_actividad import ETIQUETAS_ESTADO
    assert set(GRUPOS_DE_GRUPO_PEDIDO) == set(ETIQUETAS_ESTADO["VEN"]) and len(GRUPOS_DE_GRUPO_PEDIDO) == 18
    for estado, grupo in GRUPOS_DE_GRUPO_PEDIDO.items():
        assert grupo_pedido(estado) == grupo, estado
    for raro in ("XYZ", "", None, " EN_PROCESO", 3):
        assert grupo_pedido(raro) is None, raro


def test_vista_de_grupo_y_estados_de_vista():
    from app.core.estados_pedido import VISTA_DE_GRUPO, estados_de_vista
    assert dict(VISTA_DE_GRUPO) == {"Pend. Compra": "pend_compra", "En Proceso": "en_proceso",
                                    "Listo Entrega": "listo_entrega", "Entregado": "entregado",
                                    "Facturado": "facturado", "Cancelado": "cancelado"}
    assert "PENDIENTE_PAGO" in estados_de_vista("pend_compra")
    assert set(estados_de_vista("pend_compra")) == {"PENDIENTE_COMPRA", "PENDIENTE_PAGO", "BORRADOR",
                                                    "PENDIENTE_ANTICIPO", "CONFIRMADO"}
    assert set(estados_de_vista("cancelado")) == {"CANCELADO", "DEVUELTO_TOTAL"}
    assert estados_de_vista("entregado") == ("ENTREGADO",)
    # Las seis vistas reparten los 18 estados, cada uno en una sola.
    vistos = [e for v in VISTA_DE_GRUPO.values() for e in estados_de_vista(v)]
    assert sorted(vistos) == sorted(GRUPOS_DE_GRUPO_PEDIDO)
    for vista in ("todos", "", None, "PEND_COMPRA"):
        assert estados_de_vista(vista) == (), vista
