"""
Schedule lifecycle management.
Handles: pending → active → archived transitions, archive browsing,
and the smart event-add flow (with warning mode).
"""
import re
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user, get_db
from app.models.schedule import Schedule
from app.models.schedule_block import ScheduleBlock
from app.models.user import User
from app.schemas.schedule import ScheduleResponse
from app.schemas.schedule_block import ScheduleBlockResponse
from app.schemas.task import TaskResponse

router = APIRouter(prefix="/schedules", tags=["schedules"])


def _week_label(week_start: date) -> str:
    return "Week of " + week_start.strftime("%B %-d") if hasattr(week_start, "strftime") else str(week_start)


def _ensure_schedule_record(user_id: int, week_start: date, db: Session) -> Schedule:
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
    today = date.today()
    if today.weekday() != 0:
        return

    this_monday = today - timedelta(days=today.weekday())
    db.query(Schedule).filter(
        Schedule.user_id == user_id,
        Schedule.week_start_date == this_monday,
        Schedule.status == "pending",
    ).update({"status": "active"}, synchronize_session=False)

    last_monday = this_monday - timedelta(weeks=1)
    db.query(Schedule).filter(
        Schedule.user_id == user_id,
        Schedule.week_start_date == last_monday,
        Schedule.status == "active",
    ).update(
        {"status": "archived", "archived_at": datetime.utcnow()},
        synchronize_session=False,
    )
    db.commit()


# ── List / view archived weeks ────────────────────────────────────────────────

