import uuid


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
