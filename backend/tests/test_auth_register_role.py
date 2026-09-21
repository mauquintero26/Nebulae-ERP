import uuid
from datetime import timedelta

from app.core.security import create_access_token
from app.models.users import User


def test_register_rejects_admin_role(app_client):
    resp = app_client.post(
        "/api/v1/auth/register",
        json={
            "email": f"hacker-{uuid.uuid4().hex[:6]}@test.nebulae",
            "password": "Test123!",
            "role": "admin",
        },
    )
    assert resp.status_code == 403


def test_register_rejects_admin_role_case_insensitive(app_client):
    resp = app_client.post(
        "/api/v1/auth/register",
        json={
            "email": f"hacker2-{uuid.uuid4().hex[:6]}@test.nebulae",
            "password": "Test123!",
            "role": "Admin",
        },
    )
    assert resp.status_code == 403


def test_register_allows_non_admin_role(app_client):
    resp = app_client.post(
        "/api/v1/auth/register",
        json={
            "email": f"newuser-{uuid.uuid4().hex[:6]}@test.nebulae",
            "password": "Test123!",
            "role": "Vendedor",
        },
    )
    assert resp.status_code == 201


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
