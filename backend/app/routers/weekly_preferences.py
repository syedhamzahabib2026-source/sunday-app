import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.weekly_preferences import WeeklyPreferences
from app.schemas.weekly_preferences import (
    WeeklyPreferencesCreate,
    WeeklyPreferencesUpdate,
    WeeklyPreferencesResponse,
)

router = APIRouter(prefix="/preferences", tags=["weekly_preferences"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/", response_model=WeeklyPreferencesResponse, status_code=201)
def create_preferences(payload: WeeklyPreferencesCreate, db: Session = Depends(get_db)):
    data = payload.model_dump()
    data["meal_prep_days"] = json.dumps(data["meal_prep_days"])
    data["fixed_commitments"] = json.dumps(data["fixed_commitments"])
    prefs = WeeklyPreferences(**data)
    db.add(prefs)
    db.commit()
    db.refresh(prefs)
    return prefs


@router.get("/{user_id}/current", response_model=WeeklyPreferencesResponse)
def get_current_preferences(user_id: int, db: Session = Depends(get_db)):
    prefs = (
        db.query(WeeklyPreferences)
        .filter(WeeklyPreferences.user_id == user_id)
        .order_by(WeeklyPreferences.week_start_date.desc())
        .first()
    )
    if not prefs:
        raise HTTPException(status_code=404, detail="No preferences found for user")
    return prefs


@router.put("/{pref_id}", response_model=WeeklyPreferencesResponse)
def update_preferences(pref_id: int, payload: WeeklyPreferencesUpdate, db: Session = Depends(get_db)):
    prefs = db.query(WeeklyPreferences).filter(WeeklyPreferences.id == pref_id).first()
    if not prefs:
        raise HTTPException(status_code=404, detail="Preferences not found")

    updates = payload.model_dump(exclude_none=True)
    if "meal_prep_days" in updates:
        updates["meal_prep_days"] = json.dumps(updates["meal_prep_days"])
    if "fixed_commitments" in updates:
        updates["fixed_commitments"] = json.dumps(updates["fixed_commitments"])

    for field, value in updates.items():
        setattr(prefs, field, value)

    db.commit()
    db.refresh(prefs)
    return prefs
