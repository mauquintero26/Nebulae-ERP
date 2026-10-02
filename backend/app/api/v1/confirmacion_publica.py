# backend/app/api/v1/confirmacion_publica.py
"""
Router publico (sin autenticacion) para que un cliente confirme una
Solicitud (o, desde Task 5, una Cotizacion) haciendo clic en el link de un
solo uso que le llega por correo. Ver app/core/confirmation_tokens.py para
el mecanismo de token (mismo patron que el reset de contraseña).
"""
from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.core.confirmation_tokens import peek_token, verify_and_consume_token

router = APIRouter()

GENERIC_ERROR = "El enlace no es válido o ya expiró."


class TokenBody(BaseModel):
    """Mismo shape que ResetPasswordRequest (app/schemas/users.py) -- el token va en
    el body JSON, nunca en la URL. Round 7: un uvicorn con access log encendido (el
    caso real en Dockerfile/start_production.sh/nebulae_service_wrapper.py, ninguno
    filtra uvicorn.access) escribe la URL completa de cada request en el log de
    servicio; con el token como path param, eso incluye el token crudo en texto
    plano en cada GET/POST -- exactamente lo que el Global Constraint del plan
    prohibe ("el token crudo nunca se loguea"). El password-reset que este modulo
    copia siempre evito esto por tomar el token en el body, nunca en la URL."""
    token: str


def _productos_publicos(productos: list) -> list:
    """Solo lo que un cliente externo deberia ver de sus propios productos --
    nunca costos/margenes de proveedor ni otros campos internos."""
    return [
        {
            "product_name": p.get("product_name"),
            "qty": p.get("qty"),
            "unit_price_cop": p.get("unit_price_cop"),
        }
        for p in (productos or [])
    ]


def _sc_confirmacion_dict(sc) -> dict:
    """Proyeccion publica minima de una Solicitud -- SOLO lo que un cliente con el
    link deberia poder ver de su propio pedido. Nunca usar _sc_dict() aqui: expone
    created_by, advisor_user_id, razon_cancelacion y otros campos internos que no
    son asunto del cliente."""
    return {
        "numero": sc.numero,
        "customer_name": sc.customer_name,
        "estado": sc.estado,
        "fecha_entrega_estimada": sc.fecha_entrega_estimada.isoformat() if sc.fecha_entrega_estimada else None,
        "productos": _productos_publicos(sc.productos),
    }


def _cot_confirmacion_dict(cot) -> dict:
    """Proyeccion publica minima de una Cotizacion -- ver _sc_confirmacion_dict.
    Nunca usar _cot_dict() aqui: expone costos/margenes de proveedor y otros campos
    internos (relevante en cuanto Task 5 empiece a emitir tokens de tipo COT)."""
    return {
        "numero": cot.numero,
        "customer_name": cot.customer_name,
        "estado": cot.estado,
        "fecha_entrega_estimada": cot.fecha_entrega_estimada.isoformat() if cot.fecha_entrega_estimada else None,
        "total_cop": float(cot.total_cop) if cot.total_cop else 0,
        "productos": _productos_publicos(cot.productos),
    }


@router.post("/confirmar/ver")
def ver_confirmacion(body: TokenBody, db: Session = Depends(get_db)):
    resolved = peek_token(db, body.token)
    if not resolved:
        raise HTTPException(400, GENERIC_ERROR)
    document_type, document_id = resolved
    if document_type == "SC":
        from app.api.v1.erp_ventas import CustomerRequest
        doc = db.query(CustomerRequest).filter(CustomerRequest.id == document_id).first()
        if not doc or doc.estado != "PENDIENTE_CONFIRMACION":
            # Mismo error generico si el documento no existe, ya no esta pendiente de
            # confirmacion (p.ej. fue cancelado despues de enviar el link) o cualquier
            # otro motivo -- nunca se distingue el caso para no filtrar informacion.
            raise HTTPException(400, GENERIC_ERROR)
        return {"status": "success", "data": _sc_confirmacion_dict(doc)}
    elif document_type == "COT":
        from app.api.v1.erp_ventas import SalesQuotation
        doc = db.query(SalesQuotation).filter(SalesQuotation.id == document_id).first()
        if not doc or doc.estado != "PENDIENTE_CONFIRMACION":
            # Mismo criterio que la rama SC arriba (Task 5): hoy no hay ningun camino
            # real que deje un token sin revocar para una COT que ya no esta
            # PENDIENTE_CONFIRMACION (update_cotizacion revoca en toda transicion real
            # de salida del ciclo de Gate 2 -- ver ese comentario), pero se valida
            # explicitamente en vez de asumirlo, misma defensa en profundidad que ya
            # existe para SC. Mismo error generico, nunca se distingue el motivo.
            raise HTTPException(400, GENERIC_ERROR)
        return {"status": "success", "data": _cot_confirmacion_dict(doc)}
    raise HTTPException(400, GENERIC_ERROR)


