"""Standalone entry point for the Sunday Slack bot (Socket Mode)."""
import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env before any app imports so env vars are available at module level
load_dotenv(Path(__file__).resolve().parent / ".env")

from app.database import init_db, SessionLocal  # noqa: E402
from app.models.user import User               # noqa: E402
from app.slack import handler                  # noqa: E402


def ensure_test_user() -> None:
    init_db()
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == "test@sunday.app").first()
        if not user:
            user = User(name="Test User", email="test@sunday.app", timezone="America/Chicago")
            db.add(user)
            db.commit()
            db.refresh(user)
            print(f"Created test user — id={user.id}, email={user.email}")
        else:
            print(f"Test user already exists — id={user.id}, email={user.email}")
    finally:
        db.close()


if __name__ == "__main__":
    ensure_test_user()
    print("Sunday bot is running...")
    handler.start()
