from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import jwt
from sqlalchemy.orm import Session
from app.core.security import SECRET_KEY, ALGORITHM
from app.db.database import get_db
from app.models.users import User, RolePermission
from fastapi import Request

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except jwt.PyJWTError:
        raise credentials_exception
    user = db.query(User).filter(User.id == int(user_id)).first()
    if user is None:
        raise credentials_exception
    return user

class RoleChecker:
    def __init__(self, module_name: str, require_write: bool = False):
        self.module_name = module_name
        self.require_write = require_write

    def __call__(self, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
        # Si es Admin supremo, siempre pasa
        if user.role == "Admin":
            return user
            
        permission = db.query(RolePermission).filter(
            RolePermission.role_name == user.role,
            RolePermission.module_name == self.module_name
        ).first()

        if not permission:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No permissions defined for this module")

        if self.require_write and not permission.can_write:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Write access required")
            
        if not self.require_write and not permission.can_read:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Read access required")

        return user


# ─── ERP Role constants (valores canónicos) ───────────────────────────────────
# Todos los require_roles() deben usar estos valores canónicos.
# Los roles legacy en User.role son normalizados automáticamente por normalize_role().
ROLE_ADMIN    = ("ADMIN",)
ROLE_ASESOR   = ("ASESOR",)
ROLE_COMPRAS  = ("COMPRAS",)
ROLE_BODEGA   = ("BODEGA",)
ROLE_FINANZAS = ("FINANZAS",)
ROLE_CONSULTA = ("CONSULTA",)
ALL_ERP_ROLES = ROLE_ADMIN + ROLE_ASESOR + ROLE_COMPRAS + ROLE_BODEGA + ROLE_FINANZAS + ROLE_CONSULTA


# Mapa de roles legacy → canónico (case-insensitive)
# Permite que usuarios existentes con roles como "Admin", "Vendedor", "ERP"
# sigan funcionando sin modificar la base de datos de usuarios.
_ROLE_LEGACY_MAP: dict = {
    "admin":     "ADMIN",
    "vendedor":  "ASESOR",
    "erp":       "COMPRAS",
    "finanzas":  "FINANZAS",
    "mercadeo":  "CONSULTA",   # Mercadeo solo tiene acceso de lectura
    # Canónicos ya correctos (normalización idempotente):
    "admin":     "ADMIN",
    "asesor":    "ASESOR",
    "compras":   "COMPRAS",
    "bodega":    "BODEGA",
    "consulta":  "CONSULTA",
}


def normalize_role(raw_role: str) -> str:
    """
    Convierte un valor de User.role (legacy o canónico) a su forma canónica.

    Ejemplos:
        "Admin"    → "ADMIN"
        "Vendedor" → "ASESOR"
        "ERP"      → "COMPRAS"
        "Finanzas" → "FINANZAS"
        "Mercadeo" → "CONSULTA"
        "BODEGA"   → "BODEGA"    (ya canónico)
        "  admin " → "ADMIN"     (case-insensitive + trim)
    """
    if not raw_role:
        return ""
    return _ROLE_LEGACY_MAP.get(raw_role.lower().strip(), raw_role.upper().strip())


def require_roles(*allowed_roles: str):
    """
    FastAPI dependency factory: verifica que el usuario autenticado tenga uno de
    los roles permitidos, normalizando el valor actual de User.role para aceptar
    tanto roles legacy ("Admin", "Vendedor", "ERP") como canónicos ("ADMIN", "ASESOR").

    allowed_roles debe usar EXCLUSIVAMENTE valores canónicos:
        ADMIN, ASESOR, COMPRAS, BODEGA, FINANZAS, CONSULTA

    Uso:
        @router.post("/recepciones/{id}/confirmar")
        def confirmar(user = Depends(require_roles(*ROLE_ADMIN, *ROLE_BODEGA))):
            ...
    """
    # Validar que los valores pasados son canónicos (evitar errores de programación)
    _valid_canonical = {"ADMIN", "ASESOR", "COMPRAS", "BODEGA", "FINANZAS", "CONSULTA"}
    for r in allowed_roles:
        if r not in _valid_canonical:
            raise ValueError(
                f"require_roles recibió valor no canónico: '{r}'. "
                f"Usa las constantes ROLE_* de dependencies.py"
            )

    def _check_role(current_user: User = Depends(get_current_user)):
        canonical = normalize_role(current_user.role)
        if canonical not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Rol '{current_user.role}' (normalizado: '{canonical}') "
                    f"no autorizado para esta operación. "
                    f"Roles requeridos: {', '.join(sorted(allowed_roles))}"
                ),
            )
        return current_user
    return _check_role