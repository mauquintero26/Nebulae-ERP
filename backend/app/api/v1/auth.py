import hashlib
import os
import re
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from fastapi.security import OAuth2PasswordRequestForm
from app.db.database import get_db
from app.models.users import User, PasswordResetToken
from app.schemas.users import (
    UserCreate, UserResponse, PasswordChange,
    ForgotPasswordRequest, ResetPasswordRequest, UsernameUpdate, NombreParaMostrarUpdate,
)
from app.core.security import get_password_hash, verify_password, create_access_token, SESSION_IDLE_TIMEOUT_MINUTES
from app.core.email import send_email
from app.core.nombre_para_mostrar import NombreParaMostrarInvalido, es_de_un_usuario, validar_nombre_para_mostrar
from app.api.dependencies import get_current_user, require_roles, ROLE_ADMIN, ALL_ERP_ROLES, normalize_role

router = APIRouter()

# ─── Reset de contraseña ──────────────────────────────────────────────────────
RESET_TOKEN_TTL_MINUTES = 45
RESET_TOKEN_COOLDOWN_SECONDS = 60
GENERIC_FORGOT_PASSWORD_MESSAGE = (
    "Si el correo existe en nuestro sistema, recibirás un enlace para restablecer tu contraseña."
)
GENERIC_RESET_PASSWORD_ERROR = "El enlace no es válido o ya expiró."

# ─── Username ──────────────────────────────────────────────────────────────────
USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9_]{3,32}$")

@router.post("/register", status_code=status.HTTP_201_CREATED)
def register_user(
    user: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*ROLE_ADMIN)),
):
    """Crea una cuenta del ERP. B2.1 D1: solo un administrador crea cuentas (la pantalla de Empleados); sin sesion
    responde 401 y con otro rol, 403. El rol pedido, normalizado, debe ser uno de ALL_ERP_ROLES (si no, 422) y
    nunca ADMIN (403). Se guarda como llega, sin espacios en los bordes (la forma de los ids de Empleados)."""
    rol = normalize_role(user.role)
    if rol == "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No se pueden crear cuentas con el rol de Administrador.",
        )
    if rol not in ALL_ERP_ROLES:
        validos = ", ".join(r for r in ALL_ERP_ROLES if r != "ADMIN")
        raise HTTPException(
            status_code=422,
            detail=f"El rol «{user.role.strip()}» no existe. Usa uno de estos: {validos}.",
        )

    db_user = db.query(User).filter(User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Ese correo ya está registrado.")

    hashed_password = get_password_hash(user.password)
    new_user = User(
        email=user.email,
        password_hash=hashed_password,
        role=user.role.strip()
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return {"status": "success", "data": UserResponse.model_validate(new_user).model_dump()}

@router.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(
        (User.email == form_data.username) | (User.username == form_data.username)
    ).first()
    # H23: un usuario desactivado recibe el MISMO 401 que una clave incorrecta (se revisa despues de la clave, para no
    # revelar que la cuenta existe); asi la ventana de re-ingreso muestra 'Contraseña incorrecta.' y no hay bucle.
    if not user or not verify_password(form_data.password, user.password_hash) or user.is_active is False:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    # H23: la sesion dura SESSION_IDLE_TIMEOUT_MINUTES (24 h) y el frontend la renueva con /refresh mientras se use.
    access_token_expires = timedelta(minutes=SESSION_IDLE_TIMEOUT_MINUTES)
    # A5: 'pv' (huella de la clave) cierra esta sesion si la clave cambia.
    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role}, expires_delta=access_token_expires,
        password_hash=user.password_hash,
    )
    # Return standard OAuth2 token format for Swagger UI support
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/me")
def read_users_me(current_user: User = Depends(get_current_user)):
    return {"status": "success", "data": UserResponse.model_validate(current_user).model_dump()}

@router.post("/refresh")
def refresh_session(current_user: User = Depends(get_current_user)):
    """H23: emite un token nuevo de SESSION_IDLE_TIMEOUT_MINUTES para el usuario del token vigente.

    El frontend (SessionKeeper) lo llama como maximo cada 10 minutos y solo si hubo uso real despues de emitirse
    el token. get_current_user ya rechaza con 401 un token vencido, de un usuario desactivado o de una clave que ya
    cambio (A5). El token nuevo siempre trae 'pv', aunque el viejo no lo trajera."""
    token = create_access_token(
        {"sub": str(current_user.id), "role": current_user.role},
        expires_delta=timedelta(minutes=SESSION_IDLE_TIMEOUT_MINUTES),
        password_hash=current_user.password_hash,
    )
    return {"access_token": token, "token_type": "bearer", "expires_in": SESSION_IDLE_TIMEOUT_MINUTES * 60}

@router.post("/change-password")
def change_password(
    payload: PasswordChange,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Contraseña actual incorrecta"
        )
    if len(payload.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La nueva contraseña debe tener al menos 8 caracteres"
        )
    current_user.password_hash = get_password_hash(payload.new_password)
    db.commit()
    return {"status": "success", "message": "Contraseña actualizada correctamente"}

