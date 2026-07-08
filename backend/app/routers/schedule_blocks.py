from datetime import date
from typing import Any, Dict, List, Literal, Optional
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user, get_db
from app.models.schedule_block import ScheduleBlock
from app.models.user import User
from app.schemas.schedule_block import ScheduleBlockCreate, ScheduleBlockResponse
from app.schemas.task import TaskResponse

router = APIRouter(prefix="/schedule", tags=["schedule_blocks"])


@router.post("/", response_model=ScheduleBlockResponse, status_code=201)
def create_block(
    payload: ScheduleBlockCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    block = ScheduleBlock(**payload.model_dump(), user_id=current_user.id)
    db.add(block)
    db.commit()
    db.refresh(block)
    return block


@router.get("/week/{week_start}", response_model=List[ScheduleBlockResponse])
def get_week_schedule(
    week_start: date,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from datetime import timedelta
    week_end = week_start + timedelta(days=6)
    return (
        db.query(ScheduleBlock)
        .filter(
            ScheduleBlock.user_id == current_user.id,
            ScheduleBlock.date >= week_start,
            ScheduleBlock.date <= week_end,
        )
        .order_by(ScheduleBlock.date, ScheduleBlock.start_time)
        .all()
    )


@router.get("/day/{day}", response_model=List[ScheduleBlockResponse])
def get_day_schedule(
    day: date,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(ScheduleBlock)
        .filter(ScheduleBlock.user_id == current_user.id, ScheduleBlock.date == day)
        .order_by(ScheduleBlock.start_time)
        .all()
    )


@router.delete("/block/{block_id}", status_code=204)
def delete_block(
    block_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    block = db.query(ScheduleBlock).filter(
        ScheduleBlock.id == block_id,
        ScheduleBlock.user_id == current_user.id,
    ).first()
    if not block:
        raise HTTPException(status_code=404, detail="Schedule block not found")
    db.delete(block)
    db.commit()


@router.patch("/{block_id}/lock", response_model=ScheduleBlockResponse)
def lock_block(
    block_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    block = db.query(ScheduleBlock).filter(
        ScheduleBlock.id == block_id,
        ScheduleBlock.user_id == current_user.id,
    ).first()
    if not block:
        raise HTTPException(status_code=404, detail="Schedule block not found")
    block.is_locked = True
    db.commit()
    db.refresh(block)
    return block


class BlockStatusUpdate(BaseModel):
    status: Literal["scheduled", "complete", "missed", "skipped", "cancelled"]


@router.patch("/block/{block_id}/status", response_model=ScheduleBlockResponse)
def update_block_status(
    block_id: int,
    payload: BlockStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    block = db.query(ScheduleBlock).filter(
        ScheduleBlock.id == block_id,
        ScheduleBlock.user_id == current_user.id,
    ).first()
    if not block:
        raise HTTPException(status_code=404, detail="Schedule block not found")
    block.status = payload.status
    db.commit()
    db.refresh(block)
    return block


# ── Schedule generation ───────────────────────────────────────────────────────

class GenerateScheduleRequest(BaseModel):
    week_start_date: str            # "YYYY-MM-DD"
    generation_timestamp: Optional[str] = None
    week_target: str = "current"    # "current" | "next"


@router.post("/generate")
def generate_schedule(
    payload: GenerateScheduleRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    from datetime import timedelta
    from app.engines.scheduler import generate_weekly_schedule

    try:
        week_start = date.fromisoformat(payload.week_start_date)
    except ValueError:
        raise HTTPException(status_code=422, detail="week_start_date must be YYYY-MM-DD")

    # Collect existing GCal event IDs before wiping blocks so we can clean them up
    week_end = week_start + timedelta(days=6)
    old_event_ids: List[str] = [
        row.google_event_id
        for row in db.query(ScheduleBlock.google_event_id).filter(
            ScheduleBlock.user_id == current_user.id,
            ScheduleBlock.date >= week_start,
            ScheduleBlock.date <= week_end,
            ScheduleBlock.google_event_id.isnot(None),
        ).all()
        if row.google_event_id
    ]

    generation_ts = None if payload.week_target == "next" else payload.generation_timestamp

    result = generate_weekly_schedule(
        current_user.id, week_start, db,
        generation_timestamp=generation_ts,
    )

    # Delete old GCal events then push new blocks (both non-blocking)
    if current_user.google_access_token:
        from app.services.google_calendar import push_blocks_to_calendar, delete_calendar_events
        if old_event_ids:
            background_tasks.add_task(delete_calendar_events, current_user.id, old_event_ids)
        block_ids = [b.id for b in result["blocks"]]
        background_tasks.add_task(push_blocks_to_calendar, current_user.id, block_ids)

    return {
        "week_start":          str(result["week_start"]),
        "block_count":         len(result["blocks"]),
        "is_overloaded":       result["is_overloaded"],
        "unscheduled_tasks": [
            TaskResponse.model_validate(t).model_dump() for t in result["unscheduled_tasks"]
        ],
        "dropped_items":       result.get("dropped_items", []),
        "unscheduled_summary": result.get("unscheduled_summary", {}),
        "blocks_by_day":       _group_by_day(result["blocks"]),
    }


# ── Schedule reorganization ───────────────────────────────────────────────────

class ReorganizeRequest(BaseModel):
    reason: str = "manual"
    missed_block_id: Optional[int] = None


@router.post("/reorganize")
def reorganize_schedule(
    payload: ReorganizeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    if payload.missed_block_id is not None:
        from app.engines.scheduler import reorganize_missed_task
        try:
            return reorganize_missed_task(current_user.id, payload.missed_block_id, db)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Reschedule failed: {e}")

    from app.engines.reorganizer import reorganize_schedule as _reorg

    result = _reorg(current_user.id, db, payload.reason)

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
