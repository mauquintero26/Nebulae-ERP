"""Fixtures de usuarios por rol para las pruebas de Ventas que corren con el runner de ROLLBACK.

El runner no carga conftest.py: un modulo de pruebas que necesite estas fixtures las importa
(`from tests.usuarios_de_prueba import compras_token`) y el runner (o pytest) las encuentra por nombre.
Los usuarios se crean dentro de la transaccion de la prueba, asi que se revierten con ella.
"""
import uuid

import pytest


@pytest.fixture
def compras_token(db):
    """Token de un usuario COMPRAS: no edita cotizaciones, no crea pedidos ni verifica pagos."""
    from app.core.security import create_access_token
    from app.models.users import User
    u = User(email=f"compras-{uuid.uuid4().hex[:6]}@test.nebulae", password_hash="x", role="COMPRAS", is_active=True)
    db.add(u); db.commit()
    return create_access_token({"sub": str(u.id), "role": u.role})
