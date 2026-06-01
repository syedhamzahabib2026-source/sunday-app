from datetime import datetime
from pydantic import BaseModel


class UserLocationCreate(BaseModel):
    name: str
    commute_minutes: int


class UserLocationResponse(BaseModel):
    id: int
    user_id: int
    name: str
    commute_minutes: int
    created_at: datetime

    model_config = {"from_attributes": True}
