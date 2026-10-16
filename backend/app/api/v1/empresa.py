"""Datos de la empresa (Bloque 3, T2: MARCA, C1, R12, RP15).

router (montado en /api/v1/empresa, con sesion):
- GET ''           todos los roles del ERP: el perfil (sin el contenido del logo) y puede_editar (solo ADMIN).
- PUT ''           ADMIN: cambia campos (validar_cambios; un error -> 422 con el mensaje en espanol, sin guardar nada).
- PUT '/logo'      ADMIN: {'logo': data URL} PNG, JPG o WebP de hasta 300 KB.
- DELETE '/logo'   ADMIN.
- GET '/historial' ADMIN: los ultimos 30 renglones EMPRESA de la Actividad (quien y antes -> despues).
El autor de la Actividad sale de la sesion (nombre_de_usuario); un user_name del body se ignora (RP15).

router_publico (montado en /api/v1/publico, SIN autenticacion -- publico por diseno, como confirmacion_publica):
- GET '/empresa'       solo la lista blanca de perfil_publico (nunca terminos ni datos para pagar).
- GET '/empresa/logo'  la imagen, con nosniff y CSP; con ?v=<version actual> se guarda en cache un ano.
"""
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import JSONResponse, Response
from sqlalchemy.orm import Session

from app.api.dependencies import ALL_ERP_ROLES, ROLE_ADMIN, normalize_role, require_roles
from app.core import empresa as datos_empresa
from app.core.fechas import iso_z
from app.core.textos_actividad import nombre_de_usuario
from app.db.database import get_db
from app.models.erp_documents import ActivityLog
from app.models.users import User

router = APIRouter()
router_publico = APIRouter()

HISTORIAL_LIMITE = 30
CACHE_PERFIL_PUBLICO = "public, max-age=60"
CACHE_LOGO_VERSIONADO = "public, max-age=31536000, immutable"
CACHE_LOGO_SIN_VERSION = "public, max-age=60"


def _perfil_para(db: Session, user: User) -> dict:
    return {**datos_empresa.leer_perfil(db), "puede_editar": normalize_role(user.role) == "ADMIN"}


@router.get("")
def ver_empresa(user: User = Depends(require_roles(*ALL_ERP_ROLES)), db: Session = Depends(get_db)):
    return {"status": "success", "data": _perfil_para(db, user)}


@router.put("")
def cambiar_empresa(body: dict = Body(...), user: User = Depends(require_roles(*ROLE_ADMIN)),
                    db: Session = Depends(get_db)):
    campos = {k: v for k, v in body.items() if k != "user_name"}  # RP15: el autor sale de la sesion
    try:
        cambios = datos_empresa.validar_cambios(campos)
    except ValueError as e:
        raise HTTPException(422, str(e))
    hechos = datos_empresa.guardar_cambios(db, cambios, nombre_de_usuario(user))
    return {"status": "success", "data": _perfil_para(db, user), "cambios": hechos}


@router.put("/logo")
def cambiar_logo(body: dict = Body(...), user: User = Depends(require_roles(*ROLE_ADMIN)),
                 db: Session = Depends(get_db)):
    try:
        datos_empresa.guardar_logo(db, body.get("logo"), nombre_de_usuario(user))
    except ValueError as e:
        raise HTTPException(422, str(e))
    return {"status": "success", "data": _perfil_para(db, user)}


@router.delete("/logo")
def quitar_logo(user: User = Depends(require_roles(*ROLE_ADMIN)), db: Session = Depends(get_db)):
    datos_empresa.quitar_logo(db, nombre_de_usuario(user))
    return {"status": "success", "data": _perfil_para(db, user)}


@router.get("/historial")
def historial_empresa(user: User = Depends(require_roles(*ROLE_ADMIN)), db: Session = Depends(get_db)):
    filas = (db.query(ActivityLog)
             .filter(ActivityLog.entity_type == datos_empresa.ENTIDAD_EMPRESA)
             .order_by(ActivityLog.id.desc())
             .limit(HISTORIAL_LIMITE)
             .all())
    return {"status": "success", "data": [
        {"id": f.id, "descripcion": f.description, "user_name": f.user_name, "created_at": iso_z(f.created_at),
         "cambios": (f.extra_data or {}).get("cambios") or []}
        for f in filas
    ]}


# ─── Publico: sin autenticacion -- publico por diseno ─────────────────────────────────────────────────────────

@router_publico.get("/empresa")
def empresa_publica(db: Session = Depends(get_db)):
    return JSONResponse({"status": "success", "data": datos_empresa.perfil_publico(db)},
                        headers={"Cache-Control": CACHE_PERFIL_PUBLICO})


@router_publico.get("/empresa/logo")
def logo_publico(v: Optional[str] = Query(None), db: Session = Depends(get_db)):
    logo = datos_empresa.leer_logo(db)
    if logo is None:
        raise HTTPException(404, "La empresa no tiene logo.")
    mime, contenido, version = logo
    return Response(content=contenido, media_type=mime, headers={
        "Cache-Control": CACHE_LOGO_VERSIONADO if v == version else CACHE_LOGO_SIN_VERSION,
        "ETag": f'"{version}"',
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'",
    })
