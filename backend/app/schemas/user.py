from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class UserCreate(BaseModel):
    name: str
    email: str
    timezone: str = "America/Chicago"


class UserUpdate(BaseModel):
    name: Optional[str] = None
    timezone: Optional[str] = None


class UserResponse(BaseModel):
    id: int
    name: str
    email: str
    timezone: str
    avatar_url: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}
