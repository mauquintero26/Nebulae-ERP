"""H23: la sesion dura 24 h sin uso y se renueva con POST /auth/refresh.

- /auth/refresh devuelve un token nuevo de SESSION_IDLE_TIMEOUT_MINUTES (1440 por defecto) con 'iat' y el rol actual.
- Un token vencido, firmado con otra clave, de un usuario inexistente o desactivado, o la falta de token: 401.
- El login emite la misma sesion de 24 h; un usuario desactivado recibe el mismo 401 que una clave incorrecta.
- Las rutas duales (token ERP o de cliente) y get_optional_current_user tampoco aceptan a un desactivado.
- Un iat unos segundos en el futuro (desfase de reloj) se acepta (leeway).
- A5 (revision final): login y /auth/refresh ponen el claim 'pv' (16 hex del sha256 del password_hash). Cambiar la
  clave cierra las sesiones abiertas: un token cuyo 'pv' no coincide con el hash actual da 401. Un token sin 'pv'
  (emitido antes) se acepta y /auth/refresh lo cambia por uno con 'pv'.

Usa user_vendedor (creado por el runner dentro de la transaccion, con el hash de la clave de prueba) y no toca la
cuenta QA del runner. SECRET_KEY y ALGORITHM salen de app.api.dependencies, y SESSION_IDLE_TIMEOUT_MINUTES y
create_access_token de app.api.v1.auth (los nombres que usa la API en ejecucion): test_jwt_expiration recarga
app.core.security.
Correr SOLO con el runner de ROLLBACK: python tests/rollback_runner.py test_sesion_renovacion
"""
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from sqlalchemy import func

from app.api.dependencies import SECRET_KEY, ALGORITHM, get_optional_current_user
from app.api.v1.auth import SESSION_IDLE_TIMEOUT_MINUTES, create_access_token
from app.models.users import User

TOLERANCIA_S = 120
CLIENTE_INEXISTENTE = 999_999_999


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _payload(token):
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])


def _ahora():
    return datetime.now(timezone.utc)


def _afirmar_sesion_de_24_horas(token):
    payload = _payload(token)
    ahora = _ahora().timestamp()
    assert abs((payload["exp"] - ahora) - SESSION_IDLE_TIMEOUT_MINUTES * 60) <= TOLERANCIA_S, payload
    assert "iat" in payload, payload
    assert abs(ahora - payload["iat"]) < TOLERANCIA_S, payload
    return payload


def _login(app_client, usuario, clave):
    return app_client.post("/api/v1/auth/login", data={"username": usuario, "password": clave})


def _desactivar(db, usuario):
    # Solo dentro de la transaccion revertida del runner.
    usuario.is_active = False
    db.commit()


# ---- /auth/refresh ---------------------------------------------------------------------------------------------

def test_refrescar_sesion_devuelve_token_nuevo_de_24_horas(app_client, user_vendedor, vendedor_token):
    r = app_client.post("/api/v1/auth/refresh", headers=auth(vendedor_token))
    assert r.status_code == 200, r.text
    cuerpo = r.json()
    assert cuerpo["token_type"] == "bearer"
    assert cuerpo["expires_in"] == SESSION_IDLE_TIMEOUT_MINUTES * 60
    nuevo = cuerpo["access_token"]
    assert nuevo != vendedor_token
    payload = _afirmar_sesion_de_24_horas(nuevo)
    assert payload["sub"] == str(user_vendedor.id)
    assert payload["role"] == user_vendedor.role
    # El token nuevo sirve para seguir trabajando.
    me = app_client.get("/api/v1/auth/me", headers=auth(nuevo))
    assert me.status_code == 200, me.text
    assert me.json()["data"]["id"] == user_vendedor.id


def test_el_token_renovado_trae_el_rol_nuevo(app_client, db, user_vendedor, vendedor_token):
    user_vendedor.role = "COMPRAS"
    db.commit()
    r = app_client.post("/api/v1/auth/refresh", headers=auth(vendedor_token))
    assert r.status_code == 200, r.text
    assert _payload(r.json()["access_token"])["role"] == "COMPRAS"


def test_refrescar_con_token_vencido_da_401(app_client, user_vendedor):
    vencido = create_access_token({"sub": str(user_vendedor.id), "role": user_vendedor.role},
                                  expires_delta=timedelta(minutes=-1))
    r = app_client.post("/api/v1/auth/refresh", headers=auth(vencido))
    assert r.status_code == 401, r.text


def test_refrescar_sin_token_da_401(app_client):
    r = app_client.post("/api/v1/auth/refresh")
    assert r.status_code == 401, r.text


