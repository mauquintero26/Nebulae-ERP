from sqlalchemy.orm import Session
from app.db.database import SessionLocal, engine, Base
from app.models.users import User
from app.core.security import get_password_hash

def create_test_user():
    # Make sure tables exist
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        test_email = "test@nebulae.com"
        test_password = "password123"
        
        # Check if exists
        user = db.query(User).filter(User.email == test_email).first()
        if not user:
            new_user = User(
                email=test_email,
                password_hash=get_password_hash(test_password),
                role="admin"
            )
            db.add(new_user)
            db.commit()
            print(f"User created: {test_email} / {test_password}")
        else:
            print(f"User already exists: {test_email} / {test_password}")
    finally:
        db.close()

if __name__ == "__main__":
    create_test_user()
