"""B4.1 T5 (P33): la moneda y el tiempo de entrega del proveedor se sirven y se guardan en /compras/proveedores.

Se corre SOLO con el runner de ROLLBACK (python tests/rollback_runner.py test_b41_proveedores).
"""
import uuid

RUTA = "/api/v1/compras/proveedores"
TEXTO_MONEDA = "La moneda «{}» no es válida: usa COP, USD o EUR."
TEXTO_TIEMPO = "El tiempo de entrega debe ser un número entero de días entre 0 y 365."


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_el_proveedor_guarda_moneda_y_tiempo_de_entrega(app_client, admin_token):
    nombre = f"Prov-B41-{uuid.uuid4().hex[:6]}"
    r = app_client.post(RUTA, json={"name": nombre, "currency": "usd ", "lead_time_days": "21"}, headers=_auth(admin_token))
    assert r.status_code == 201, r.text
    d = r.json()["data"]
    assert (d["currency"], d["lead_time_days"]) == ("USD", 21)
    assert {k: app_client.get(f"{RUTA}/{d['id']}", headers=_auth(admin_token)).json()["data"][k]
            for k in ("currency", "lead_time_days")} == {"currency": "USD", "lead_time_days": 21}
    p = app_client.patch(f"{RUTA}/{d['id']}", json={"currency": "", "lead_time_days": None}, headers=_auth(admin_token)).json()["data"]
    assert (p["currency"], p["lead_time_days"]) == (None, None)
    fila = next(x for x in app_client.get(RUTA, params={"search": nombre}, headers=_auth(admin_token)).json()["data"] if x["id"] == d["id"])
    assert {"currency", "lead_time_days"} <= set(fila)       # list_suppliers (erp_compras.py:372) filtra con `search`


def test_moneda_y_tiempo_de_entrega_se_validan(app_client, db, admin_token):
    """Review Focus 5."""
    s = app_client.post(RUTA, json={"name": f"Prov-B41-{uuid.uuid4().hex[:6]}", "currency": "COP", "lead_time_days": 7},
                        headers=_auth(admin_token)).json()["data"]
    for moneda in ("ARS", "COPX", 5):
        r = app_client.patch(f"{RUTA}/{s['id']}", json={"currency": moneda, "name": "Otro"}, headers=_auth(admin_token))
        assert (r.status_code, r.json()["detail"]) == (422, TEXTO_MONEDA.format(moneda)), moneda
    for tiempo in ("abc", 7.5, -1, 366, True):
        r = app_client.patch(f"{RUTA}/{s['id']}", json={"lead_time_days": tiempo, "name": "Otro"}, headers=_auth(admin_token))
        assert (r.status_code, r.json()["detail"]) == (422, TEXTO_TIEMPO), tiempo
    d = app_client.get(f"{RUTA}/{s['id']}", headers=_auth(admin_token)).json()["data"]
    assert (d["name"], d["currency"], d["lead_time_days"]) == (s["name"], "COP", 7)       # nada se escribió
