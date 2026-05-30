from datetime import date
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.schedule_block import ScheduleBlock
from app.schemas.schedule_block import ScheduleBlockCreate, ScheduleBlockResponse
from app.schemas.task import TaskResponse

router = APIRouter(prefix="/schedule", tags=["schedule_blocks"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Existing endpoints ────────────────────────────────────────────────────────

@router.post("/", response_model=ScheduleBlockResponse, status_code=201)
def create_block(payload: ScheduleBlockCreate, db: Session = Depends(get_db)):
    block = ScheduleBlock(**payload.model_dump())
    db.add(block)
    db.commit()
    db.refresh(block)
    return block


@router.get("/{user_id}/week/{week_start}", response_model=List[ScheduleBlockResponse])
def get_week_schedule(user_id: int, week_start: date, db: Session = Depends(get_db)):
    from datetime import timedelta
    week_end = week_start + timedelta(days=6)
    return (
        db.query(ScheduleBlock)
        .filter(
            ScheduleBlock.user_id == user_id,
            ScheduleBlock.date >= week_start,
            ScheduleBlock.date <= week_end,
        )
        .order_by(ScheduleBlock.date, ScheduleBlock.start_time)
        .all()
    )


@router.get("/{user_id}/day/{day}", response_model=List[ScheduleBlockResponse])
def get_day_schedule(user_id: int, day: date, db: Session = Depends(get_db)):
    return (
        db.query(ScheduleBlock)
        .filter(ScheduleBlock.user_id == user_id, ScheduleBlock.date == day)
        .order_by(ScheduleBlock.start_time)
        .all()
    )


@router.delete("/block/{block_id}", status_code=204)
def delete_block(block_id: int, db: Session = Depends(get_db)):
    block = db.query(ScheduleBlock).filter(ScheduleBlock.id == block_id).first()
    if not block:
        raise HTTPException(status_code=404, detail="Schedule block not found")
    db.delete(block)
    db.commit()


@router.patch("/{block_id}/lock", response_model=ScheduleBlockResponse)
def lock_block(block_id: int, db: Session = Depends(get_db)):
    block = db.query(ScheduleBlock).filter(ScheduleBlock.id == block_id).first()
    if not block:
        raise HTTPException(status_code=404, detail="Schedule block not found")
    block.is_locked = True
    db.commit()
    db.refresh(block)
    return block


# ── Schedule generation ───────────────────────────────────────────────────────

class GenerateScheduleRequest(BaseModel):
    user_id: int
    week_start_date: str            # "YYYY-MM-DD"
    generation_timestamp: Optional[str] = None  # ISO 8601 from client


@router.post("/generate")
def generate_schedule(
    payload: GenerateScheduleRequest, db: Session = Depends(get_db)
) -> Dict[str, Any]:
    from app.engines.scheduler import generate_weekly_schedule

    try:
        week_start = date.fromisoformat(payload.week_start_date)
    except ValueError:
        raise HTTPException(status_code=422, detail="week_start_date must be YYYY-MM-DD")

    result = generate_weekly_schedule(
        payload.user_id, week_start, db,
        generation_timestamp=payload.generation_timestamp,
    )

    return {
        "week_start":    str(result["week_start"]),
        "block_count":   len(result["blocks"]),
        "is_overloaded": result["is_overloaded"],
        "unscheduled_tasks": [
            TaskResponse.model_validate(t).model_dump() for t in result["unscheduled_tasks"]
        ],
        "blocks_by_day": _group_by_day(result["blocks"]),
    }


# ── Schedule reorganization ───────────────────────────────────────────────────

class ReorganizeRequest(BaseModel):
    user_id: int
    reason: str = "manual"
    missed_block_id: Optional[int] = None  # set to trigger missed-task rescheduler


@router.post("/reorganize")
def reorganize_schedule(
    payload: ReorganizeRequest, db: Session = Depends(get_db)
) -> Dict[str, Any]:
    # Missed-task fast rescheduler — find next free slot for one task
    if payload.missed_block_id is not None:
        from app.engines.scheduler import reorganize_missed_task
        try:
            return reorganize_missed_task(payload.user_id, payload.missed_block_id, db)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Reschedule failed: {e}")

    from app.engines.reorganizer import reorganize_schedule as _reorg

    result = _reorg(payload.user_id, db, payload.reason)

    def ser_tasks(task_list):
        return [TaskResponse.model_validate(t).model_dump() for t in task_list]

    return {
        "blocks_cleared":        result["blocks_cleared"],
        "blocks_created":        result["blocks_created"],
        "tasks_rescheduled":     ser_tasks(result["tasks_rescheduled"]),
        "tasks_dropped":         ser_tasks(result["tasks_dropped"]),
        "deadline_at_risk":      ser_tasks(result["deadline_at_risk"]),
        "is_overloaded":         result["is_overloaded"],
        "reorganization_log_id": result["reorganization_log_id"],
    }


# ── Shared helper ─────────────────────────────────────────────────────────────

def _group_by_day(blocks: List[ScheduleBlock]) -> Dict[str, List[Dict]]:
    grouped: Dict[str, List[Dict]] = {}
    for b in sorted(blocks, key=lambda x: (x.date, x.start_time)):
        key = str(b.date)
        grouped.setdefault(key, []).append(
            ScheduleBlockResponse.model_validate(b).model_dump()
        )
    return grouped
