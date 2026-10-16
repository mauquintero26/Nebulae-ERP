import uuid
from datetime import timedelta

from app.core.security import create_access_token
from app.models.users import User


def _registrar(app_client, rol, token=None, prefijo="nuevo"):
    """POST /auth/register con un correo nuevo; con `token`, como esa sesion."""
    correo = f"{prefijo}-{uuid.uuid4().hex[:6]}@test.nebulae"
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    resp = app_client.post(
        "/api/v1/auth/register",
        json={"email": correo, "password": "Test123!", "role": rol},
        headers=headers,
    )
    return resp, correo


def test_register_rejects_admin_role(app_client, admin_token):
    # B2.1 D1: el registro exige sesion de ADMIN, y ni asi se crea otra cuenta de Administrador.
    resp, _ = _registrar(app_client, "admin", admin_token, "hacker")
    assert resp.status_code == 403


def test_register_rejects_admin_role_case_insensitive(app_client, admin_token):
    resp, _ = _registrar(app_client, "Admin", admin_token, "hacker2")
    assert resp.status_code == 403


def test_register_allows_non_admin_role(app_client, admin_token):
    # B2.1 D1: antes pasaba sin sesion; ahora la manda el administrador (como la pantalla de Empleados).
    resp, _ = _registrar(app_client, "Vendedor", admin_token, "newuser")
    assert resp.status_code == 201


# ── B2.1 D1: solo un administrador crea cuentas ────────────────────────────────────────────────────────


def test_register_sin_sesion_responde_401_y_no_crea_la_cuenta(app_client, db):
    resp, correo = _registrar(app_client, "Asesor")
    assert resp.status_code == 401, resp.text
    assert db.query(User).filter(User.email == correo).first() is None


def test_register_con_sesion_de_asesor_responde_403_y_no_crea_la_cuenta(app_client, db, vendedor_token):
    resp, correo = _registrar(app_client, "Asesor", vendedor_token)
    assert resp.status_code == 403, resp.text
    assert db.query(User).filter(User.email == correo).first() is None


def test_register_admin_con_rol_asesor_crea_la_cuenta(app_client, db, admin_token):
    resp, correo = _registrar(app_client, "Asesor", admin_token)
    assert resp.status_code == 201, resp.text
    assert resp.json()["data"]["email"] == correo
    creado = db.query(User).filter(User.email == correo).first()
    assert creado is not None and creado.role == "Asesor"


def test_register_admin_con_rol_inventado_responde_422_legible(app_client, db, admin_token):
    resp, correo = _registrar(app_client, "Inventado", admin_token)
    assert resp.status_code == 422, resp.text
    detalle = resp.json()["detail"]
    assert isinstance(detalle, str) and "Inventado" in detalle, detalle
    assert db.query(User).filter(User.email == correo).first() is None


def test_register_admin_con_rol_vacio_responde_422(app_client, db, admin_token):
    resp, correo = _registrar(app_client, "   ", admin_token)
    assert resp.status_code == 422, resp.text
    assert isinstance(resp.json()["detail"], str)
    assert db.query(User).filter(User.email == correo).first() is None


def test_register_escrituras_raras_de_admin_no_crean_cuenta(app_client, db, admin_token):
    """B2.1 T1 r1 (Minor 4): fija lo que hoy da normalize_role con escrituras raras de ADMIN. Con espacios o con la i sin
    punto se normaliza a ADMIN (403); con ancho completo o con tilde no es ningun rol (422). Ninguna crea la cuenta."""
    esperado = {" admin ": 403, "ＡＤＭＩＮ": 422, "ÁDMIN": 422, "admın": 403}
    for rol, codigo in esperado.items():
        resp, correo = _registrar(app_client, rol, admin_token)
        assert resp.status_code == codigo, (rol, resp.text)
        assert db.query(User).filter(User.email == correo).first() is None, rol


def test_register_guarda_el_rol_recortado(app_client, db, admin_token):
    """B2.1 T1 r1 (Minor 5): el rol se guarda sin espacios en los bordes y con la forma que manda Empleados."""
    resp, correo = _registrar(app_client, " asesor ", admin_token)
    assert resp.status_code == 201, resp.text
    db.expire_all()
    assert db.query(User).filter(User.email == correo).first().role == "asesor"


def test_register_con_un_correo_ya_registrado_responde_400_en_espanol(app_client, db, admin_token):
    """B2.1 (revision final, Minor 3): el administrador ve este aviso en Empleados; antes decia «Email already
    registered». No crea una segunda cuenta con ese correo."""
    resp, correo = _registrar(app_client, "Asesor", admin_token)
    assert resp.status_code == 201, resp.text
    resp = app_client.post(
        "/api/v1/auth/register",
        json={"email": correo, "password": "Test123!", "role": "Asesor"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 400, resp.text
    assert resp.json()["detail"] == "Ese correo ya está registrado."
    assert db.query(User).filter(User.email == correo).count() == 1


def test_update_role_email_backdoor_removed(app_client, db):
    u = User(
        email=f"jmquintero-nonadmin-{uuid.uuid4().hex[:6]}@test.nebulae",
        password_hash="x",
        role="Vendedor",
        is_active=True,
    )
    db.add(u)
    db.commit()
    token = create_access_token({"sub": str(u.id), "role": u.role}, expires_delta=timedelta(minutes=5))

    resp = app_client.patch(
        f"/api/v1/auth/users/{u.id}/role",
        json={"role": "ADMIN"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403


def test_update_role_allows_real_admin(app_client, admin_token, user_vendedor):
    resp = app_client.patch(
        f"/api/v1/auth/users/{user_vendedor.id}/role",
        json={"role": "COMPRAS"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
