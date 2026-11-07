"""B4 T12 (FLUJO-compras puntos 1 y 2 con R9; C16; RP40, RP42, RP46, D42): core/flujo_compras.resumen_flujo_compras y
GET /api/v1/compras/flujo (en erp_compras.py; no hay api/v1/flujo.py).

Los pasos son los de PASOS_FLUJO_COMPRAS: LISTA (los ítems PENDIENTE de la Lista de compras, leída SIN sincronizar y sin
los de pedidos de venta cancelados), PEC (borrador y emitido), TRANSITO (en tránsito), RECEPCION (la etapa en_bodega,
con recepciones_por_confirmar = las GoodsReceipt en BORRADOR) y RECIBIDO (recepción confirmada). Atrasado = vencido
(RP40): emitido o en tránsito con el día de entrega anterior a hoy en Colombia, sin tolerancia; solo en PEC y TRANSITO.
GET /compras/flujo no escribe: 0 commits y la Lista de compras no cambia. La prueba 5 del diseño (paridad con el
frontend) es de T2.

Se corre SOLO con el runner de ROLLBACK (python tests/rollback_runner.py test_flujo_compras). erp_test ya tiene datos:
cada prueba compara «después − antes» dentro de la misma transacción.
"""
import math
import uuid
from datetime import datetime, time, timedelta

from app.models.erp_documents import GoodsReceipt, PurchaseOrderFull, SaleOrder
from tests.usuarios_de_prueba import bodega_token, compras_token  # noqa: F401 (fixtures por nombre, RP79)

RUTA = "/api/v1/compras/flujo"
PASOS = ("LISTA", "PEC", "TRANSITO", "RECEPCION", "RECIBIDO")


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _hoy():
    from app.core.fechas import hoy_colombia
    return hoy_colombia()


def _dia(n, hora=12):
    return datetime.combine(_hoy() + timedelta(days=n), time(hora, 0))


def _flujo(app_client, token):
    resp = app_client.get(RUTA, headers=_auth(token))
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


def _delta(antes, despues, clave):
    return {p: despues["pasos"][p][clave] - antes["pasos"][p][clave] for p in PASOS}


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

    def pec(self, estado="EMITIDO", entrega=None, compra=None):
        campos = {} if compra is None else {"fecha_compra": compra}
        return self._guardar(PurchaseOrderFull(numero=self._numero("PEC-F"), estado=estado, total_cop=1_000,
                                               fecha_entrega_estimada=entrega, **campos))

    def recepcion(self, estado, pec):
        return self._guardar(GoodsReceipt(numero=self._numero("ENINV-F"), estado=estado, pec_id=pec.id))


# ─── 1) Cada PEC en su paso ───────────────────────────────────────────────────────────────────────────────────────────

def test_cada_pec_cae_en_su_paso(app_client, db, admin_token):
    """BORRADOR y EMITIDO suman en PEC; EN_TRANSITO en TRANSITO; PARCIALMENTE_RECIBIDA y RECIBIDO en RECEPCION (la etapa
    en_bodega, no TRANSITO); RECIBIDA y COMPLETADO en RECIBIDO; CANCELADO no suma."""
    f = _Fabrica(db)
    antes = _flujo(app_client, admin_token)
    estados = ("BORRADOR", "EMITIDO", "EN_TRANSITO", "PARCIALMENTE_RECIBIDA", "RECIBIDO", "RECIBIDA", "COMPLETADO",
               "CANCELADO")
    for estado in estados:
        f.pec(estado, _dia(20))
    despues = _flujo(app_client, admin_token)
    assert _delta(antes, despues, "total") == {"LISTA": 0, "PEC": 2, "TRANSITO": 1, "RECEPCION": 2, "RECIBIDO": 2}
    paso_de = {"BORRADOR": "PEC", "EMITIDO": "PEC", "EN_TRANSITO": "TRANSITO", "PARCIALMENTE_RECIBIDA": "RECEPCION",
               "RECIBIDO": "RECEPCION", "RECIBIDA": "RECIBIDO", "COMPLETADO": "RECIBIDO"}
    for estado, paso in paso_de.items():
        por_estado_antes = antes["pasos"][paso]["por_estado"]
        assert despues["pasos"][paso]["por_estado"][estado] - por_estado_antes.get(estado, 0) == 1, estado
    assert all("CANCELADO" not in despues["pasos"][p]["por_estado"] for p in PASOS)
    # Cada paso suma lo de su por_estado.
    for paso in ("PEC", "TRANSITO", "RECEPCION", "RECIBIDO"):
        assert despues["pasos"][paso]["total"] == sum(despues["pasos"][paso]["por_estado"].values()), paso


