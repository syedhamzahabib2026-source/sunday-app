from datetime import date, timedelta
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user, get_db
from app.models.completion import CompletionRecord
from app.models.schedule_block import ScheduleBlock
from app.models.user import User
from app.schemas.completion import CompletionCreate, CompletionResponse

router = APIRouter(prefix="/completions", tags=["completions"])


@router.post("/", response_model=CompletionResponse, status_code=201)
def create_completion(
    payload: CompletionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    record = CompletionRecord(**payload.model_dump(), user_id=current_user.id)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.get("/", response_model=List[CompletionResponse])
def list_completions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(CompletionRecord)
        .filter(CompletionRecord.user_id == current_user.id)
        .order_by(CompletionRecord.created_at.desc())
        .all()
    )


@router.get("/week/{week_start}", response_model=List[CompletionResponse])
def list_completions_for_week(
    week_start: date,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    week_end = week_start + timedelta(days=6)
    block_ids = (
        db.query(ScheduleBlock.id)
        .filter(
            ScheduleBlock.user_id == current_user.id,
            ScheduleBlock.date >= week_start,
            ScheduleBlock.date <= week_end,
        )
        .subquery()
    )
    return (
        db.query(CompletionRecord)
        .filter(
            CompletionRecord.user_id == current_user.id,
            CompletionRecord.schedule_block_id.in_(block_ids),
        )
        .order_by(CompletionRecord.created_at.desc())
        .all()
    )