@router.get("/archived", response_model=List[ScheduleResponse])
def list_archived(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _maybe_run_lifecycle(current_user.id, db)
    return (
        db.query(Schedule)
        .filter(Schedule.user_id == current_user.id, Schedule.status == "archived")
        .order_by(Schedule.week_start_date.desc())
        .all()
    )


@router.get("/all", response_model=List[ScheduleResponse])
def list_all_schedules(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _maybe_run_lifecycle(current_user.id, db)
    return (
        db.query(Schedule)
        .filter(Schedule.user_id == current_user.id)
        .order_by(Schedule.week_start_date.desc())
        .all()
    )


@router.get("/week/{week_start}", response_model=List[ScheduleBlockResponse])
def get_archived_week_blocks(
    week_start: date,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    schedule = db.query(Schedule).filter(
        Schedule.user_id == current_user.id,
        Schedule.week_start_date == week_start,
    ).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
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


@router.delete("/{schedule_id}", status_code=204)
def delete_archived_schedule(
    schedule_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rec = db.query(Schedule).filter(
        Schedule.id == schedule_id,
        Schedule.user_id == current_user.id,
    ).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Schedule not found")
    if rec.status != "archived":
        raise HTTPException(status_code=400, detail="Only archived schedules can be deleted")
    week_end = rec.week_start_date + timedelta(days=6)
    db.query(ScheduleBlock).filter(
        ScheduleBlock.user_id == current_user.id,
        ScheduleBlock.date >= rec.week_start_date,
        ScheduleBlock.date <= week_end,
    ).delete(synchronize_session=False)
    db.delete(rec)
    db.commit()


@router.post("/lifecycle/transition")
def run_lifecycle_transition(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _maybe_run_lifecycle(current_user.id, db)
    return {"status": "ok", "today": str(date.today())}


# ── Generate schedule with lifecycle status ───────────────────────────────────

class GenerateWithLifecycleRequest(BaseModel):
    week_start_date: str


@router.post("/generate")
def generate_with_lifecycle(
    payload: GenerateWithLifecycleRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    from app.engines.scheduler import generate_weekly_schedule

    try:
        week_start = date.fromisoformat(payload.week_start_date)
    except ValueError:
        raise HTTPException(status_code=422, detail="week_start_date must be YYYY-MM-DD")

    if week_start.weekday() != 0:
        raise HTTPException(status_code=422, detail="week_start_date must be a Monday")

    today = date.today()
    is_sunday    = today.weekday() == 6
    next_monday  = today - timedelta(days=today.weekday()) + timedelta(weeks=1)
    is_upcoming  = week_start >= next_monday
    new_status   = "pending" if (is_sunday and is_upcoming) else "active"

    # Collect existing GCal event IDs before generation so we can clean them up
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

    result = generate_weekly_schedule(current_user.id, week_start, db)

    rec = (
        db.query(Schedule)
        .filter(Schedule.user_id == current_user.id, Schedule.week_start_date == week_start)
        .first()
    )
    if not rec:
        rec = Schedule(
            user_id=current_user.id,
            week_start_date=week_start,
            status=new_status,
            week_label=_week_label(week_start),
        )
        db.add(rec)
    else:
        rec.status = new_status
    db.commit()

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
        "schedule_status":     new_status,
        "unscheduled_tasks": [
            TaskResponse.model_validate(t).model_dump()
            for t in result["unscheduled_tasks"]
        ],
        "dropped_items":       result.get("dropped_items", []),
        "unscheduled_summary": result.get("unscheduled_summary", {}),
    }


# ── Smart event add ───────────────────────────────────────────────────────────

class EventRequest(BaseModel):
    date: str
    title: str
    start_time: str
    end_time: str
    dry_run: bool = True
    # One-way travel minutes. None = auto-resolve from saved locations by name.
    commute_minutes: Optional[int] = None


def _resolve_commute_from_locations(user_id: int, title: str, db: Session) -> int:
    """Match the event title against saved locations (e.g. 'Panera shift' → Panera)."""
    from app.models.user_location import UserLocation
    locations = db.query(UserLocation).filter(UserLocation.user_id == user_id).all()
    title_lower = title.lower()
    best = 0
    for loc in locations:
        name = (loc.name or "").lower().strip()
        if name and (name in title_lower or title_lower in name):
            best = max(best, loc.commute_minutes or 0)
    return best


@router.post("/event")
def add_event(
    payload: EventRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    from app.engines.smart_reorganizer import build_event_plan, apply_event_plan
    from app.engines.scheduler import time_to_slot, slots_needed

    try:
        event_date = date.fromisoformat(payload.date)
    except ValueError:
        raise HTTPException(status_code=422, detail="date must be YYYY-MM-DD")

    _time_re = re.compile(r"^\d{2}:\d{2}$")
    if not _time_re.match(payload.start_time):
        raise HTTPException(status_code=422, detail="start_time must be HH:MM")
    if not _time_re.match(payload.end_time):
        raise HTTPException(status_code=422, detail="end_time must be HH:MM")

    start_slot = time_to_slot(payload.start_time)
    end_slot   = time_to_slot(payload.end_time)
    if end_slot == 0:
        from app.engines.scheduler import SLOTS_PER_DAY
        end_slot = SLOTS_PER_DAY

    commute_mins = payload.commute_minutes
    if commute_mins is None:
        commute_mins = _resolve_commute_from_locations(current_user.id, payload.title, db)
    commute_slots = slots_needed(commute_mins) if commute_mins and commute_mins > 0 else 0

    plan, displaced_block_ids, displaced_task_ids = build_event_plan(
        current_user.id, db, event_date, start_slot, end_slot, payload.title,
        commute_slots=commute_slots,
    )

    if payload.dry_run:
        return {
            "has_warnings":    plan.has_warnings,
            "warning_message": plan.format_warning_message() if plan.has_warnings else None,
            "warnings":        plan.warning_lines,
            "planned_moves":   len(plan.moves),
            "planned_drops":   [t.title for t in plan.drops],
            "commute_minutes": commute_mins or 0,
        }

    result = apply_event_plan(
        current_user.id, db,
        event_date, start_slot, end_slot, payload.title,
        plan, displaced_block_ids, displaced_task_ids,
        commute_slots=commute_slots,
    )
    return {
        "has_warnings":    plan.has_warnings,
        "summary":         plan.format_confirm_message(),
        "commute_minutes": commute_mins or 0,
        **result,
    }
