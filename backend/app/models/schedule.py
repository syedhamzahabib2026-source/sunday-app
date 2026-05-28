from datetime import datetime
from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey
from app.database import Base


class Schedule(Base):
    __tablename__ = "schedules"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    week_start_date = Column(Date, nullable=False)
    # pending: generated Sunday night, not yet active
    # active: current running schedule
    # archived: past schedule, read-only
    status = Column(String, nullable=False, default="active")
    week_label = Column(String, nullable=True)   # "Week of May 26"
    archived_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
