from datetime import datetime, date
from typing import Literal, Optional
from pydantic import BaseModel

BlockType = Literal["task", "sleep", "meal", "commute", "gym", "muay_thai", "routine", "buffer", "event"]


class ScheduleBlockCreate(BaseModel):
    user_id: int
    task_id: Optional[int] = None
    block_type: BlockType
    title: str
    start_time: str  # "HH:MM"
    end_time: str    # "HH:MM"
    date: date
    is_locked: bool = False
    priority: Optional[str] = None


class ScheduleBlockResponse(BaseModel):
    id: int
    user_id: int
    task_id: Optional[int]
    block_type: str
    title: str
    start_time: str
    end_time: str
    date: date
    is_locked: bool
    priority: Optional[str]
    status: Optional[str] = None
    is_rescheduled: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}
