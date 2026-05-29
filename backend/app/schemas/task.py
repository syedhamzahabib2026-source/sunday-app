from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel

PriorityType = Literal["critical", "high", "medium", "low", "optional"]
EnergyType = Literal["high", "medium", "low"]
StatusType = Literal["pending", "scheduled", "complete", "partial", "missed", "cancelled"]


class TaskCreate(BaseModel):
    user_id: int
    title: str
    duration_minutes: int
    deadline: Optional[datetime] = None
    priority: PriorityType
    location: Optional[str] = None
    energy_level: EnergyType
    is_flexible: bool = True
    timing_preference: Optional[str] = "ai_decide"
    preferred_days: Optional[str] = None  # JSON-encoded list
    fixed_start_time: Optional[str] = None   # "HH:MM" 24h — only for fixed tasks
    fixed_end_time:   Optional[str] = None   # "HH:MM" 24h
    commute_minutes:  Optional[int] = 0      # one-way travel time in minutes


class TaskStatusUpdate(BaseModel):
    status: StatusType


class TaskResponse(BaseModel):
    id: int
    user_id: int
    title: str
    duration_minutes: int
    deadline: Optional[datetime]
    priority: str
    location: Optional[str]
    energy_level: str
    is_flexible: bool
    status: str
    timing_preference: Optional[str]
    preferred_days: Optional[str]
    fixed_start_time: Optional[str]
    fixed_end_time:   Optional[str]
    commute_minutes:  Optional[int]
    original_priority: Optional[str]
    bumped_from: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
