from datetime import datetime
from pydantic import BaseModel, EmailStr


class UserCreate(BaseModel):
    name: str
    email: str
    timezone: str = "America/Chicago"


class UserResponse(BaseModel):
    id: int
    name: str
    email: str
    timezone: str
    created_at: datetime

    model_config = {"from_attributes": True}
