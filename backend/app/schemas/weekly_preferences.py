import json
from datetime import datetime, date
from typing import List, Optional
from pydantic import BaseModel, field_validator


class WeeklyPreferencesCreate(BaseModel):
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
    gym_duration_mins: int = 75
    muay_thai_days_per_week: int = 2
    muay_thai_duration_mins: int = 90
    workout_time_preference: str = "morning"
    commute_minutes: int = 30
    is_remote: bool = False
    work_days_per_week: int = 5
    work_location_name: Optional[str] = None
    weekly_task_capacity_hours: float = 40.0
    energy_preference: str = "front_load"
    shower_preference: str = "morning"
    meal_duration_mins: int = 20
    fixed_commitments: List[str] = []
    notes: Optional[str] = None
    mode: str = "manual"
    extra_context: Optional[str] = None
    scheduling_notes: Optional[str] = None   # plain-language scheduling preferences for the AI
    meal_breakfast_time: Optional[str] = None  # "HH:MM" preferred breakfast time
    meal_lunch_time:     Optional[str] = None  # "HH:MM" preferred lunch time
    meal_dinner_time:    Optional[str] = None  # "HH:MM" preferred dinner time
    deep_work_enabled: bool = False
    deep_work_session_duration: int = 120


class WeeklyPreferencesUpdate(BaseModel):
    sleep_target_hours: Optional[float] = None
    preferred_bedtime: Optional[str] = None
    preferred_wake_time: Optional[str] = None
    morning_routine_mins: Optional[int] = None
    night_routine_mins: Optional[int] = None
    shower_mins: Optional[int] = None
    shower_preference: Optional[str] = None
    meals_per_day: Optional[int] = None
    meal_duration_mins: Optional[int] = None
    meal_prep_days: Optional[List[str]] = None
    gym_days_per_week: Optional[int] = None
    gym_duration_mins: Optional[int] = None
    muay_thai_days_per_week: Optional[int] = None
    muay_thai_duration_mins: Optional[int] = None
    workout_time_preference: Optional[str] = None
    commute_minutes: Optional[int] = None
    is_remote: Optional[bool] = None
    work_days_per_week: Optional[int] = None
    work_location_name: Optional[str] = None
    weekly_task_capacity_hours: Optional[float] = None
    energy_preference: Optional[str] = None
    fixed_commitments: Optional[List[str]] = None
    notes: Optional[str] = None
    mode: Optional[str] = None
    extra_context: Optional[str] = None
    scheduling_notes: Optional[str] = None
    meal_breakfast_time: Optional[str] = None
    meal_lunch_time:     Optional[str] = None
    meal_dinner_time:    Optional[str] = None
    deep_work_enabled: Optional[bool] = None
    deep_work_session_duration: Optional[int] = None


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
    shower_preference: str
    meals_per_day: int
    meal_duration_mins: int
    meal_prep_days: List[str]
    gym_days_per_week: int
    gym_duration_mins: int
    muay_thai_days_per_week: int
    muay_thai_duration_mins: int
    workout_time_preference: str
    commute_minutes: int
    is_remote: bool
    work_days_per_week: int
    work_location_name: Optional[str]
    weekly_task_capacity_hours: float
    energy_preference: str
    fixed_commitments: List[str]
    notes: Optional[str]
    mode: str
    extra_context: Optional[str]
    scheduling_notes: Optional[str]
    meal_breakfast_time: Optional[str]
    meal_lunch_time:     Optional[str]
    meal_dinner_time:    Optional[str]
    deep_work_enabled: bool
    deep_work_session_duration: int
    created_at: datetime

    @field_validator("meal_prep_days", "fixed_commitments", mode="before")
    @classmethod
    def parse_json_list(cls, v):
        if isinstance(v, str):
            return json.loads(v)
        return v if v is not None else []

    model_config = {"from_attributes": True}
