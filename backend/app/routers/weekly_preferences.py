import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user, get_db
from app.models.user import User
from app.models.weekly_preferences import WeeklyPreferences
from app.schemas.weekly_preferences import (
    WeeklyPreferencesCreate,
    WeeklyPreferencesUpdate,
    WeeklyPreferencesResponse,
)

router = APIRouter(prefix="/preferences", tags=["weekly_preferences"])


@router.post("/", response_model=WeeklyPreferencesResponse, status_code=201)
def create_preferences(
    payload: WeeklyPreferencesCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        data = payload.model_dump()
        data["user_id"]           = current_user.id
        data["meal_prep_days"]    = json.dumps(data["meal_prep_days"])
        data["fixed_commitments"] = json.dumps(data["fixed_commitments"])
        prefs = WeeklyPreferences(**data)
        db.add(prefs)
        db.commit()
        db.refresh(prefs)
        return prefs
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to save preferences: {e}")


@router.get("/current", response_model=WeeklyPreferencesResponse)
def get_current_preferences(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        prefs = (
            db.query(WeeklyPreferences)
            .filter(WeeklyPreferences.user_id == current_user.id)
            .order_by(WeeklyPreferences.week_start_date.desc())
            .first()
        )
        if not prefs:
            raise HTTPException(status_code=404, detail="No preferences found for user")
        return prefs
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch preferences: {e}")


@router.get("/latest", response_model=WeeklyPreferencesResponse)
def get_latest_preferences(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        prefs = (
            db.query(WeeklyPreferences)
            .filter(WeeklyPreferences.user_id == current_user.id)
            .order_by(WeeklyPreferences.week_start_date.desc())
            .first()
        )
        if not prefs:
            raise HTTPException(status_code=404, detail="No preferences found for user")
        return prefs
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch preferences: {e}")


@router.put("/{pref_id}", response_model=WeeklyPreferencesResponse)
def update_preferences(
    pref_id: int,
    payload: WeeklyPreferencesUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        prefs = db.query(WeeklyPreferences).filter(
            WeeklyPreferences.id == pref_id,
            WeeklyPreferences.user_id == current_user.id,
        ).first()
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
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update preferences: {e}")
