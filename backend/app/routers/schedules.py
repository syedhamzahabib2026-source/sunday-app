"""
Schedule lifecycle management.
Handles: pending → active → archived transitions, archive browsing,
and the smart event-add flow (with warning mode).
"""
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.schedule import Schedule
from app.models.schedule_block import ScheduleBlock
from app.schemas.schedule import ScheduleResponse
from app.schemas.schedule_block import ScheduleBlockResponse
from app.schemas.task import TaskResponse

router = APIRouter(prefix="/schedules", tags=["schedules"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _week_label(week_start: date) -> str:
    return "Week of " + week_start.strftime("%B %-d") if hasattr(week_start, "strftime") else str(week_start)


def _ensure_schedule_record(user_id: int, week_start: date, db: Session) -> Schedule:
    """Return the Schedule record for this week, creating one if it doesn't exist."""
    rec = (
        db.query(Schedule)
        .filter(Schedule.user_id == user_id, Schedule.week_start_date == week_start)
        .first()
    )
    if not rec:
        rec = Schedule(
            user_id=user_id,
            week_start_date=week_start,
            status="active",
            week_label=_week_label(week_start),
        )
        db.add(rec)
        db.commit()
        db.refresh(rec)
    return rec


def _maybe_run_lifecycle(user_id: int, db: Session):
    """
    On every relevant API call: if today is Monday and there is a pending schedule
    from last Sunday, activate it. If today is Monday midnight-ish, archive last week.
    """
    today = date.today()
    is_monday = today.weekday() == 0

    if not is_monday:
        return

    # Activate any pending schedule for this week
    this_monday = today - timedelta(days=today.weekday())
    (
        db.query(Schedule)
        .filter(
            Schedule.user_id == user_id,
            Schedule.week_start_date == this_monday,
            Schedule.status == "pending",
        )
        .update({"status": "active"}, synchronize_session=False)
    )

    # Archive last week's active schedule
    last_monday = this_monday - timedelta(weeks=1)
    (
        db.query(Schedule)
        .filter(
            Schedule.user_id == user_id,
            Schedule.week_start_date == last_monday,
            Schedule.status == "active",
        )
        .update(
            {"status": "archived", "archived_at": datetime.utcnow()},
            synchronize_session=False,
        )
    )
    db.commit()


# ── List / view archived weeks ────────────────────────────────────────────────

@router.get("/{user_id}/archived", response_model=List[ScheduleResponse])
def list_archived(user_id: int, db: Session = Depends(get_db)):
    _maybe_run_lifecycle(user_id, db)
    return (
        db.query(Schedule)
        .filter(Schedule.user_id == user_id, Schedule.status == "archived")
        .order_by(Schedule.week_start_date.desc())
        .all()
    )


@router.get("/{user_id}/all", response_model=List[ScheduleResponse])
def list_all_schedules(user_id: int, db: Session = Depends(get_db)):
    _maybe_run_lifecycle(user_id, db)
    return (
        db.query(Schedule)
        .filter(Schedule.user_id == user_id)
        .order_by(Schedule.week_start_date.desc())
        .all()
    )


@router.get("/week/{user_id}/{week_start}", response_model=List[ScheduleBlockResponse])
def get_archived_week_blocks(user_id: int, week_start: date, db: Session = Depends(get_db)):
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


# ── Delete archived schedule ──────────────────────────────────────────────────

@router.delete("/{schedule_id}", status_code=204)
def delete_archived_schedule(schedule_id: int, db: Session = Depends(get_db)):
    rec = db.query(Schedule).filter(Schedule.id == schedule_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Schedule not found")
    if rec.status != "archived":
        raise HTTPException(status_code=400, detail="Only archived schedules can be deleted")
    week_end = rec.week_start_date + timedelta(days=6)
    db.query(ScheduleBlock).filter(
        ScheduleBlock.user_id == rec.user_id,
        ScheduleBlock.date >= rec.week_start_date,
        ScheduleBlock.date <= week_end,
    ).delete(synchronize_session=False)
    db.delete(rec)
    db.commit()


# ── Lifecycle transition (Sunday midnight → archive active, activate pending) ─

@router.post("/lifecycle/transition")
def run_lifecycle_transition(user_id: int, db: Session = Depends(get_db)):
    _maybe_run_lifecycle(user_id, db)
    return {"status": "ok", "today": str(date.today())}


# ── Generate schedule with lifecycle status ───────────────────────────────────

class GenerateWithLifecycleRequest(BaseModel):
    user_id: int
    week_start_date: str


@router.post("/generate")
def generate_with_lifecycle(
    payload: GenerateWithLifecycleRequest, db: Session = Depends(get_db)
) -> Dict[str, Any]:
    from app.engines.scheduler import generate_weekly_schedule

    try:
        week_start = date.fromisoformat(payload.week_start_date)
    except ValueError:
        raise HTTPException(status_code=422, detail="week_start_date must be YYYY-MM-DD")

    today = date.today()
    # Sunday = weekday 6. If generated on Sunday for the upcoming week → pending
    is_sunday = today.weekday() == 6
    next_week_start = today - timedelta(days=today.weekday()) + timedelta(weeks=1)
    is_upcoming = week_start >= next_week_start

    new_status = "pending" if (is_sunday and is_upcoming) else "active"

    result = generate_weekly_schedule(payload.user_id, week_start, db)

    # Upsert Schedule record
    rec = (
        db.query(Schedule)
        .filter(
            Schedule.user_id == payload.user_id,
            Schedule.week_start_date == week_start,
        )
        .first()
    )
    if not rec:
        rec = Schedule(
            user_id=payload.user_id,
            week_start_date=week_start,
            status=new_status,
            week_label=_week_label(week_start),
        )
        db.add(rec)
    else:
        rec.status = new_status
    db.commit()

    return {
        "week_start": str(result["week_start"]),
        "block_count": len(result["blocks"]),
        "is_overloaded": result["is_overloaded"],
        "schedule_status": new_status,
        "unscheduled_tasks": [
            TaskResponse.model_validate(t).model_dump()
            for t in result["unscheduled_tasks"]
        ],
    }


# ── Smart event add (with warning mode) ──────────────────────────────────────

class EventRequest(BaseModel):
    user_id: int
    date: str        # "YYYY-MM-DD"
    title: str
    start_time: str  # "HH:MM"
    end_time: str    # "HH:MM"
    dry_run: bool = True


@router.post("/event")
def add_event(payload: EventRequest, db: Session = Depends(get_db)) -> Dict[str, Any]:
    from app.engines.smart_reorganizer import build_event_plan, apply_event_plan
    from app.engines.scheduler import time_to_slot

    try:
        event_date = date.fromisoformat(payload.date)
    except ValueError:
        raise HTTPException(status_code=422, detail="date must be YYYY-MM-DD")

    start_slot = time_to_slot(payload.start_time)
    end_slot = time_to_slot(payload.end_time)
    if end_slot == 0:
        from app.engines.scheduler import SLOTS_PER_DAY
        end_slot = SLOTS_PER_DAY

    plan, displaced_block_ids, displaced_task_ids = build_event_plan(
        payload.user_id, db, event_date, start_slot, end_slot, payload.title
    )

    if payload.dry_run:
        return {
            "has_warnings": plan.has_warnings,
            "warning_message": plan.format_warning_message() if plan.has_warnings else None,
            "warnings": plan.warning_lines,
            "planned_moves": len(plan.moves),
            "planned_drops": [t.title for t in plan.drops],
        }

    # Apply
    result = apply_event_plan(
        payload.user_id, db,
        event_date, start_slot, end_slot, payload.title,
        plan, displaced_block_ids, displaced_task_ids,
    )
    return {
        "has_warnings": plan.has_warnings,
        "summary": plan.format_confirm_message(),
        **result,
    }
