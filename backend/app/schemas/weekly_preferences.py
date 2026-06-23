import json
from datetime import datetime, date
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, field_validator

# Each fixed commitment is stored as a dict. Both old wire format
# ({"name":..,"time":..,"duration":..,"days":..}) and new format
# ({"title":..,"start_time":..,"end_time":..,"days":..,"date":..,"recurring":..})
# are accepted on write and normalised on read.
FixedCommitmentDict = Dict[str, Any]


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
    fixed_commitments: List[FixedCommitmentDict] = []
    notes: Optional[str] = None
    mode: str = "manual"
    extra_context: Optional[str] = None
    scheduling_notes: Optional[str] = None
    meal_breakfast_time: Optional[str] = None
    meal_lunch_time:     Optional[str] = None
    meal_dinner_time:    Optional[str] = None
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
    fixed_commitments: Optional[List[FixedCommitmentDict]] = None
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
    fixed_commitments: List[FixedCommitmentDict]
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

    @field_validator("meal_prep_days", mode="before")
    @classmethod
    def parse_meal_prep_days(cls, v):
        if isinstance(v, str):
            return json.loads(v)
        return v if v is not None else []

    @field_validator("fixed_commitments", mode="before")
    @classmethod
    def parse_fixed_commitments(cls, v):
        """Accept both old (array of JSON strings) and new (array of dicts) formats."""
        if isinstance(v, str):
            try:
                items = json.loads(v)
            except Exception:
                return []
        elif v is not None:
            items = v
        else:
            return []
        result = []
        for item in items:
            if isinstance(item, str):
                try:
                    result.append(json.loads(item))
                except Exception:
                    pass
            elif isinstance(item, dict):
                result.append(item)
        return result

    model_config = {"from_attributes": True}
