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


# --- ERP Role constants ---
# User.role acepta valores legacy ("Admin","Vendedor","ERP","Finanzas") y nuevos ("ADMIN","ASESOR","COMPRAS","BODEGA","FINANZAS","CONSULTA")
ROLE_ADMIN    = ("Admin", "ADMIN")
ROLE_ASESOR   = ("Vendedor", "ASESOR")
ROLE_COMPRAS  = ("ERP", "COMPRAS")
ROLE_BODEGA   = ("BODEGA",)
ROLE_FINANZAS = ("Finanzas", "FINANZAS")
ROLE_CONSULTA = ("CONSULTA",)
ALL_ERP_ROLES = ROLE_ADMIN + ROLE_ASESOR + ROLE_COMPRAS + ROLE_BODEGA + ROLE_FINANZAS + ROLE_CONSULTA


def require_roles(*allowed_roles: str):
    """
    FastAPI dependency factory: verifica que el usuario autenticado tenga uno de los roles permitidos.

    Uso:
        @router.post("/endpoint")
        def endpoint(user = Depends(require_roles("Admin", "BODEGA"))):
            ...
    """
    def _check_role(current_user: User = Depends(get_current_user)):
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Rol '{current_user.role}' no autorizado. "
                    f"Requerido: {', '.join(allowed_roles)}"
                ),
            )
        return current_user
    return _check_role