from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel

CompletionStatus = Literal["complete", "partial", "missed", "cancelled"]


class CompletionCreate(BaseModel):
    schedule_block_id: int
    task_id: Optional[int] = None
    status: CompletionStatus
    completed_at: Optional[datetime] = None
    notes: Optional[str] = None


class CompletionResponse(BaseModel):
    id: int
    user_id: int
    schedule_block_id: int
    task_id: Optional[int]
    status: str
    completed_at: Optional[datetime]
    notes: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}