def test_refrescar_con_token_firmado_con_otra_clave_da_401(app_client, user_vendedor):
    otra_clave = secrets.token_urlsafe(32)  # generada aqui; no es ninguna clave real
    ahora = _ahora()
    falso = jwt.encode({"sub": str(user_vendedor.id), "role": user_vendedor.role,
                        "exp": ahora + timedelta(hours=1), "iat": ahora}, otra_clave, algorithm=ALGORITHM)
    r = app_client.post("/api/v1/auth/refresh", headers=auth(falso))
    assert r.status_code == 401, r.text


def test_refrescar_con_usuario_inexistente_da_401(app_client, db):
    inexistente = (db.query(func.max(User.id)).scalar() or 0) + 1000
    token = create_access_token({"sub": str(inexistente), "role": "Admin"}, expires_delta=timedelta(minutes=60))
    r = app_client.post("/api/v1/auth/refresh", headers=auth(token))
    assert r.status_code == 401, r.text


def test_usuario_desactivado_no_renueva_ni_usa_su_token(app_client, db, user_vendedor, vendedor_token):
    _desactivar(db, user_vendedor)
    r = app_client.post("/api/v1/auth/refresh", headers=auth(vendedor_token))
    assert r.status_code == 401, r.text
    me = app_client.get("/api/v1/auth/me", headers=auth(vendedor_token))
    assert me.status_code == 401, me.text


def test_usuario_con_is_active_nulo_sigue_entrando(app_client, db, user_vendedor, vendedor_token):
    # Filas viejas pueden tener is_active NULL: solo False deja fuera (dependencies usa `is False`).
    user_vendedor.is_active = None
    db.commit()
    me = app_client.get("/api/v1/auth/me", headers=auth(vendedor_token))
    assert me.status_code == 200, me.text
    r = app_client.post("/api/v1/auth/refresh", headers=auth(vendedor_token))
    assert r.status_code == 200, r.text


def test_token_con_iat_unos_segundos_en_el_futuro_se_acepta(app_client, user_vendedor):
    # Desfase de reloj de unos segundos entre quien emite y quien valida: leeway en el decode de sesion.
    ahora = _ahora()
    token = jwt.encode({"sub": str(user_vendedor.id), "role": user_vendedor.role,
                        "exp": ahora + timedelta(hours=1), "iat": ahora + timedelta(seconds=10)},
                       SECRET_KEY, algorithm=ALGORITHM)
    me = app_client.get("/api/v1/auth/me", headers=auth(token))
    assert me.status_code == 200, me.text
    r = app_client.post("/api/v1/auth/refresh", headers=auth(token))
    assert r.status_code == 200, r.text


# ---- /auth/login -----------------------------------------------------------------------------------------------

def test_login_emite_sesion_de_24_horas(app_client, user_vendedor, clave_de_prueba):
    r = _login(app_client, user_vendedor.email, clave_de_prueba)
    assert r.status_code == 200, r.text
    payload = _afirmar_sesion_de_24_horas(r.json()["access_token"])
    assert payload["sub"] == str(user_vendedor.id)


def test_login_de_desactivado_da_el_mismo_401_que_una_clave_incorrecta(app_client, db, user_vendedor,
                                                                       clave_de_prueba):
    mala = _login(app_client, user_vendedor.email, clave_de_prueba + "-incorrecta")
    assert mala.status_code == 401, mala.text
    _desactivar(db, user_vendedor)
    desactivado = _login(app_client, user_vendedor.email, clave_de_prueba)
    assert desactivado.status_code == 401, desactivado.status_code  # sin r.text: con 200 traeria un token
    assert desactivado.json() == mala.json(), "no debe revelar que la cuenta existe y esta desactivada"
    assert desactivado.headers.get("www-authenticate") == mala.headers.get("www-authenticate") == "Bearer"


# ---- rutas duales y usuario opcional ---------------------------------------------------------------------------

def test_desactivado_con_token_valido_no_entra_por_la_ruta_dual_del_chat(app_client, db, user_vendedor,
                                                                         vendedor_token):
    cuerpo = {"customer_id": CLIENTE_INEXISTENTE, "query_type": "ESTADO_COTIZACION"}
    url = "/api/v1/chat/omnichannel/query"
    # Activo: el token ERP lo autoriza (Vendedor = ASESOR) y la consulta llega al 404 del cliente inexistente.
    activo = app_client.post(url, json=cuerpo, headers=auth(vendedor_token))
    assert activo.status_code == 404, activo.text
    visitante = app_client.post(url, json=cuerpo)
    assert visitante.status_code == 401, visitante.text
    _desactivar(db, user_vendedor)
    r = app_client.post(url, json=cuerpo, headers=auth(vendedor_token))
    assert r.status_code == 401, r.text
    assert r.json() == visitante.json(), "un desactivado recibe lo mismo que un visitante sin token ERP"


