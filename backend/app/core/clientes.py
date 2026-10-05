"""Ficha del cliente (customers): su numero visible, el correo repetido y su historial de cambios (H21, Bloque 2).

Sin FastAPI. Lo usan erp_ventas (PATCH /solicitudes/{id}/cliente) y crm (PUT /crm/customers/{id} y el perfil 360): crm
no puede importar erp_ventas, porque erp_ventas ya importa de crm. Nada de aqui hace commit: lo confirma el llamador.
"""
from sqlalchemy import func

from app.models.customers import Customer
from app.models.erp_documents import ActivityLog

# Unico indice de customers que puede chocar al corregir el contacto (customers.email, unique y sensible a mayusculas).
_VIOLACION_DE_UNICIDAD = "23505"


def numero_cliente(c) -> str:
    """'CLI-0012': el mismo formato que muestra la Agenda (agenda/page.tsx)."""
    return f"CLI-{c.id:04d}"


def nombre_cliente(c) -> str:
    return " ".join(p for p in ((c.first_name or "").strip(), (c.last_name or "").strip()) if p) or numero_cliente(c)


def correo_de_otro_cliente(db, correo, excluir_id=None):
    """El Customer (el de menor id) cuyo correo es `correo` sin importar mayusculas ni espacios de los bordes, y que no
    es `excluir_id`; None si no hay o si `correo` esta vacio."""
    correo = (correo or "").strip().lower()
    if not correo:
        return None
    q = db.query(Customer).filter(func.lower(func.trim(Customer.email)) == correo)
    if excluir_id is not None:
        q = q.filter(Customer.id != excluir_id)
    return q.order_by(Customer.id.asc()).first()


def es_correo_repetido(exc) -> bool:
    """True si el IntegrityError es el indice unico del correo de customers (una carrera: otro cliente tomo ese correo
    entre la revision previa y la escritura). Cualquier otra violacion se deja subir."""
    orig = getattr(exc, "orig", None)
    return getattr(orig, "pgcode", None) == _VIOLACION_DE_UNICIDAD and "email" in str(orig).lower()


def log_cliente(db, cliente, descripcion, cambios, origen, user_name):
    """Renglon del historial del cliente (lo lee el perfil 360): ActivityLog con entity_type 'CLIENTE' y action
    'UPDATED'. SIN commit. origen = {'tipo': 'SC', 'id', 'numero'} o {'tipo': 'FICHA'}."""
    log = ActivityLog(entity_type="CLIENTE", entity_id=cliente.id, entity_numero=numero_cliente(cliente),
                      action="UPDATED", description=descripcion, user_name=user_name,
                      extra_data={"cambios": cambios, "origen": origen})
    db.add(log)
    return log
