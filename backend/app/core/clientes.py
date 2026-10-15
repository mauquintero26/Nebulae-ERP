"""Ficha del cliente (customers): su numero visible, el correo repetido, los limites del contacto y su historial de
cambios (H21, Bloque 2).

Sin FastAPI. Lo usan erp_ventas (PATCH /solicitudes/{id}/cliente) y crm (PUT /crm/customers/{id} y el perfil 360): crm
no puede importar erp_ventas, porque erp_ventas ya importa de crm. La tienda web (ecommerce y store) usa correo_valido
(B2.1 D5). Nada de aqui hace commit: lo confirma el llamador.
"""
import re
from typing import Optional

from sqlalchemy import func

from app.models.customers import Customer
from app.models.erp_documents import ActivityLog

# Limites del contacto, comunes a PATCH /solicitudes/{id}/cliente y a PUT /crm/customers/{id}. Correo y telefono: las
# columnas customer_email String(150) y customer_phone String(50) de SC/COT/VEN. Direccion: 255 y no los 300 de
# SC/COT/VEN, porque en la base customers.address es varchar(255) (el modelo no lo declara). Ciudad (solo en la ficha):
# 100. T6A (validarContacto) copia estos textos. Se leen al llamar (las pruebas los pueden cambiar).
CORREO_MAX, TELEFONO_MAX, DIRECCION_MAX, CIUDAD_MAX = 150, 50, 255, 100
TELEFONO_MIN_DIGITOS = 7
# Formato del correo (se usa con fullmatch): algo@algo.algo, sin espacios ni una segunda @. Es el mismo CORREO_VALIDO de
# frontend/src/lib/datos-cliente.js (esCorreoValido). Lo usan la SC (erp_ventas._normalizar_contacto) y la tienda web.
CORREO_VALIDO = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")

# S2/S3 (T11): los roles (ya normalizados con normalize_role) que ven el antes y el despues del contacto del cliente: el
# historial customer_update del perfil 360 y los renglones de la Actividad de SC, COT y PVEN. Lista blanca: cualquier
# otro rol, tambien uno desconocido, los recibe sin valores.
ROLES_VEN_CONTACTO_ANTERIOR = frozenset({"ADMIN", "ASESOR"})

# customers.email es unico por el indice ix_customers_email (sensible a mayusculas), verificado en pg_indexes de
# erp_test. Una violacion de unicidad (23505) con ese nombre es una carrera por el correo.
_VIOLACION_DE_UNICIDAD = "23505"
_INDICE_CORREO = "ix_customers_email"


def numero_cliente(c) -> str:
    """'CLI-0012': el mismo formato que muestra la Agenda (agenda/page.tsx)."""
    return f"CLI-{c.id:04d}"


def nombre_cliente(c) -> str:
    return " ".join(p for p in ((c.first_name or "").strip(), (c.last_name or "").strip()) if p) or numero_cliente(c)


def texto_de_limite(campo: str, valor) -> Optional[str]:
    """El texto del 422 si `valor` (ya sin espacios en los bordes) pasa el limite de `campo` ('email', 'phone',
    'address' o 'city', las columnas de la ficha); None si cabe o no hay valor."""
    if not isinstance(valor, str):
        return None
    largo = len(valor)
    if campo == "email" and largo > CORREO_MAX:
        return f"El correo no puede tener más de {CORREO_MAX} caracteres."
    if campo == "phone" and largo > TELEFONO_MAX:
        return f"El teléfono no puede tener más de {TELEFONO_MAX} caracteres."
    if campo == "address" and largo > DIRECCION_MAX:
        return f"La dirección es muy larga (máximo {DIRECCION_MAX} caracteres)."
    if campo == "city" and largo > CIUDAD_MAX:
        return f"La ciudad es muy larga (máximo {CIUDAD_MAX} caracteres)."
    return None


def correo_valido(texto) -> bool:
    """True si `texto` es un texto que, sin espacios en los bordes, tiene el formato de CORREO_VALIDO (como
    esCorreoValido del frontend). None, un texto vacio o algo que no es texto: False."""
    return isinstance(texto, str) and CORREO_VALIDO.fullmatch(texto.strip()) is not None


def correo_de_otro_cliente(db, correo, excluir_id=None):
    """El Customer (el de menor id) cuyo correo es `correo` sin importar mayusculas ni espacios de los bordes, y que no
    es `excluir_id`; None si no hay o si `correo` esta vacio. lower() en los dos lados, en la base (misma regla de
    mayusculas para ambos)."""
    correo = (correo or "").strip()
    if not correo:
        return None
    q = db.query(Customer).filter(func.lower(func.trim(Customer.email)) == func.lower(correo))
    if excluir_id is not None:
        q = q.filter(Customer.id != excluir_id)
    return q.order_by(Customer.id.asc()).first()


def es_correo_repetido(exc) -> bool:
    """True si el IntegrityError es el indice unico del correo de customers (una carrera: otro cliente tomo ese correo
    entre la revision previa y la escritura). Se compara el nombre del indice que reporta PostgreSQL; la subcadena
    'email' solo cuenta si el driver no lo informa. Cualquier otra violacion se deja subir."""
    orig = getattr(exc, "orig", None)
    if getattr(orig, "pgcode", None) != _VIOLACION_DE_UNICIDAD:
        return False
    indice = getattr(getattr(orig, "diag", None), "constraint_name", None)
    if indice:
        return indice == _INDICE_CORREO
    return "email" in str(orig).lower()


def log_cliente(db, cliente, descripcion, cambios, origen, user_name):
    """Renglon del historial del cliente (lo lee el perfil 360): ActivityLog con entity_type 'CLIENTE' y action
    'UPDATED'. SIN commit. origen = {'tipo': 'SC', 'id', 'numero'} o {'tipo': 'FICHA'}."""
    log = ActivityLog(entity_type="CLIENTE", entity_id=cliente.id, entity_numero=numero_cliente(cliente),
                      action="UPDATED", description=descripcion, user_name=user_name,
                      extra_data={"cambios": cambios, "origen": origen})
    db.add(log)
    return log