def test_desactivado_con_token_valido_no_entra_por_la_ruta_dual_de_marketing(app_client, db, user_vendedor,
                                                                             vendedor_token):
    url = f"/api/v1/marketing/customers/{CLIENTE_INEXISTENTE}/preferences"
    activo = app_client.put(url, json={}, headers=auth(vendedor_token))
    assert activo.status_code == 404, activo.text  # autorizado por token ERP; el cliente no existe
    _desactivar(db, user_vendedor)
    r = app_client.put(url, json={}, headers=auth(vendedor_token))
    assert r.status_code == 401, r.text


def test_get_optional_current_user_ignora_al_desactivado(db, user_vendedor, vendedor_token):
    assert get_optional_current_user(token=vendedor_token, db=db).id == user_vendedor.id
    user_vendedor.is_active = None
    db.commit()
    assert get_optional_current_user(token=vendedor_token, db=db).id == user_vendedor.id, "NULL sigue entrando"
    _desactivar(db, user_vendedor)
    assert get_optional_current_user(token=vendedor_token, db=db) is None


# ---- A5: cambiar la clave cierra las sesiones abiertas (claim 'pv') ---------------------------------------------

def _huella(password_hash):
    import hashlib
    return hashlib.sha256(password_hash.encode()).hexdigest()[:16]


def _cambiar_hash(db, usuario):
    # Como change-password / reset-password, pero solo dentro de la transaccion revertida del runner y con un valor
    # desechable generado aqui.
    from app.core.security import get_password_hash
    usuario.password_hash = get_password_hash(secrets.token_urlsafe(16))
    db.commit()


def test_login_y_refresh_traen_la_huella_de_la_clave(app_client, user_vendedor, clave_de_prueba):
    r = _login(app_client, user_vendedor.email, clave_de_prueba)
    assert r.status_code == 200, r.status_code
    token = r.json()["access_token"]
    payload = _payload(token)
    assert payload["pv"] == _huella(user_vendedor.password_hash)
    assert len(payload["pv"]) == 16 and all(c in "0123456789abcdef" for c in payload["pv"])
    assert user_vendedor.password_hash not in token and user_vendedor.password_hash not in str(payload)
    refrescado = app_client.post("/api/v1/auth/refresh", headers=auth(token))
    assert refrescado.status_code == 200, refrescado.text
    assert _payload(refrescado.json()["access_token"])["pv"] == _huella(user_vendedor.password_hash)


def test_token_con_la_huella_correcta_entra(app_client, user_vendedor, clave_de_prueba):
    token = _login(app_client, user_vendedor.email, clave_de_prueba).json()["access_token"]
    me = app_client.get("/api/v1/auth/me", headers=auth(token))
    assert me.status_code == 200, me.text
    assert me.json()["data"]["id"] == user_vendedor.id


def test_cambiar_la_clave_deja_fuera_al_token_viejo(app_client, db, user_vendedor, clave_de_prueba):
    viejo = _login(app_client, user_vendedor.email, clave_de_prueba).json()["access_token"]
    assert app_client.get("/api/v1/auth/me", headers=auth(viejo)).status_code == 200
    _cambiar_hash(db, user_vendedor)
    me = app_client.get("/api/v1/auth/me", headers=auth(viejo))
    assert me.status_code == 401, me.text
    r = app_client.post("/api/v1/auth/refresh", headers=auth(viejo))
    assert r.status_code == 401, r.text
    assert get_optional_current_user(token=viejo, db=db) is None


def test_token_sin_huella_entra_y_refresh_lo_cambia_por_uno_con_huella(app_client, db, user_vendedor,
                                                                      vendedor_token):
    # Los tokens emitidos antes del despliegue no traen 'pv': se aceptan (vencen solos).
    assert "pv" not in _payload(vendedor_token)
    me = app_client.get("/api/v1/auth/me", headers=auth(vendedor_token))
    assert me.status_code == 200, me.text
    r = app_client.post("/api/v1/auth/refresh", headers=auth(vendedor_token))
    assert r.status_code == 200, r.text
    nuevo = r.json()["access_token"]
    assert _payload(nuevo)["pv"] == _huella(user_vendedor.password_hash)
    # Desde ahi, cambiar la clave tambien lo deja fuera.
    _cambiar_hash(db, user_vendedor)
    assert app_client.get("/api/v1/auth/me", headers=auth(nuevo)).status_code == 401
