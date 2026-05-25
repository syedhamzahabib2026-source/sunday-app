from datetime import date, timedelta
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.completion import CompletionRecord
from app.models.schedule_block import ScheduleBlock
from app.schemas.completion import CompletionCreate, CompletionResponse

router = APIRouter(prefix="/completions", tags=["completions"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/", response_model=CompletionResponse, status_code=201)
def create_completion(payload: CompletionCreate, db: Session = Depends(get_db)):
    record = CompletionRecord(**payload.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.get("/{user_id}", response_model=List[CompletionResponse])
def list_completions(user_id: int, db: Session = Depends(get_db)):
    return (
        db.query(CompletionRecord)
        .filter(CompletionRecord.user_id == user_id)
        .order_by(CompletionRecord.created_at.desc())
        .all()
    )


@router.get("/{user_id}/week/{week_start}", response_model=List[CompletionResponse])
def list_completions_for_week(user_id: int, week_start: date, db: Session = Depends(get_db)):
    week_end = week_start + timedelta(days=6)
    block_ids = (
        db.query(ScheduleBlock.id)
        .filter(
            ScheduleBlock.user_id == user_id,
            ScheduleBlock.date >= week_start,
            ScheduleBlock.date <= week_end,
        )
        .subquery()
    )
    return (
        db.query(CompletionRecord)
        .filter(
            CompletionRecord.user_id == user_id,
            CompletionRecord.schedule_block_id.in_(block_ids),
        )
        .order_by(CompletionRecord.created_at.desc())
        .all()
    )
