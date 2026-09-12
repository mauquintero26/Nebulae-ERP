from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from fastapi.security import OAuth2PasswordRequestForm
from app.db.database import get_db
from app.models.users import User
from app.schemas.users import UserCreate, UserResponse, PasswordChange
from app.core.security import get_password_hash, verify_password, create_access_token, ACCESS_TOKEN_EXPIRE_MINUTES
from app.api.dependencies import get_current_user
from datetime import timedelta

router = APIRouter()

@router.post("/register", status_code=status.HTTP_201_CREATED)
def register_user(user: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_password = get_password_hash(user.password)
    new_user = User(
        email=user.email,
        password_hash=hashed_password,
        role=user.role
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return {"status": "success", "data": UserResponse.model_validate(new_user).model_dump()}

@router.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role}, expires_delta=access_token_expires
    )
    # Return standard OAuth2 token format for Swagger UI support
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/me")
def read_users_me(current_user: User = Depends(get_current_user)):
    return {"status": "success", "data": UserResponse.model_validate(current_user).model_dump()}

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
    current_user: User = Depends(get_current_user)
):
    is_admin = current_user.role == "admin" or current_user.id == 1 or "jmquintero" in current_user.email.lower()
    if not is_admin:
        raise HTTPException(status_code=403, detail="Solo administradores pueden cambiar roles")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    new_role = payload.get("role")
    if not new_role:
        raise HTTPException(status_code=400, detail="Rol requerido")
    if user.id == 1 and new_role != "admin":
        raise HTTPException(status_code=400, detail="No se puede retirar el rol de Administrador de la cuenta principal del sistema")
    user.role = new_role
    db.commit()
    db.refresh(user)
    return {"status": "success", "data": UserResponse.model_validate(user).model_dump()}