def test_un_estado_desconocido_va_al_paso_pec(app_client, db, admin_token):
    f = _Fabrica(db)
    antes = _flujo(app_client, admin_token)
    f.pec("CONFIRMADA", _dia(-2))     # un heredado de logística: cuenta como emitido (R9), y vence
    despues = _flujo(app_client, admin_token)
    assert _delta(antes, despues, "total") == {"LISTA": 0, "PEC": 1, "TRANSITO": 0, "RECEPCION": 0, "RECIBIDO": 0}
    assert despues["pasos"]["PEC"]["atrasados"] - antes["pasos"]["PEC"]["atrasados"] == 1


# ─── 2) Atrasados solo en los pasos abiertos (RP40) ──────────────────────────────────────────────────────────────────

def test_atrasados_solo_en_pasos_abiertos(app_client, db, admin_token):
    f = _Fabrica(db)
    antes = _flujo(app_client, admin_token)
    f.pec("EN_TRANSITO", _dia(-1))
    f.pec("RECIBIDA", _dia(-1))
    f.pec("RECIBIDO", _dia(-1))
    f.pec("PARCIALMENTE_RECIBIDA", _dia(-1))
    f.pec("EMITIDO", _dia(-1, hora=23))
    f.pec("BORRADOR", _dia(-1))                                 # un borrador no vence
    f.pec("EN_TRANSITO", datetime.combine(_hoy(), time(0, 0)))   # hoy a las 00:00 todavía no
    f.pec("EMITIDO", None)                                       # sin fecha no vence
    despues = _flujo(app_client, admin_token)
    assert despues["pasos"]["TRANSITO"]["atrasados"] - antes["pasos"]["TRANSITO"]["atrasados"] == 1
    assert despues["pasos"]["PEC"]["atrasados"] - antes["pasos"]["PEC"]["atrasados"] == 1
    for paso in ("LISTA", "RECEPCION", "RECIBIDO"):
        assert despues["pasos"][paso]["atrasados"] is None, paso
    assert despues["semaforo"]["atrasados"] - antes["semaforo"]["atrasados"] == 2
    assert despues["semaforo"]["atrasados"] == (despues["pasos"]["PEC"]["atrasados"]
                                                + despues["pasos"]["TRANSITO"]["atrasados"])


# ─── 3) Recepciones por confirmar (RP46) ─────────────────────────────────────────────────────────────────────────────

def test_recepciones_por_confirmar(app_client, db, admin_token):
    f = _Fabrica(db)
    pec = f.pec("RECIBIDO", _dia(5))
    antes = _flujo(app_client, admin_token)
    f.recepcion("BORRADOR", pec)
    despues = _flujo(app_client, admin_token)
    recepcion = despues["pasos"]["RECEPCION"]
    assert recepcion["recepciones_por_confirmar"] - antes["pasos"]["RECEPCION"]["recepciones_por_confirmar"] == 1
    for estado in ("COMPLETADA", "COMPLETADA_LOGISTICA", "CANCELADA"):
        f.recepcion(estado, pec)
    otra = _flujo(app_client, admin_token)
    assert otra["pasos"]["RECEPCION"]["recepciones_por_confirmar"] == recepcion["recepciones_por_confirmar"]
    # El número del paso es la etapa en_bodega (los PEC), no las recepciones.
    assert otra["pasos"]["RECEPCION"]["total"] == antes["pasos"]["RECEPCION"]["total"]
    # r1 (m10): el aviso del flujo y la tarjeta de /compras/stats salen del mismo grupo (GRUPOS_RECEPCION).
    stats = app_client.get("/api/v1/compras/stats", headers=_auth(admin_token)).json()["data"]
    assert stats["recepciones"]["por_confirmar"] == otra["pasos"]["RECEPCION"]["recepciones_por_confirmar"]


# ─── 4) La Lista de compras se lee sin escribir (RP42) ───────────────────────────────────────────────────────────────

