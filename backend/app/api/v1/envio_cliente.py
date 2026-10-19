"""Envio automatico por WhatsApp: configuracion, «Probar conexion» y estado de entrega (Bloque 3, T8: U16-envio y
U16-entrega). Montado en main.py con prefix /api/v1/ventas (como erp_ventas_fase4). Toda la logica vive en
app/core/envio_whatsapp.py; aqui solo los roles, el 404 y el 422 en espanol (R12).

- GET  /envio-cliente/whatsapp/estado   ADMIN y ASESOR: {automatico, listo, plantilla_configurada,
                                        plantilla_recordatorio_configurada, motivo_texto} (lo que necesita el modal).
- GET  /envio-cliente/whatsapp/config   ADMIN: valores, servidor_configurado, textos de las dos plantillas para Meta
                                        (C15), categoria 'UTILITY' y ejemplos de sus variables.
- PUT  /envio-cliente/whatsapp/config   ADMIN: automatico, inbox_id, plantilla, plantilla_recordatorio, idioma. Todo o
                                        nada, 422 en espanol; guarda con el upsert de admin_config (RP17) y anota el
                                        cambio en el historial de Configuracion (renglon EMPRESA).
- POST /envio-cliente/whatsapp/probar   ADMIN: version de Chatwoot y bandeja (hueco 0); no envia mensajes.
- POST /envio-cliente/{envio_id}/verificar  ADMIN y ASESOR: {envio_id, estado, texto, boton_manual, verificado}; 404
                                        'Envío no encontrado'.
Todas responden {"status": "success", "data": ...}. Ninguna devuelve el token ni la URL de Chatwoot (viven solo en las
variables del servidor, R18). El autor sale de la sesion con nombre_de_usuario; un user_name del body se ignora (RP15
y decision 7 del controlador): el PUT lo anota en la Actividad, verificar en el renglon MENSAJE_CLIENTE y probar lo
devuelve como probado_por.
"""
from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.dependencies import ROLE_ADMIN, ROLE_ASESOR, require_roles
from app.core import envio_whatsapp
from app.core.textos_actividad import nombre_de_usuario
from app.db.database import get_db
from app.models.envios import EnvioAlCliente
from app.models.users import User

router = APIRouter()


@router.get("/envio-cliente/whatsapp/estado")
def estado_envio_whatsapp(user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)),
                          db: Session = Depends(get_db)):
    return {"status": "success", "data": envio_whatsapp.estado_config(db)}


@router.get("/envio-cliente/whatsapp/config")
def ver_config_envio_whatsapp(user: User = Depends(require_roles(*ROLE_ADMIN)), db: Session = Depends(get_db)):
    return {"status": "success", "data": envio_whatsapp.config_para_admin(db)}


@router.put("/envio-cliente/whatsapp/config")
def cambiar_config_envio_whatsapp(body: dict = Body(...), user: User = Depends(require_roles(*ROLE_ADMIN)),
                                  db: Session = Depends(get_db)):
    campos = {k: v for k, v in body.items() if k != "user_name"}  # RP15: el autor sale de la sesion
    try:
        cambios = envio_whatsapp.validar_cambios(db, campos)
    except ValueError as e:
        raise HTTPException(422, str(e))
    hechos = envio_whatsapp.guardar_configuracion(db, cambios, nombre_de_usuario(user))
    db.commit()
    return {"status": "success", "data": envio_whatsapp.config_para_admin(db), "cambios": hechos}


@router.post("/envio-cliente/whatsapp/probar")
def probar_envio_whatsapp(body: dict = Body(default_factory=dict), user: User = Depends(require_roles(*ROLE_ADMIN)),
                          db: Session = Depends(get_db)):
    return {"status": "success",
            "data": {**envio_whatsapp.probar_conexion(db), "probado_por": nombre_de_usuario(user)}}


@router.post("/envio-cliente/{envio_id}/verificar")
def verificar_envio_al_cliente(envio_id: int, body: dict = Body(default_factory=dict),
                               user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)),
                               db: Session = Depends(get_db)):
    envio = db.query(EnvioAlCliente).filter(EnvioAlCliente.id == envio_id).first()
    if envio is None:
        raise HTTPException(404, "Envío no encontrado")
    return {"status": "success", "data": envio_whatsapp.verificar_envio(db, envio, nombre_de_usuario(user))}
