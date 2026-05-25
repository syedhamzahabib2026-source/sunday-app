from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False, index=True)
    timezone = Column(String, nullable=False, default="America/Chicago")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