@router.post("/confirmar/confirmar")
def confirmar_via_token(body: TokenBody, idempotency_key: str = Header(..., alias="Idempotency-Key"), db: Session = Depends(get_db)):
    resolved = verify_and_consume_token(db, body.token)
    if not resolved:
        raise HTTPException(400, GENERIC_ERROR)
    document_type, document_id = resolved
    if document_type == "SC":
        from app.api.v1.erp_ventas import CustomerRequest, _log
        import datetime
        sc = db.query(CustomerRequest).filter(CustomerRequest.id == document_id).first()
        if not sc or sc.estado != "PENDIENTE_CONFIRMACION":
            # El token ya fue consumido por verify_and_consume_token de cualquier
            # forma (es de un solo uso) -- si la SC fue cancelada o movida de estado
            # despues de enviarse el link, este click no debe revivirla a CONFIRMADA.
            # Mismo error generico, nunca se distingue el motivo.
            raise HTTPException(400, GENERIC_ERROR)
        old_estado = sc.estado
        sc.estado = "CONFIRMADA"
        # Round 6: marca de procedencia de un solo uso -- ESTA es la UNICA linea del
        # codebase que escribe gate1_confirmed_at. confirmar_solicitud la exige (ademas
        # de estado=="CONFIRMADA") y la consume (vuelve a None) al avanzar a COTIZADA,
        # para que ninguna otra escritura futura de CONFIRMADA (p.ej. la sincronizacion
        # COT->SC en una venta completamente distinta) pueda reutilizarla.
        sc.gate1_confirmed_at = datetime.datetime.utcnow()
        sc.updated_at = datetime.datetime.utcnow()
        db.commit()
        _log(db, "SC", sc.id, sc.numero, "ESTADO_CHANGED", "Confirmada por el cliente vía enlace",
             old_estado=old_estado, new_estado="CONFIRMADA", user_name="Cliente (confirmación por link)")
        return {"status": "success", "message": "Solicitud confirmada. Gracias."}
    elif document_type == "COT":
        from app.api.v1.erp_ventas import SalesQuotation, _log, _sincronizar_estado_solicitud_desde_cotizacion
        import datetime
        # Round 3 (adversarial review, hallazgo #2): .populate_existing().with_for_update()
        # -- sin esto, una re-cotizacion concurrente (update_cotizacion rompiendo el
        # congelamiento de precio justo en este instante, por otra conexion) podria
        # escribir su propio commit entre la lectura de aqui y el commit de mas abajo sin
        # que esta transaccion lo vea, dejando CONFIRMADA + la marca puestas sobre una COT
        # cuyo precio ya cambio por debajo. El lock hace que esta transaccion espere (o
        # vea el estado ya actualizado) en vez de pisarlo a ciegas.
        cot = db.query(SalesQuotation).filter(SalesQuotation.id == document_id).populate_existing().with_for_update().first()
        if not cot or cot.estado != "PENDIENTE_CONFIRMACION":
            # El token ya fue consumido por verify_and_consume_token de cualquier
            # forma (es de un solo uso) -- si la COT fue movida de estado despues de
            # enviarse el link (el PATCH generico es la unica via real, y siempre
            # revoca -- ver update_cotizacion), este click no debe revivirla a
            # CONFIRMADA. Mismo error generico, nunca se distingue el motivo.
            raise HTTPException(400, GENERIC_ERROR)
        old_estado = cot.estado
        cot.estado = "CONFIRMADA"
        # Gate 2 (Task 5, mismo patron que gate1_confirmed_at en la rama SC arriba):
        # marca de procedencia de un solo uso. ESTA es la UNICA linea del codebase que
        # escribe gate2_confirmed_at. convertir_cotizacion_a_venta (erp_ventas_fase4.py)
        # exige EXPLICITAMENTE tanto estado=="CONFIRMADA" como gate2_confirmed_at no nulo
        # (dos checks separados desde Round 3, no uno que asuma al otro -- ver el
        # comentario alli sobre la ventana entre el congelamiento de precio y la limpieza
        # del marcador) y la consume (vuelve a None) en el mismo commit en que crea el
        # Pedido de Venta, para que no quede una prueba reutilizable por un ciclo de venta
        # futuro y no relacionado sobre la misma COT.
        cot.gate2_confirmed_at = datetime.datetime.utcnow()
        cot.updated_at = datetime.datetime.utcnow()
        db.commit()
        db.refresh(cot)
        # Mantiene la SC vinculada en sync -- mismo mecanismo preexistente y protegido
        # que ya usan update_cotizacion/confirmar_cotizacion para este mismo efecto
        # (_MAPA_ESTADO_COTIZACION_A_SOLICITUD mapea CONFIRMADA->CONFIRMADA). NO se
        # llama mover_lead_de_solicitud aqui: el movimiento del Lead a "Ganado"/INVOICED
        # ocurre al crear el Pedido de Venta (confirmar_cotizacion en erp_ventas.py,
        # despues de que convertir_cotizacion_a_venta devuelve un sale_order_id real),
        # no en este solo confirmar el precio -- verificado releyendo esa cadena de
        # llamadas antes de escribir esto, tal como pedia el plan.
        _sincronizar_estado_solicitud_desde_cotizacion(cot, db)
        _log(db, "COT", cot.id, cot.numero, "ESTADO_CHANGED", "Confirmada por el cliente vía enlace",
             old_estado=old_estado, new_estado="CONFIRMADA", user_name="Cliente (confirmación por link)")
        return {"status": "success", "message": "Cotización confirmada. Gracias."}
    raise HTTPException(400, GENERIC_ERROR)
