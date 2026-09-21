def test_update_config_with_special_characters_is_stored_safely(app_client, admin_token):
    malicious_key = "clave_test_o'brien"
    resp = app_client.patch(
        "/api/v1/ventas/config",
        json={malicious_key: "valor con ' comilla"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200

    resp2 = app_client.get(
        "/api/v1/ventas/config",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp2.status_code == 200
    assert resp2.json()["data"][malicious_key]["value"] == "valor con ' comilla"


def test_update_config_injection_attempt_does_not_break_table(app_client, admin_token):
    malicious_key = "x'); DROP TABLE admin_config; --"
    resp = app_client.patch(
        "/api/v1/ventas/config",
        json={malicious_key: "1"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200

    resp2 = app_client.get(
        "/api/v1/ventas/config",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp2.status_code == 200
    assert malicious_key in resp2.json()["data"]
