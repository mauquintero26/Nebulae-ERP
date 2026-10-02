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


@router.get("/confirmar/{token}")
def ver_confirmacion(token: str, db: Session = Depends(get_db)):
    resolved = peek_token(db, token)
    if not resolved:
        raise HTTPException(400, GENERIC_ERROR)
    document_type, document_id = resolved
    if document_type == "SC":
        from app.api.v1.erp_ventas import CustomerRequest, _sc_dict
        doc = db.query(CustomerRequest).filter(CustomerRequest.id == document_id).first()
        if not doc:
            raise HTTPException(400, GENERIC_ERROR)
        return {"status": "success", "data": _sc_dict(doc)}
    elif document_type == "COT":
        from app.api.v1.erp_ventas import SalesQuotation, _cot_dict
        doc = db.query(SalesQuotation).filter(SalesQuotation.id == document_id).first()
        if not doc:
            raise HTTPException(400, GENERIC_ERROR)
        return {"status": "success", "data": _cot_dict(doc)}
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
        if not sc:
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
