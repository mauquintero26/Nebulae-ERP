"""Preparación de las pruebas que crean un pedido por POST /ventas/pedidos/canonico (B2.1, D3).

Desde D3 el pedido directo exige la cotización (cot_id) de su cliente en estado CONFIRMADA y con la marca de Gate 2
(gate2_confirmed_at) sin usar, igual que el camino de las pantallas. cot_confirmada_para_canonico() la crea y devuelve
su id para el cuerpo del pedido. Cada llamada crea una COT nueva: un pedido por COT.

Todo queda dentro de la transacción de la prueba: con el runner de ROLLBACK, db.commit() solo libera un savepoint y la
prueba entera se revierte al final (igual que las fixtures del runner y los _setup_* de las pruebas de fase 4). Se
confirma con commit y no solo con flush porque un savepoint abierto en la sesión de la prueba hace caer el runner
(PendingRollbackError al cerrarla) cuando una prueba de concurrencia del mismo módulo invalida la conexión compartida.

Los números llevan el prefijo de prueba «PDT» y un sufijo aleatorio, así que nunca chocan con los números reales
(SC-AAAA####, COT-AAAA####).
"""
import datetime
import uuid

from app.models.customers import Customer
from app.models.erp_documents import CustomerRequest, SalesQuotation


def cot_confirmada_para_canonico(db, customer_id) -> int:
    """Id de una COT CONFIRMADA, con la marca de Gate 2, del cliente `customer_id`.

    Crea también su SC (CONFIRMADA, del mismo cliente), como en el camino normal, donde la COT nace de una solicitud."""
    cliente = db.get(Customer, customer_id)
    assert cliente is not None, f"el cliente {customer_id} no existe"
    datos = {"customer_id": cliente.id, "customer_name": f"{cliente.first_name} {cliente.last_name}".strip(),
             "customer_email": cliente.email, "customer_phone": cliente.phone}
    sufijo = uuid.uuid4().hex[:8].upper()
    sc = CustomerRequest(numero=f"SC-PDT-{sufijo}", estado="CONFIRMADA", productos=[], **datos)
    db.add(sc)
    db.flush()
    cot = SalesQuotation(numero=f"COT-PDT-{sufijo}", sc_id=sc.id, sc_numero=sc.numero, estado="CONFIRMADA",
                         gate2_confirmed_at=datetime.datetime.utcnow(), productos=[], **datos)
    db.add(cot)
    db.flush()
    cot_id = cot.id
    db.commit()
    return cot_id
