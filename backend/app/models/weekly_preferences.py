from datetime import datetime, date
from sqlalchemy import Column, Integer, String, Float, Boolean, Date, DateTime, ForeignKey, Text
from app.database import Base


class WeeklyPreferences(Base):
    __tablename__ = "weekly_preferences"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    week_start_date = Column(Date, nullable=False)

    # Sleep
    sleep_target_hours = Column(Float, nullable=False, default=8.0)
    preferred_bedtime = Column(String, nullable=False, default="23:30")
    preferred_wake_time = Column(String, nullable=False, default="07:30")

    # Routines
    morning_routine_mins = Column(Integer, nullable=False, default=30)
    night_routine_mins = Column(Integer, nullable=False, default=20)
    shower_mins = Column(Integer, nullable=False, default=15)

    # Meals
    meals_per_day = Column(Integer, nullable=False, default=2)
    meal_prep_days = Column(Text, nullable=True)  # JSON-encoded list

    # Fitness
    gym_days_per_week = Column(Integer, nullable=False, default=3)
    muay_thai_days_per_week = Column(Integer, nullable=False, default=2)

    # Work / commute
    commute_minutes = Column(Integer, nullable=False, default=30)
    is_remote = Column(Boolean, nullable=False, default=False)

    # Commitments
    fixed_commitments = Column(Text, nullable=True)  # JSON-encoded list
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
