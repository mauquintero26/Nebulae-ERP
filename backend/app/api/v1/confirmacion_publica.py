# backend/app/api/v1/confirmacion_publica.py
"""
Router publico (sin autenticacion) para que un cliente confirme una
Solicitud (o, desde Task 5, una Cotizacion) haciendo clic en el link de un
solo uso que le llega por correo. Ver app/core/confirmation_tokens.py para
el mecanismo de token (mismo patron que el reset de contraseña).
"""
from fastapi import APIRouter, HTTPException, Depends, Header
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.core.confirmation_tokens import peek_token, verify_and_consume_token

router = APIRouter()

GENERIC_ERROR = "El enlace no es válido o ya expiró."


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


@router.get("/confirmar/{token}")
def ver_confirmacion(token: str, db: Session = Depends(get_db)):
    resolved = peek_token(db, token)
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
        if not doc:
            raise HTTPException(400, GENERIC_ERROR)
        return {"status": "success", "data": _cot_confirmacion_dict(doc)}
    raise HTTPException(400, GENERIC_ERROR)


@router.post("/confirmar/{token}")
def confirmar_via_token(token: str, idempotency_key: str = Header(..., alias="Idempotency-Key"), db: Session = Depends(get_db)):
    resolved = verify_and_consume_token(db, token)
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
        sc.updated_at = datetime.datetime.utcnow()
        db.commit()
        _log(db, "SC", sc.id, sc.numero, "ESTADO_CHANGED", "Confirmada por el cliente vía enlace",
             old_estado=old_estado, new_estado="CONFIRMADA", user_name="Cliente (confirmación por link)")
        return {"status": "success", "message": "Solicitud confirmada. Gracias."}
    elif document_type == "COT":
        # Implementado en Task 5 -- este bloque se completa ahí, no antes.
        raise HTTPException(501, "Confirmación de Cotización aún no implementada (Task 5)")
    raise HTTPException(400, GENERIC_ERROR)
