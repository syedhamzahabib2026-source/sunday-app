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

    timing_preference = Column(String, nullable=True, default="ai_decide")
    preferred_days = Column(String, nullable=True)  # JSON-encoded list

    # Fixed-time task fields (is_flexible=False means the scheduler pins to exact time)
    fixed_start_time = Column(String, nullable=True)   # "HH:MM" 24h
    fixed_end_time   = Column(String, nullable=True)   # "HH:MM" 24h

    # Per-task travel time (one-way minutes); scheduler wraps task with commute blocks
    commute_minutes = Column(Integer, nullable=True, default=0)

    # Set at creation, never changed by bumping
    original_priority = Column(String, nullable=True)
    # task title that displaced this task (cascade tracking)
    bumped_from = Column(String, nullable=True)

    # Recurring tasks carry over automatically each week
    is_recurring = Column(Boolean, nullable=False, default=False)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
