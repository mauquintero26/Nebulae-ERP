"""B4 T6A (FLUJO-ventas-datos puntos 2 y 3; TABLA-hub-ventas punto 3; R8, C5; RP11, RP12, RP13, RP71, RP83):
GET /api/v1/ventas/flujo (app/api/v1/ventas_hub.py, con resumen_flujo_ventas de core/resolucion_ventas.py) y
alertas_resumen y _get_alert_days de erp_ventas.py sobre la regla unica.

Se corre SOLO con el runner de ROLLBACK (python tests/rollback_runner.py test_flujo_ventas): cada prueba va en una
transaccion que se revierte. Como erp_test ya tiene datos, cada prueba compara «despues − antes» de GET /ventas/flujo
dentro de la misma transaccion, una prueba por caso (el runner no soporta parametrize). Las pruebas 7 y 8 del diseno
(paridad con el frontend) son de T2 (test_paridad_reglas_ventas.py).
"""
import uuid
from datetime import timedelta

from app.models.erp_documents import CustomerRequest, SaleOrder, SalesQuotation

RUTA_FLUJO = "/api/v1/ventas/flujo"
RUTA_ALERTAS = "/api/v1/ventas/alertas/resumen"
PASOS = ("SC", "COT", "PVEN", "ENTREGADO", "FACTURADO")


def _ahora():
    from app.core.fechas import ahora_utc
    return ahora_utc()


def _dias(n):
    return timedelta(days=n)


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _dias_de_alerta(db, sc=2, cot=2, ven=2):
    """RP83: con admin_config.guardar_config, dentro de la transaccion revertida."""
    from app.core.admin_config import guardar_config
    guardar_config(db, {"alerta_sc_dias": sc, "alerta_cot_dias": cot, "alerta_ven_dias": ven})
    db.commit()


class _Fabrica:
    """Documentos con un sufijo unico y created_at = updated_at = ahora − hace. Un db.add por objeto."""

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
        campos.setdefault("tipo_solicitud", "Cotizacion de Producto")
        return self._guardar(CustomerRequest(numero=self._numero("SC-"), customer_name=f"FLU {self.sufijo}",
                                             estado=estado, created_at=t, updated_at=t, **campos))

    def cot(self, estado="BORRADOR", hace=None, sc=None, **campos):
        t = self._fecha(hace)
        return self._guardar(SalesQuotation(numero=self._numero("COT-"), customer_name=f"FLU {self.sufijo}",
                                            sc_id=sc.id if sc is not None else None, estado=estado,
                                            created_at=t, updated_at=t, **campos))

    def pven(self, estado="PENDIENTE_COMPRA", hace=None, sc=None, cot=None, **campos):
        t = self._fecha(hace)
        return self._guardar(SaleOrder(numero=self._numero("PV-"), customer_name=f"FLU {self.sufijo}",
                                       sc_id=sc.id if sc is not None else None,
                                       cot_id=cot.id if cot is not None else None, estado=estado,
                                       created_at=t, updated_at=t, **campos))


def _flujo(app_client, token):
    resp = app_client.get(RUTA_FLUJO, headers=_auth(token))
    assert resp.status_code == 200, resp.text
    cuerpo = resp.json()
    assert cuerpo["status"] == "success"
    return cuerpo["data"]


def _alertas(app_client, token):
    resp = app_client.get(RUTA_ALERTAS, headers=_auth(token))
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


def _totales(d):
    return {p: d["pasos"][p]["total"] for p in PASOS}


def _atrasados(d):
    return {p: d["pasos"][p]["atrasados"] for p in PASOS}


def _delta(despues, antes):
    return {k: (None if despues[k] is None else despues[k] - antes[k]) for k in despues}


# ─── 1) Cada documento cae en un solo paso ───────────────────────────────────────────────────────────────────────────

def test_cada_documento_cae_en_un_solo_paso(app_client, db, admin_token):
    antes = _flujo(app_client, admin_token)
    f = _Fabrica(db, _ahora())
    f.sc("BORRADOR")                                         # +1 SC
    f.cot("BORRADOR", sc=f.sc("BORRADOR"))                   # +1 COT, +0 SC
    f.cot("RECHAZADA", sc=f.sc("BORRADOR"))                  # +1 SC (la rechazada no cuenta)
    f.pven("EN_PROCESO", cot=f.cot("CONFIRMADA"))            # +1 PVEN, +0 COT
    f.pven("CANCELADO", cot=f.cot("CONFIRMADA"))             # +1 COT (un pedido cancelado no es vigente)
    f.pven("ENTREGADO")                                      # +1 ENTREGADO
    f.pven("FACTURADO")                                      # +1 FACTURADO
    f.pven("DEVUELTO_TOTAL")                                 # no suma
    f.sc("N/A_SOPORTE")                                      # no suma
    f.sc("CANCELADA")                                        # no suma
    despues = _flujo(app_client, admin_token)
    assert _delta(_totales(despues), _totales(antes)) == {"SC": 2, "COT": 2, "PVEN": 1, "ENTREGADO": 1,
                                                          "FACTURADO": 1}
    assert list(despues["pasos"]) == list(PASOS)


