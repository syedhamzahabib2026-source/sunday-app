import json
from datetime import datetime, date
from typing import List, Optional
from pydantic import BaseModel, field_validator


class WeeklyPreferencesCreate(BaseModel):
    user_id: int
    week_start_date: date
    sleep_target_hours: float = 8.0
    preferred_bedtime: str = "23:30"
    preferred_wake_time: str = "07:30"
    morning_routine_mins: int = 30
    night_routine_mins: int = 20
    shower_mins: int = 15
    meals_per_day: int = 2
    meal_prep_days: List[str] = []
    gym_days_per_week: int = 3
    muay_thai_days_per_week: int = 2
    commute_minutes: int = 30
    is_remote: bool = False
    fixed_commitments: List[str] = []
    notes: Optional[str] = None


class WeeklyPreferencesUpdate(BaseModel):
    sleep_target_hours: Optional[float] = None
    preferred_bedtime: Optional[str] = None
    preferred_wake_time: Optional[str] = None
    morning_routine_mins: Optional[int] = None
    night_routine_mins: Optional[int] = None
    shower_mins: Optional[int] = None
    meals_per_day: Optional[int] = None
    meal_prep_days: Optional[List[str]] = None
    gym_days_per_week: Optional[int] = None
    muay_thai_days_per_week: Optional[int] = None
    commute_minutes: Optional[int] = None
    is_remote: Optional[bool] = None
    fixed_commitments: Optional[List[str]] = None
    notes: Optional[str] = None


class WeeklyPreferencesResponse(BaseModel):
    id: int
    user_id: int
    week_start_date: date
    sleep_target_hours: float
    preferred_bedtime: str
    preferred_wake_time: str
    morning_routine_mins: int
    night_routine_mins: int
    shower_mins: int
    meals_per_day: int
    meal_prep_days: List[str]
    gym_days_per_week: int
    muay_thai_days_per_week: int
    commute_minutes: int
    is_remote: bool
    fixed_commitments: List[str]
    notes: Optional[str]
    created_at: datetime

    @field_validator("meal_prep_days", "fixed_commitments", mode="before")
    @classmethod
    def parse_json_list(cls, v):
        if isinstance(v, str):
            return json.loads(v)
        return v if v is not None else []

    model_config = {"from_attributes": True}
