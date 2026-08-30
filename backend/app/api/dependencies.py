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
