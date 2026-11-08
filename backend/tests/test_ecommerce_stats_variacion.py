"""B4 T20 (KPI-otros punto 5, solo el servidor; R7; RP1/D1, RP102): GET /ecommerce/stats con el dia y el mes de Colombia
y la comparacion de la tienda: revenue_ayer, web_orders_ayer, revenue_mes_anterior y web_orders_mes_anterior.

Se corre SOLO con el runner de ROLLBACK (python tests/rollback_runner.py test_ecommerce_stats_variacion). El instante
«ahora» del endpoint se fija en las pruebas (monkeypatch de ecommerce.ahora_utc) en el ano 2030, donde la base no tiene
pedidos: las cifras se afirman tal cual. «Hoy» es el dia de Colombia (hoy_colombia), no el de UTC ni el del servidor.
"""
import uuid
from datetime import datetime

from app.api.v1 import ecommerce
from app.models.erp_documents import SaleOrder
from tests.usuarios_de_prueba import bodega_token  # noqa: F401 (fixture por nombre)

RUTA = "/api/v1/ecommerce/stats"
CLAVES_DE_HOY = ["web_orders_today", "web_orders_month", "revenue_today", "revenue_month", "carritos_abandonados_count",
                 "carritos_abandonados_valor", "productos_publicados", "conversion_pct", "recent_orders"]