# ─── 2) y 3) El atraso es el de la pastilla roja ─────────────────────────────────────────────────────────────────────

def test_atrasados_usan_la_regla_de_la_alerta(app_client, db, admin_token):
    _dias_de_alerta(db)
    antes, alertas_antes = _flujo(app_client, admin_token), _alertas(app_client, admin_token)
    f = _Fabrica(db, _ahora())
    f.sc("BORRADOR", _dias(5))
    f.cot("PENDIENTE_CONFIRMACION", _dias(5))
    f.pven("PENDIENTE_COMPRA", _dias(5))
    f.pven("LISTO_ENTREGA", _dias(5))                        # accion tomada: no es atrasado
    despues, alertas_despues = _flujo(app_client, admin_token), _alertas(app_client, admin_token)
    assert _delta(_atrasados(despues), _atrasados(antes)) == {"SC": 1, "COT": 1, "PVEN": 1, "ENTREGADO": None,
                                                              "FACTURADO": None}
    assert despues["semaforo"]["atrasados"] - antes["semaforo"]["atrasados"] == 3
    assert alertas_despues["atrasados"] - alertas_antes["atrasados"] == 3


def test_alerta_y_flujo_suman_lo_mismo(app_client, db, admin_token):
    """RP13 (b) y prueba 3: en la misma transaccion, con datos propios y el token de admin, alertas_resumen.atrasados
    es igual a semaforo.atrasados de /ventas/flujo (sobre todos los datos que haya)."""
    _dias_de_alerta(db)
    ahora = _ahora()
    f = _Fabrica(db, ahora)
    f.sc("ASIGNADA", _dias(6))
    f.sc("CONFIRMADA", _dias(6), gate1_confirmed_at=ahora - _dias(6))
    f.cot("CONFIRMADA", _dias(6), gate2_confirmed_at=ahora - _dias(6))
    f.pven("EN_TRANSITO", _dias(6))
    f.sc("BORRADOR", _dias(6), tipo_solicitud="Soporte Tecnico")   # R8: fuera de las dos cuentas
    assert _alertas(app_client, admin_token)["atrasados"] == _flujo(app_client, admin_token)["semaforo"]["atrasados"]


# ─── 4) y 5) Por estado, el más antiguo y los días de alerta ─────────────────────────────────────────────────────────

def test_por_estado_y_mas_antiguo(app_client, db, admin_token):
    antes = _flujo(app_client, admin_token)
    f = _Fabrica(db, _ahora())
    f.sc("ASIGNADA", _dias(3))
    despues = _flujo(app_client, admin_token)
    assert despues["pasos"]["SC"]["por_estado"].get("ASIGNADA", 0) == \
        antes["pasos"]["SC"]["por_estado"].get("ASIGNADA", 0) + 1
    assert despues["pasos"]["SC"]["mas_antiguo_dias"] >= 3


def test_dias_de_alerta_en_la_respuesta(app_client, db, admin_token):
    from app.core.admin_config import guardar_config
    guardar_config(db, {"alerta_cot_dias": "4"})
    db.commit()
    d = _flujo(app_client, admin_token)
    assert d["dias_alerta"]["COT"] == 4
    assert set(d["dias_alerta"]) == {"SC", "COT", "VEN"}
    assert all(isinstance(v, int) for v in d["dias_alerta"].values())
    assert set(d) == {"cambios_cliente", "sin_respuesta", "pasos", "semaforo", "dias_alerta", "generado_at"}
    assert d["generado_at"].endswith("Z")
    assert set(d["cambios_cliente"]) == {"SC", "COT"} and set(d["sin_respuesta"]) == {"SC", "COT"}
    for paso in PASOS:
        assert set(d["pasos"][paso]) == {"total", "atrasados", "mas_antiguo_dias", "por_estado"}, paso


# ─── 6) Roles ────────────────────────────────────────────────────────────────────────────────────────────────────────

def test_el_asesor_puede_leer_el_flujo(app_client, db, admin_token, user_admin, user_vendedor, vendedor_token):
    """Prueba 6 y RP12.3: todos los roles del ERP leen el flujo (sin sesion, 401). Un asesor ve en cambios_cliente solo
    los suyos, como _contar_cambios_cliente (la SC por su advisor_user_id; la COT por el asesor de su SC)."""
    assert app_client.get(RUTA_FLUJO).status_code == 401
    antes_admin, antes_asesor = _flujo(app_client, admin_token), _flujo(app_client, vendedor_token)
    ahora = _ahora()
    f = _Fabrica(db, ahora)
    marca = dict(cambios_cliente_at=ahora, cambios_cliente_tipo="CAMBIOS")
    f.sc("ASIGNADA", advisor_user_id=user_vendedor.id, **marca)
    f.sc("ASIGNADA", advisor_user_id=user_admin.id, **marca)
    sc_del_asesor = f.sc("CONFIRMADA", advisor_user_id=user_vendedor.id)
    f.cot("BORRADOR", sc=sc_del_asesor, **marca)
    admin, asesor = _flujo(app_client, admin_token), _flujo(app_client, vendedor_token)
    assert _delta(admin["cambios_cliente"], antes_admin["cambios_cliente"]) == {"SC": 2, "COT": 1}
    assert _delta(asesor["cambios_cliente"], antes_asesor["cambios_cliente"]) == {"SC": 1, "COT": 1}
    # Lo mismo que la pastilla de alertas_resumen para cada uno.
    assert asesor["cambios_cliente"] == {"SC": _alertas(app_client, vendedor_token)["cambios_cliente_sc"],
                                         "COT": _alertas(app_client, vendedor_token)["cambios_cliente_cot"]}


