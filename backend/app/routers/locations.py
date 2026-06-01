from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user, get_db
from app.models.user import User
from app.models.user_location import UserLocation
from app.schemas.user_location import UserLocationCreate, UserLocationResponse

router = APIRouter(prefix="/locations", tags=["locations"])


@router.get("/", response_model=List[UserLocationResponse])
def list_locations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return db.query(UserLocation).filter(UserLocation.user_id == current_user.id).all()


@router.post("/", response_model=UserLocationResponse, status_code=201)
def save_location(
    payload: UserLocationCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create or update a location by name (upsert)."""
    existing = (
        db.query(UserLocation)
        .filter(
            UserLocation.user_id == current_user.id,
            UserLocation.name == payload.name,
        )
        .first()
    )
    if existing:
        existing.commute_minutes = payload.commute_minutes
        db.commit()
        db.refresh(existing)
        return existing
    loc = UserLocation(
        user_id=current_user.id,
        name=payload.name,
        commute_minutes=payload.commute_minutes,
    )
    db.add(loc)
    db.commit()
    db.refresh(loc)
    return loc
