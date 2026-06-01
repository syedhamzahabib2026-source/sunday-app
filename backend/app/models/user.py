from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Text
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id         = Column(Integer, primary_key=True, index=True)
    name       = Column(String, nullable=False)
    email      = Column(String, unique=True, nullable=False, index=True)
    timezone   = Column(String, nullable=False, default="America/Chicago")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    # Google OAuth
    google_id            = Column(String, unique=True, nullable=True, index=True)
    avatar_url           = Column(String, nullable=True)
    google_access_token  = Column(Text, nullable=True)
    google_refresh_token = Column(Text, nullable=True)
    google_token_expiry  = Column(DateTime, nullable=True)