# ─── 9) alertas_resumen conserva su respuesta ────────────────────────────────────────────────────────────────────────

def test_alertas_resumen_no_cambia(app_client, db, admin_token):
    """Prueba 9: con los datos de la prueba 2, alertas_resumen trae las mismas claves que antes del cambio."""
    _dias_de_alerta(db)
    f = _Fabrica(db, _ahora())
    f.sc("BORRADOR", _dias(5))
    f.cot("PENDIENTE_CONFIRMACION", _dias(5))
    f.pven("PENDIENTE_COMPRA", _dias(5))
    resp = app_client.get(RUTA_ALERTAS, headers=_auth(admin_token))
    assert resp.status_code == 200, resp.text
    cuerpo = resp.json()
    assert set(cuerpo) == {"status", "data"} and cuerpo["status"] == "success"
    assert set(cuerpo["data"]) == {"atrasados", "cambios_cliente", "cambios_cliente_sc", "cambios_cliente_cot"}
    assert all(isinstance(v, int) for v in cuerpo["data"].values())
    assert cuerpo["data"]["cambios_cliente"] == cuerpo["data"]["cambios_cliente_sc"] + cuerpo["data"]["cambios_cliente_cot"]


# ─── R8: Soporte fuera; solo lectura; _get_alert_days delega ─────────────────────────────────────────────────────────

def test_una_sc_de_soporte_no_suma_en_ningun_paso(app_client, db, admin_token):
    """R8: las SC de Soporte Tecnico (por tipo o por el estado N/A_SOPORTE) quedan fuera del flujo, del semaforo y de la
    pastilla roja global (alertas_resumen ya no las cuenta: la pastilla puede bajar)."""
    _dias_de_alerta(db)
    antes, alertas_antes = _flujo(app_client, admin_token), _alertas(app_client, admin_token)
    f = _Fabrica(db, _ahora())
    f.sc("BORRADOR", _dias(9), tipo_solicitud="Soporte Tecnico")
    f.sc("ASIGNADA", _dias(9), tipo_solicitud="Soporte Tecnico")
    f.sc("N/A_SOPORTE", _dias(9))
    despues, alertas_despues = _flujo(app_client, admin_token), _alertas(app_client, admin_token)
    assert _delta(_totales(despues), _totales(antes)) == {p: 0 for p in PASOS}
    assert _delta(_atrasados(despues), _atrasados(antes)) == {"SC": 0, "COT": 0, "PVEN": 0, "ENTREGADO": None,
                                                              "FACTURADO": None}
    assert despues["semaforo"] == antes["semaforo"]
    assert alertas_despues["atrasados"] == alertas_antes["atrasados"]


def test_el_flujo_no_escribe(app_client, db, admin_token, contador_sql):
    """GET /ventas/flujo hace 0 commits y solo lee (R22)."""
    with contador_sql.ventana() as v:
        _flujo(app_client, admin_token)
    assert v.commits == 0
    assert v.consultas > 0
    assert all(s.lstrip().upper().startswith("SELECT") for s in v.sentencias), v.sentencias


def test_get_alert_days_delega_en_leer_dias_alerta(db, contador_sql):
    """RP71: _get_alert_days lee con leer_dias_alerta (UNA consulta de las tres claves con admin_config.leer_config) y
    devuelve el valor de su clave, con la misma lectura de hoy."""
    from app.api.v1.erp_ventas import _get_alert_days
    from app.core.resolucion_ventas import leer_dias_alerta
    _dias_de_alerta(db, sc=3, cot=5, ven=7)
    for clave, tipo in (("alerta_sc_dias", "SC"), ("alerta_cot_dias", "COT"), ("alerta_ven_dias", "VEN")):
        with contador_sql.ventana() as v:
            valor = _get_alert_days(db, clave)
        assert valor == leer_dias_alerta(db)[tipo] == {"SC": 3, "COT": 5, "VEN": 7}[tipo]
        assert v.consultas == 1 and "ANY(" in v.sentencias[0], v.sentencias
    assert _get_alert_days(db) == 3   # por defecto, la de las solicitudes (get_alertas)
