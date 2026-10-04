"""H23: la sesion dura 24 h sin uso y se renueva con POST /auth/refresh.

- /auth/refresh devuelve un token nuevo de SESSION_IDLE_TIMEOUT_MINUTES (1440 por defecto) con 'iat'.
- Un token vencido, la falta de token o un usuario desactivado reciben 401 (tambien en /auth/me).
- El login emite la misma sesion de 24 h.

SECRET_KEY y ALGORITHM salen de app.api.dependencies, y SESSION_IDLE_TIMEOUT_MINUTES y create_access_token de
app.api.v1.auth (los nombres que usa la API en ejecucion): test_jwt_expiration recarga app.core.security.
Correr SOLO con el runner de ROLLBACK: python tests/rollback_runner.py test_sesion_renovacion
"""
from datetime import datetime, timedelta, timezone

import jwt

from app.api.dependencies import SECRET_KEY, ALGORITHM
from app.api.v1.auth import SESSION_IDLE_TIMEOUT_MINUTES, create_access_token

TOLERANCIA_S = 120


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _payload(token):
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])


def _ahora_s():
    return datetime.now(timezone.utc).timestamp()


def _afirmar_sesion_de_24_horas(token):
    payload = _payload(token)
    ahora = _ahora_s()
    assert abs((payload["exp"] - ahora) - SESSION_IDLE_TIMEOUT_MINUTES * 60) <= TOLERANCIA_S, payload
    assert "iat" in payload, payload
    assert abs(ahora - payload["iat"]) < TOLERANCIA_S, payload
    return payload


def test_refrescar_sesion_devuelve_token_nuevo_de_24_horas(app_client, user_admin, admin_token):
    r = app_client.post("/api/v1/auth/refresh", headers=auth(admin_token))
    assert r.status_code == 200, r.text
    cuerpo = r.json()
    assert cuerpo["token_type"] == "bearer"
    assert cuerpo["expires_in"] == SESSION_IDLE_TIMEOUT_MINUTES * 60
    nuevo = cuerpo["access_token"]
    assert nuevo != admin_token
    payload = _afirmar_sesion_de_24_horas(nuevo)
    assert payload["sub"] == str(user_admin.id)
    assert payload["role"] == user_admin.role
    # El token nuevo sirve para seguir trabajando.
    me = app_client.get("/api/v1/auth/me", headers=auth(nuevo))
    assert me.status_code == 200, me.text
    assert me.json()["data"]["id"] == user_admin.id


def test_refrescar_con_token_vencido_da_401(app_client, user_admin):
    vencido = create_access_token({"sub": str(user_admin.id), "role": user_admin.role},
                                  expires_delta=timedelta(minutes=-1))
    r = app_client.post("/api/v1/auth/refresh", headers=auth(vencido))
    assert r.status_code == 401, r.text


def test_refrescar_sin_token_da_401(app_client):
    r = app_client.post("/api/v1/auth/refresh")
    assert r.status_code == 401, r.text


def test_usuario_desactivado_no_renueva_ni_usa_su_token(app_client, db, user_admin, admin_token):
    # Solo dentro de la transaccion revertida del runner.
    user_admin.is_active = False
    db.commit()
    r = app_client.post("/api/v1/auth/refresh", headers=auth(admin_token))
    assert r.status_code == 401, r.text
    me = app_client.get("/api/v1/auth/me", headers=auth(admin_token))
    assert me.status_code == 401, me.text


def test_usuario_con_is_active_nulo_sigue_entrando(app_client, db, user_admin, admin_token):
    # Filas viejas pueden tener is_active NULL: solo False deja fuera (dependencies usa `is False`).
    user_admin.is_active = None
    db.commit()
    me = app_client.get("/api/v1/auth/me", headers=auth(admin_token))
    assert me.status_code == 200, me.text


def test_login_emite_sesion_de_24_horas(app_client, db, user_admin, clave_de_prueba, hash_clave_de_prueba):
    # user_admin (admin@nebulae-qa.com) tiene otra clave en erp_test: dentro de la transaccion revertida se le pone
    # el hash de la clave de prueba del runner, la misma de las cuentas que crea el runner.
    user_admin.password_hash = hash_clave_de_prueba
    db.commit()
    r = app_client.post("/api/v1/auth/login", data={"username": user_admin.email, "password": clave_de_prueba})
    assert r.status_code == 200, r.text
    payload = _afirmar_sesion_de_24_horas(r.json()["access_token"])
    assert payload["sub"] == str(user_admin.id)