def test_lista_de_compras_sin_escribir(app_client, db, admin_token, contador_sql):
    from app.api.v1.erp_compras import _load_lista_compras, _save_lista_compras
    original = _load_lista_compras(db)
    s = uuid.uuid4().hex[:8].upper()
    try:
        antes = _flujo(app_client, admin_token)
        cancelado = SaleOrder(numero=f"PV-F{s}", customer_name="Cliente", estado="CANCELADO")
        pendiente = SaleOrder(numero=f"PV-G{s}", customer_name="Cliente", estado="PENDIENTE_COMPRA",
                              productos=[{"product_name": f"Producto {s}", "qty": 1}])
        db.add_all([cancelado, pendiente])
        db.commit()
        desde = max([it.get("id", 0) for it in original if isinstance(it.get("id"), int)], default=0) + 1000

        def item(n, estado, pven=None):
            return {"id": desde + n, "pven_id": pven.id if pven else None, "pven_numero": pven.numero if pven else None,
                    "producto": f"Item {s} {n}", "cantidad": 1, "proveedor": "", "pec_id": None, "pec_numero": None,
                    "estado": estado, "fecha": "2026-01-01T10:00:00", "notas": "", "created_by": "tester"}

        _save_lista_compras(db, original + [item(1, "PENDIENTE"), item(2, "EN_PEDIDO"), item(3, "DESCARTADO"),
                                            item(4, "PENDIENTE", cancelado)], commit=False)
        db.commit()
        json_antes = _load_lista_compras(db)
        with contador_sql.ventana() as v:
            despues = _flujo(app_client, admin_token)
        assert v.commits == 0, v.commits
        assert not [x for x in v.sentencias if x.lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE"))]
        db.expire_all()
        assert _load_lista_compras(db) == json_antes      # no sincroniza: el PVEN pendiente no entra a la Lista
        assert not any(it.get("pven_id") == pendiente.id for it in json_antes)
        lista = despues["pasos"]["LISTA"]
        assert lista["total"] - antes["pasos"]["LISTA"]["total"] == 1
        assert lista["por_estado"] == {"PENDIENTE": lista["total"]}
        assert lista["atrasados"] is None
    finally:
        _save_lista_compras(db, original)


# ─── 5) Roles y forma de la respuesta ────────────────────────────────────────────────────────────────────────────────

def test_el_rol_compras_y_el_asesor_pueden_leer(app_client, vendedor_token, compras_token, bodega_token):
    for token in (vendedor_token, compras_token, bodega_token):
        _flujo(app_client, token)
    assert app_client.get(RUTA).status_code == 401


def test_forma_de_la_respuesta(app_client, admin_token):
    """La misma forma que /ventas/flujo (conteosDePasos de lib/flujo.js la lee): pasos en el orden del flujo con total,
    atrasados, mas_antiguo_dias y por_estado; RECEPCION trae además recepciones_por_confirmar (RP46); el semáforo y el
    criterio de atraso de Compras (la fecha de entrega, sin tolerancia)."""
    data = _flujo(app_client, admin_token)
    assert set(data) == {"pasos", "semaforo", "criterio_atraso", "generado_at"}
    assert list(data["pasos"]) == list(PASOS)
    for paso in PASOS:
        claves = {"total", "atrasados", "mas_antiguo_dias", "por_estado"}
        if paso == "RECEPCION":
            claves |= {"recepciones_por_confirmar"}
        assert set(data["pasos"][paso]) == claves, paso
    assert set(data["semaforo"]) == {"atrasados", "no_resueltos"}
    assert data["semaforo"]["no_resueltos"] == (data["pasos"]["PEC"]["total"] + data["pasos"]["TRANSITO"]["total"]
                                                + data["pasos"]["RECEPCION"]["total"])
    assert data["criterio_atraso"] == "fecha_entrega"
    assert data["generado_at"].endswith("Z")
    assert data["pasos"]["RECIBIDO"]["mas_antiguo_dias"] is None


def test_mas_antiguo_dias(db):
    """mas_antiguo_dias es el piso de los días desde la fecha más vieja del paso: COALESCE(fecha_compra, created_at) en
    PEC, TRANSITO y RECEPCION (RP46), la fecha del ítem en LISTA; None en RECIBIDO."""
    from app.api.v1.erp_compras import _load_lista_compras, _save_lista_compras
    from app.core.flujo_compras import resumen_flujo_compras
    f = _Fabrica(db)
    viejo = datetime(1990, 1, 1, 10, 0)
    for estado in ("EMITIDO", "EN_TRANSITO", "RECIBIDO", "RECIBIDA"):
        f.pec(estado, None, compra=viejo)
    original = _load_lista_compras(db)
    try:
        _save_lista_compras(db, original + [{"id": 10 ** 9, "pven_id": None, "producto": "Viejo",
                                             "estado": "PENDIENTE", "fecha": "1990-01-01T10:00:00", "cantidad": 1}],
                            commit=False)
        ahora = datetime(2026, 11, 6, 15, 0)
        data = resumen_flujo_compras(db, ahora)
        esperado = math.floor((ahora - viejo).total_seconds() / 86400)
        for paso in ("LISTA", "PEC", "TRANSITO", "RECEPCION"):
            assert data["pasos"][paso]["mas_antiguo_dias"] == esperado, paso
        assert data["pasos"]["RECIBIDO"]["mas_antiguo_dias"] is None
        assert data["generado_at"] == "2026-11-06T15:00:00Z"
    finally:   # r1 (m15): el JSON de web_builder_config se restaura aunque falle una aserción
        _save_lista_compras(db, original, commit=False)


def test_consultas_constantes(app_client, db, admin_token, contador_sql):
    f = _Fabrica(db)

    def medir():
        with contador_sql.ventana() as v:
            _flujo(app_client, admin_token)
        return v.consultas

    for estado in ("EMITIDO", "EN_TRANSITO", "RECIBIDO"):
        f.pec(estado, _dia(-1))
    con_3 = medir()
    for i in range(22):
        f.pec(("EMITIDO", "EN_TRANSITO", "RECIBIDO", "RECIBIDA")[i % 4], _dia(-i))
    assert medir() == con_3 and con_3 <= 6, con_3
