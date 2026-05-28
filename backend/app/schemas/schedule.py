from datetime import datetime, date
from typing import Optional
from pydantic import BaseModel


class ScheduleResponse(BaseModel):
    id: int
    user_id: int
    week_start_date: date
    status: str
    week_label: Optional[str]
    archived_at: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}
