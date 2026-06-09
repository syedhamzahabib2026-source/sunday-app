"""
One-time script: delete the accidental test user created during API audit.
Run via: railway run python cleanup_test_user.py
"""
import os
from app.database import SessionLocal
from app.models.user import User

db = SessionLocal()
try:
    user = db.query(User).filter(User.id == 2, User.email == "trailingslash@example.com").first()
    if user:
        db.delete(user)
        db.commit()
        print(f"Deleted test user: id={user.id}, email={user.email}")
    else:
        print("Test user not found (already deleted or id/email mismatch — safe to ignore).")
finally:
    db.close()