CLAVES_NUEVAS = ["revenue_ayer", "web_orders_ayer", "revenue_mes_anterior", "web_orders_mes_anterior"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _stats(app_client, token):
    resp = app_client.get(RUTA, headers=_auth(token))
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


def _pedido(db, cuando, total, estado="PAGADO", canal="WEB"):
    s = uuid.uuid4().hex[:10].upper()
    o = SaleOrder(numero=f"PV-S{s}", pweb_numero=f"PWEB-S{s}", canal_venta=canal, customer_name="Cliente Stats",
                  total_cop=total, estado=estado, created_at=cuando, productos=[])
    db.add(o)
    db.commit()
    return o


def _ahora(monkeypatch, instante):
    monkeypatch.setattr(ecommerce, "ahora_utc", lambda: instante)


def test_hoy_ayer_y_mes_en_hora_de_colombia(app_client, db, admin_token, monkeypatch):
    """Ahora = 2030-03-15 03:00 UTC = 2030-03-14 22:00 en Colombia. Hoy es el 14, ayer el 13, el mes va del 1 al 14 y el
    tramo del mes pasado es del 1 al 14 de febrero (los bordes a las 05:00 UTC)."""
    _ahora(monkeypatch, datetime(2030, 3, 15, 3, 0))
    # ayer (13): empieza a las 05:00 UTC del 13 y termina a las 04:59 del 14
    _pedido(db, datetime(2030, 3, 14, 4, 59), 100)       # A: 13 23:59 en Colombia -> ayer, aunque en UTC ya es 14
    _pedido(db, datetime(2030, 3, 13, 5, 0), 1_000)      # D: 13 00:00 en Colombia -> ayer
    # hoy (14)
    _pedido(db, datetime(2030, 3, 14, 5, 0), 200)        # B: 14 00:00 en Colombia -> hoy
    _pedido(db, datetime(2030, 3, 15, 2, 30), 300)      # C: 14 21:30 en Colombia -> hoy, aunque en UTC ya es 15
    _pedido(db, datetime(2030, 3, 14, 16, 0), 400, estado="CANCELADO")        # F: cuenta el pedido, no el dinero
    _pedido(db, datetime(2030, 3, 14, 17, 0), 700, estado="DEVUELTO_TOTAL")   # G: idem (RP102)
    _pedido(db, datetime(2030, 3, 14, 18, 0), 999, canal="CRM")               # no es de la tienda
    # este mes, ni hoy ni ayer
    _pedido(db, datetime(2030, 3, 13, 4, 59), 2_000)     # E: 12 23:59 en Colombia
    _pedido(db, datetime(2030, 3, 1, 5, 0), 50)          # 1 de marzo 00:00 en Colombia: abre el mes
    _pedido(db, datetime(2030, 3, 1, 4, 59), 7_777)      # 28 de febrero 23:59 en Colombia: NO es de marzo
    # el mismo tramo del mes pasado (1 al 14 de febrero)
    _pedido(db, datetime(2030, 2, 10, 15, 0), 5_000)     # H
    _pedido(db, datetime(2030, 2, 15, 4, 59), 6_000)     # J: 14 23:59 en Colombia: el ultimo instante del tramo
    _pedido(db, datetime(2030, 2, 15, 5, 0), 8_000)      # K: 15 00:00 en Colombia: fuera del tramo
    _pedido(db, datetime(2030, 2, 20, 15, 0), 9_000)     # I: fuera del tramo
    _pedido(db, datetime(2030, 2, 1, 4, 59), 3_333)      # 31 de enero 23:59 en Colombia: fuera del tramo

    d = _stats(app_client, admin_token)
    assert (d["web_orders_today"], d["revenue_today"]) == (4, 500.0)           # B, C, F y G; dinero: B + C
    assert (d["web_orders_ayer"], d["revenue_ayer"]) == (2, 1_100.0)           # A y D
    assert (d["web_orders_month"], d["revenue_month"]) == (8, 3_650.0)         # A,B,C,D,E,F,G y el del 1; sin F ni G
    assert (d["web_orders_mes_anterior"], d["revenue_mes_anterior"]) == (2, 11_000.0)   # H y J
    assert list(d)[:len(CLAVES_DE_HOY)] == CLAVES_DE_HOY                          # las claves de hoy, en su orden
    assert list(d)[len(CLAVES_DE_HOY):] == CLAVES_NUEVAS                          # y las nuevas, al final (aditivas)
    assert d["conversion_pct"] == 100.0                                           # 4 pedidos hoy / (0 carritos + 4)


def test_el_tramo_del_mes_pasado_se_recorta_a_su_fin(app_client, db, admin_token, monkeypatch):
    """Hoy 31 de marzo: el tramo de febrero es del 1 al 28 (recortado a su fin, no al 31)."""
    _ahora(monkeypatch, datetime(2030, 3, 31, 18, 0))
    _pedido(db, datetime(2030, 2, 28, 15, 0), 10)        # 28 de febrero: dentro
    _pedido(db, datetime(2030, 3, 1, 4, 59), 20)         # 28 de febrero 23:59 en Colombia: dentro
    _pedido(db, datetime(2030, 3, 1, 5, 0), 40)          # 1 de marzo: mes actual, no el pasado
    d = _stats(app_client, admin_token)
    assert (d["web_orders_mes_anterior"], d["revenue_mes_anterior"]) == (2, 30.0)
    assert (d["web_orders_month"], d["revenue_month"]) == (1, 40.0)
    assert (d["web_orders_today"], d["web_orders_ayer"]) == (0, 0)


def test_sin_pedidos_todo_en_cero_y_permisos(app_client, db, admin_token, vendedor_token, bodega_token, monkeypatch):
    _ahora(monkeypatch, datetime(2031, 7, 9, 12, 0))
    d = _stats(app_client, vendedor_token)
    for clave in ("web_orders_today", "web_orders_month", "revenue_today", "revenue_month", *CLAVES_NUEVAS):
        assert d[clave] == 0, clave
    assert d["recent_orders"] is not None and d["conversion_pct"] == 0.0
    assert app_client.get(RUTA, headers=_auth(bodega_token)).status_code == 403
    assert app_client.get(RUTA).status_code == 401


def test_el_dia_de_colombia_no_el_de_utc(app_client, db, admin_token, monkeypatch):
    """A las 03:00 UTC del 15 en Colombia todavia es el 14: un pedido de las 06:00 UTC del 15 (01:00 del 15 en Colombia) es
    de manana, no de hoy; y a las 05:00 UTC en punto ya es el dia siguiente."""
    _pedido(db, datetime(2030, 3, 15, 6, 0), 500)
    _ahora(monkeypatch, datetime(2030, 3, 15, 3, 0))
    assert _stats(app_client, admin_token)["web_orders_today"] == 0
    _ahora(monkeypatch, datetime(2030, 3, 15, 5, 0))
    d = _stats(app_client, admin_token)
    assert (d["web_orders_today"], d["revenue_today"], d["web_orders_ayer"]) == (1, 500.0, 0)
