import uuid


def _headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


def _make_customer(db, first_name="Abraham", last_name="Anturi"):
    from app.models.customers import Customer
    c = Customer(
        first_name=first_name, last_name=last_name,
        phone="123456798", email=f"{uuid.uuid4().hex[:8]}@test.nebulae",
        city="Puerto Colombia", document=uuid.uuid4().hex[:9],
    )
    db.add(c); db.commit(); return c


class TestCustomerSearch:
    """Reproduce el bug reportado: buscar por nombre completo ('Abraham Anturi')
    no encuentra al cliente aunque buscar solo 'Abraham' si lo encuentra, porque
    el ILIKE se aplicaba a first_name y last_name por separado, y ninguno de los
    dos contiene el string completo 'abraham anturi'."""

    def test_busca_por_nombre_completo(self, app_client, admin_token, db):
        _make_customer(db, "Abraham", "Anturi")
        r = app_client.get(
            "/api/v1/crm/customers/search?q=Abraham%20Anturi",
            headers=_headers(admin_token),
        )
        assert r.status_code == 200, r.text
        results = r.json()["data"]
        assert any(c["first_name"] == "Abraham" and c["last_name"] == "Anturi" for c in results), (
            "Buscar el nombre completo 'Abraham Anturi' deberia encontrar al cliente"
        )

    def test_busca_por_nombre_parcial_sigue_funcionando(self, app_client, admin_token, db):
        _make_customer(db, "Abraham", "Anturi")
        r = app_client.get(
            "/api/v1/crm/customers/search?q=Abraham",
            headers=_headers(admin_token),
        )
        assert r.status_code == 200, r.text
        results = r.json()["data"]
        assert any(c["first_name"] == "Abraham" for c in results)

    def test_busqueda_de_nombre_completo_no_es_sensible_a_mayusculas(self, app_client, admin_token, db):
        _make_customer(db, "Abraham", "Anturi")
        r = app_client.get(
            "/api/v1/crm/customers/search?q=abraham%20anturi",
            headers=_headers(admin_token),
        )
        assert r.status_code == 200, r.text
        results = r.json()["data"]
        assert any(c["first_name"] == "Abraham" and c["last_name"] == "Anturi" for c in results), (
            "Buscar en minusculas deberia encontrar al cliente igual que en mayusculas"
        )