@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """
    Siempre responde el mismo mensaje genérico, exista o no el email
    (anti-enumeración). Si existe un usuario activo con ese correo, genera
    un token de un solo uso (salvo que ya haya uno vigente creado hace
    menos de RESET_TOKEN_COOLDOWN_SECONDS) y le envía el link por correo.
    El token crudo solo vive en memoria y en el correo enviado -- nunca se
    guarda ni se loguea.
    """
    user = db.query(User).filter(
        User.email == payload.email, User.is_active == True  # noqa: E712
    ).first()

    if user:
        now = datetime.utcnow()
        cooldown_cutoff = now - timedelta(seconds=RESET_TOKEN_COOLDOWN_SECONDS)
        recent_token = db.query(PasswordResetToken).filter(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.expires_at > now,
            PasswordResetToken.created_at > cooldown_cutoff,
        ).first()

        if not recent_token:
            raw_token = secrets.token_urlsafe(32)
            token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
            reset_token = PasswordResetToken(
                user_id=user.id,
                token_hash=token_hash,
                created_at=now,
                expires_at=now + timedelta(minutes=RESET_TOKEN_TTL_MINUTES),
            )
            db.add(reset_token)
            db.commit()

            frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:5100").rstrip("/")
            reset_link = f"{frontend_url}/reset-password?token={raw_token}"
            html_body = (
                "<p>Recibimos una solicitud para restablecer tu contraseña en Nebulae ERP.</p>"
                f'<p><a href="{reset_link}">Haz clic aquí para crear una nueva contraseña</a></p>'
                f"<p>Este enlace expira en {RESET_TOKEN_TTL_MINUTES} minutos. "
                "Si no solicitaste este cambio, puedes ignorar este correo.</p>"
            )
            # send_email nunca lanza excepción y puede devolver False (p.ej. SMTP sin
            # configurar); el resultado se ignora a propósito para no filtrar por
            # temporización ni por respuesta si el correo existe o no.
            send_email(user.email, "Restablece tu contraseña - Nebulae ERP", html_body)

    return {"message": GENERIC_FORGOT_PASSWORD_MESSAGE}

@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    token_hash = hashlib.sha256(payload.token.encode()).hexdigest()
    reset_token = db.query(PasswordResetToken).filter(
        PasswordResetToken.token_hash == token_hash
    ).first()

    if (
        not reset_token
        or reset_token.used_at is not None
        or reset_token.expires_at < datetime.utcnow()
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=GENERIC_RESET_PASSWORD_ERROR)

    if len(payload.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La nueva contraseña debe tener al menos 8 caracteres"
        )

    user = db.query(User).filter(User.id == reset_token.user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=GENERIC_RESET_PASSWORD_ERROR)

    user.password_hash = get_password_hash(payload.new_password)
    reset_token.used_at = datetime.utcnow()
    db.commit()
    return {"status": "success", "message": "Contraseña actualizada correctamente"}

@router.patch("/username")
def update_username(
    payload: UsernameUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    username = payload.username.strip()
    if not USERNAME_PATTERN.match(username):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El nombre de usuario debe tener 3-32 caracteres: letras, números o guion bajo, sin espacios",
        )

    existing = db.query(User).filter(
        User.username == username, User.id != current_user.id
    ).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ese nombre de usuario ya está en uso")
    # Revision final del B3 (F1, M35): un username que coincide (NFKC y casefold, clave_publica) con el nombre para
    # mostrar de OTRO usuario lo apagaria: nombre_para_mostrar_vigente lo revalida al leer y, desde ese momento, sus
    # paginas publicas, su PDF y sus mensajes dirian «Tu asesor» sin ningun aviso.
    from app.core.nombre_para_mostrar import clave_publica
    clave = clave_publica(username)
    nombres = db.query(User.nombre_para_mostrar).filter(User.nombre_para_mostrar.isnot(None),
                                                         User.id != current_user.id).all()
    if any(clave_publica(nombre) == clave for (nombre,) in nombres):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Ese nombre ya lo usa otra persona como nombre para mostrar.")

    current_user.username = username
    db.commit()
    db.refresh(current_user)
    return {"status": "success", "data": UserResponse.model_validate(current_user).model_dump()}

@router.get("/users")
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    users = db.query(User).order_by(User.id.asc()).all()
    return {"status": "success", "data": [UserResponse.model_validate(u).model_dump() for u in users]}

@router.patch("/users/{user_id}/role")
def update_user_role(
    user_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*ROLE_ADMIN)),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    new_role = payload.get("role")
    if not new_role:
        raise HTTPException(status_code=400, detail="Rol requerido")
    if user.id == 1 and normalize_role(new_role) != "ADMIN":
        raise HTTPException(status_code=400, detail="No se puede retirar el rol de Administrador de la cuenta principal del sistema")
    user.role = new_role
    db.commit()
    db.refresh(user)
    return {"status": "success", "data": UserResponse.model_validate(user).model_dump()}

@router.patch("/users/{user_id}/nombre-para-mostrar")
def update_nombre_para_mostrar(
    user_id: int,
    payload: NombreParaMostrarUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*ROLE_ADMIN)),
):
    """B3 T20b: como vera el cliente a este asesor en los documentos (documento_cliente.asesor_publico). Solo ADMIN: lo
    llena la Administracion. La regla es validar_nombre_para_mostrar (null o vacio lo borra); si falla, 400 con su
    texto y no se escribe nada."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    try:
        nombre = validar_nombre_para_mostrar(payload.nombre_para_mostrar, lambda clave: es_de_un_usuario(db, clave))
    except NombreParaMostrarInvalido as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=exc.mensaje)
    user.nombre_para_mostrar = nombre
    db.commit()
    db.refresh(user)
    return {"status": "success", "data": UserResponse.model_validate(user).model_dump()}

