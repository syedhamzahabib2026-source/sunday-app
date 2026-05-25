from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from app.database import Base


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String, nullable=False)
    duration_minutes = Column(Integer, nullable=False)
    deadline = Column(DateTime, nullable=True)

    # Allowed: critical / high / medium / low / optional
    priority = Column(String, nullable=False)

    location = Column(String, nullable=True)

    # Allowed: high / medium / low
    energy_level = Column(String, nullable=False)

    is_flexible = Column(Boolean, nullable=False, default=True)

    # Allowed: pending / scheduled / complete / partial / missed / cancelled
    status = Column(String, nullable=False, default="pending")

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
