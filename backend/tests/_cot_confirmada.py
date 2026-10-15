"""Preparación de las pruebas que crean un pedido por POST /ventas/pedidos/canonico (B2.1, D3).

Desde D3 el pedido directo exige la cotización (cot_id) de su cliente en estado CONFIRMADA y con la marca de Gate 2
(gate2_confirmed_at) sin usar, igual que el camino de las pantallas. cot_confirmada_para_canonico() la crea dentro de
la transacción de la prueba (db.flush(), sin commit: la API la ve porque comparte la conexión, y se revierte con la
prueba) y devuelve su id para el cuerpo del pedido. Cada llamada crea una COT nueva: un pedido por COT.

Los números llevan el prefijo de prueba «PDT» y un sufijo aleatorio, así que nunca chocan con los números reales
(SC-AAAA####, COT-AAAA####).
"""
import datetime
import uuid

from app.models.customers import Customer
from app.models.erp_documents import CustomerRequest, SalesQuotation


def cot_confirmada_para_canonico(db, customer_id, sc_id=None) -> int:
    """Id de una COT CONFIRMADA, con la marca de Gate 2, del cliente `customer_id`.

    Sin `sc_id` crea también su SC (CONFIRMADA, del mismo cliente), como en el camino normal, donde la COT nace de una
    solicitud. Con `sc_id` la COT queda en esa solicitud."""
    cliente = db.get(Customer, customer_id)
    assert cliente is not None, f"el cliente {customer_id} no existe"
    datos = {"customer_id": cliente.id, "customer_name": f"{cliente.first_name} {cliente.last_name}".strip(),
             "customer_email": cliente.email, "customer_phone": cliente.phone}
    sufijo = uuid.uuid4().hex[:8].upper()
    if sc_id is None:
        sc = CustomerRequest(numero=f"SC-PDT-{sufijo}", estado="CONFIRMADA", productos=[], **datos)
        db.add(sc)
        db.flush()
    else:
        sc = db.get(CustomerRequest, sc_id)
    cot = SalesQuotation(numero=f"COT-PDT-{sufijo}", sc_id=sc.id, sc_numero=sc.numero, estado="CONFIRMADA",
                         gate2_confirmed_at=datetime.datetime.utcnow(), productos=[], **datos)
    db.add(cot)
    db.flush()
    return cot.id
