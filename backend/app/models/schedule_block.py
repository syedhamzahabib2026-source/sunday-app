from datetime import datetime, date
from sqlalchemy import Column, Integer, String, Boolean, Date, DateTime, ForeignKey
from app.database import Base


class ScheduleBlock(Base):
    __tablename__ = "schedule_blocks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True)

    # Allowed: task / sleep / meal / commute / gym / muay_thai / routine / buffer
    block_type = Column(String, nullable=False)

    title = Column(String, nullable=False)
    start_time = Column(String, nullable=False)  # "HH:MM"
    end_time = Column(String, nullable=False)    # "HH:MM"
    date = Column(Date, nullable=False)
    is_locked = Column(Boolean, nullable=False, default=False)
    priority = Column(String, nullable=True)
    status = Column(String, nullable=True)          # complete / missed / skipped / None
    is_rescheduled = Column(Boolean, nullable=False, default=False)
    google_event_id = Column(String, nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
