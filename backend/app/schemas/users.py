from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional

class UserBase(BaseModel):
    email: EmailStr
    role: str

class UserCreate(UserBase):
    password: str

class UserResponse(UserBase):
    id: int
    username: Optional[str] = None
    # B3 T20b: como vera el cliente a este asesor en los documentos (None = sin nombre).
    nombre_para_mostrar: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}

class PasswordChange(BaseModel):
    current_password: str
    new_password: str

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

class UsernameUpdate(BaseModel):
    username: str

class NombreParaMostrarUpdate(BaseModel):
    """B3 T20b: PATCH /auth/users/{id}/nombre-para-mostrar. La clave es obligatoria (null o vacio borra el nombre); la
    regla la aplica app.core.nombre_para_mostrar.validar_nombre_para_mostrar."""
    nombre_para_mostrar: Optional[str]
