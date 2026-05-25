from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from app.database import Base


class ReorganizationLog(Base):
    __tablename__ = "reorganization_logs"

    id                = Column(Integer, primary_key=True, index=True)
    user_id           = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    triggered_at      = Column(DateTime, nullable=False, default=datetime.utcnow)
    reason            = Column(String, nullable=False)
    blocks_cleared    = Column(Integer, nullable=False, default=0)
    blocks_created    = Column(Integer, nullable=False, default=0)
    tasks_rescheduled = Column(Integer, nullable=False, default=0)
    tasks_dropped     = Column(Integer, nullable=False, default=0)
