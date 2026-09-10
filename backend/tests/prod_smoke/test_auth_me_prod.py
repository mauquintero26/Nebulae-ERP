"""
test_auth_me_prod.py — Test focalizado de autenticación en producción.

Verifica:
  1. POST /api/v1/auth/login   → HTTP 200
  2. GET  /api/v1/auth/me      → HTTP 200
  3. UserResponse.created_at   → campo puede ser None (no existe en tabla users)
  4. Cero HTTP 500

Este test realiza peticiones HTTP directas al servidor corriendo en
127.0.0.1:5003 (lanzado con launch_production.py).

NO usa fixtures de sesión ni alembic, por lo que es seguro ejecutarlo
de forma aislada sin el conftest global de tests/.

Ejecución:
    C:\\Python314\\python.exe -m pytest tests/prod_smoke/test_auth_me_prod.py -v --noconftest
"""
import os
import urllib.request
import urllib.error
import urllib.parse
import json
import pytest

BASE_URL = os.environ.get("SMOKE_BASE_URL", "http://127.0.0.1:5003")
ADMIN_EMAIL = os.environ.get("SMOKE_ADMIN_EMAIL", "")
ADMIN_PASSWORD = os.environ.get("SMOKE_ADMIN_PASSWORD", "")

if not ADMIN_EMAIL or not ADMIN_PASSWORD:
    pytest.skip(
        "SMOKE_ADMIN_EMAIL y SMOKE_ADMIN_PASSWORD no están definidas. "
        "Exportar antes de correr: $env:SMOKE_ADMIN_EMAIL='...'; $env:SMOKE_ADMIN_PASSWORD='...'",
        allow_module_level=True,
    )

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def http_post_form(url: str, fields: dict) -> tuple[int, dict]:
    """POST con Content-Type: application/x-www-form-urlencoded (OAuth2)."""
    data = urllib.parse.urlencode(fields).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        try:
            return e.code, json.loads(body)
        except Exception:
            return e.code, {"error": body}


def http_get_json(url: str, token: str | None = None) -> tuple[int, dict]:
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        try:
            return e.code, json.loads(body)
        except Exception:
            return e.code, {"error": body}


def _get_token() -> str:
    """Obtiene access_token del admin. Lanza AssertionError si falla."""
    status, body = http_post_form(
        f"{BASE_URL}/api/v1/auth/login",
        {"username": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert status == 200, f"login devolvió {status}: {body}"
    assert "access_token" in body, f"Sin access_token en: {body}"
    return body["access_token"]


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_login_returns_200():
    """POST /api/v1/auth/login (form-urlencoded) debe devolver HTTP 200 y un access_token."""
    status, body = http_post_form(
        f"{BASE_URL}/api/v1/auth/login",
        {"username": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert status != 500, f"login devolvió HTTP 500 — ERROR CRÍTICO. Body: {body}"
    assert status == 200, f"login esperaba 200, obtuvo {status}. Body: {body}"
    assert "access_token" in body, f"Respuesta de login no contiene access_token: {body}"


def test_auth_me_returns_200():
    """GET /api/v1/auth/me con token válido debe devolver HTTP 200."""
    token = _get_token()
    status, body = http_get_json(f"{BASE_URL}/api/v1/auth/me", token=token)
    assert status != 500, f"/auth/me devolvió HTTP 500 — ERROR CRÍTICO. Body: {body}"
    assert status == 200, f"/auth/me esperaba 200, obtuvo {status}. Body: {body}"


def test_auth_me_created_at_optional():
    """
    GET /api/v1/auth/me: campo created_at puede ser None o ausente.
    La tabla users NO tiene columna created_at en erpdb.
    Antes del fix, este endpoint devolvía HTTP 500 (ValidationError: Field required).
    Ahora debe devolver 200 con created_at == null en el payload data.
    """
    token = _get_token()
    status, body = http_get_json(f"{BASE_URL}/api/v1/auth/me", token=token)
    assert status != 500, f"/auth/me devolvió HTTP 500 — ERROR CRÍTICO. Body: {body}"
    assert status == 200, f"/auth/me devolvió {status} (esperaba 200). Body: {body}"

    # /auth/me devuelve {"status":"success","data":{...}}
    data = body.get("data", body)
    created_at = data.get("created_at")
    assert created_at is None, (
        f"created_at debe ser None (columna no existe en users), "
        f"obtuvo: {created_at!r}. Full body: {body}"
    )


def test_no_http_500_on_health():
    """GET /health nunca debe devolver HTTP 500."""
    status, body = http_get_json(f"{BASE_URL}/health")
    assert status != 500, f"/health devolvió HTTP 500 — ERROR CRÍTICO. Body: {body}"
    assert status == 200, f"/health devolvió {status} (esperaba 200). Body: {body}"
    assert body.get("status") == "ok", f"health body inesperado: {body}"
