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
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
