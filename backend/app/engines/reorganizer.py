"""
Reorganization engine for Sunday V1.
Rebuilds the future portion of the current week's schedule without touching
any locked blocks or blocks that are already in the past.
"""
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Set

from sqlalchemy.orm import Session

from app.engines.scheduler import (
    GYM_DURATION_MINS,
    GYM_PREFERRED,
    MEAL_DURATION_SLOTS,
    MT_DURATION_MINS,
    MT_PREFERRED,
    PRIORITY_ORDER,
    SLOTS_PER_DAY,
    _block,
    find_free_slot,
    mark_occupied,
    slots_needed,
    time_to_slot,
)
from app.models.reorganization_log import ReorganizationLog
from app.models.schedule_block import ScheduleBlock
from app.models.task import Task
from app.models.weekly_preferences import WeeklyPreferences

AFTERNOON_START = 26   # slot 26 = 13:00 — preferred gym / MT window


# ── Helpers ───────────────────────────────────────────────────────────────────

def _end_slot(time_str: str) -> int:
    """Convert end_time to slot; '00:00' maps to SLOTS_PER_DAY (midnight end-of-day)."""
    if time_str == "00:00":
        return SLOTS_PER_DAY
    return time_to_slot(time_str)


def _future_start(day_date: date, cut_date: date, cut_slot: int) -> Optional[int]:
    """
    Return the first freely-schedulable slot for day_date, or None if the
    entire day is frozen (in the past).
    """
    if day_date < cut_date:
        return None               # entirely past
    if day_date == cut_date:
        return cut_slot + 1       # only slots after current ongoing slot
    return 0                      # future day — all slots open


def _empty_result() -> Dict[str, Any]:
    return {
        "blocks_cleared": 0, "blocks_created": 0,
        "tasks_rescheduled": [], "tasks_dropped": [],
        "deadline_at_risk": [], "is_overloaded": False,
        "reorganization_log_id": None,
    }


# ── Main engine ───────────────────────────────────────────────────────────────

def reorganize_schedule(
    user_id: int, db: Session, reason: str = "manual"
) -> Dict[str, Any]:
    """
    Rebuild the current week's schedule from the current moment forward.
    Frozen blocks (is_locked=True or start time already past) are never
    touched, deleted, or moved.

    Returns a summary dict including log id, counts, and task lists.
    """

    # ── Step 1: Establish the cut point ──────────────────────────────────────
    now       = datetime.now()
    cut_date  = now.date()
    cut_slot  = now.hour * 2 + (1 if now.minute >= 30 else 0)

    # Find the week that has a schedule by looking at the latest block date
    latest_block: Optional[ScheduleBlock] = (
        db.query(ScheduleBlock)
        .filter(ScheduleBlock.user_id == user_id)
        .order_by(ScheduleBlock.date.desc())
        .first()
    )
    if latest_block is None:
        return _empty_result()

    week_start: date = latest_block.date - timedelta(days=latest_block.date.weekday())
    week_end:   date = week_start + timedelta(days=6)

    if week_end < cut_date:
        return _empty_result()   # Entire scheduled week is already in the past

    # ── Step 2: Load prefs and build the base time_map ────────────────────────
    prefs: Optional[WeeklyPreferences] = (
        db.query(WeeklyPreferences)
        .filter(WeeklyPreferences.user_id == user_id)
        .order_by(WeeklyPreferences.week_start_date.desc())
        .first()
    )

    def p(attr: str, default):
        return getattr(prefs, attr, default) if prefs else default

    preferred_wake_time     = p("preferred_wake_time",     "07:30")
    preferred_bedtime       = p("preferred_bedtime",       "23:30")
    morning_routine_mins    = p("morning_routine_mins",    30)
    night_routine_mins      = p("night_routine_mins",      20)
    meals_per_day           = p("meals_per_day",           2)
    gym_days_per_week       = p("gym_days_per_week",       3)
    muay_thai_days_per_week = p("muay_thai_days_per_week", 2)
    commute_minutes         = p("commute_minutes",         30)
    is_remote               = p("is_remote",               False)

    wake_slot           = time_to_slot(preferred_wake_time)
    bed_slot            = time_to_slot(preferred_bedtime)
    routine_slots       = slots_needed(morning_routine_mins)
    night_routine_slots = slots_needed(night_routine_mins)
    commute_slots       = slots_needed(commute_minutes)
    gym_slots           = slots_needed(GYM_DURATION_MINS)
    mt_slots            = slots_needed(MT_DURATION_MINS)
    night_routine_start = max(wake_slot + routine_slots, bed_slot - night_routine_slots)

    # Pre-mark immovable fixed slots on every day
    time_map: List[List[bool]] = [[False] * SLOTS_PER_DAY for _ in range(7)]
    for d in range(7):
        mark_occupied(time_map, d, 0, wake_slot)
        mark_occupied(time_map, d, bed_slot, SLOTS_PER_DAY - bed_slot)
        mark_occupied(time_map, d, night_routine_start, night_routine_slots)

    # ── Classify existing blocks as frozen vs clearable ───────────────────────
    all_blocks: List[ScheduleBlock] = (
        db.query(ScheduleBlock)
        .filter(
            ScheduleBlock.user_id == user_id,
            ScheduleBlock.date >= week_start,
            ScheduleBlock.date <= week_end,
        )
        .all()
    )

    to_delete:           List[ScheduleBlock] = []
    frozen_gym:          int      = 0
    frozen_mt:           int      = 0
    frozen_sleep_morning: Set[int] = set()   # day_idx values with frozen morning sleep
    frozen_sleep_evening: Set[int] = set()   # day_idx values with frozen evening sleep

    for block in all_blocks:
        day_idx = (block.date - week_start).days
        start_s = time_to_slot(block.start_time)
        end_s   = _end_slot(block.end_time)
        n_slots = max(1, end_s - start_s)

        is_past = (
            block.date < cut_date
            or (block.date == cut_date and start_s <= cut_slot)
        )
        frozen = block.is_locked or is_past

        if frozen:
            mark_occupied(time_map, day_idx, start_s, n_slots)
            if block.block_type == "gym":
                frozen_gym += 1
            elif block.block_type == "muay_thai":
                frozen_mt += 1
            elif block.block_type == "sleep":
                # Track frozen sleep blocks so we don't create duplicates
                if start_s == 0:
                    frozen_sleep_morning.add(day_idx)
                else:
                    frozen_sleep_evening.add(day_idx)
        else:
            to_delete.append(block)

    blocks_cleared = len(to_delete)

    # Collect task_ids whose scheduled blocks are about to be cleared so we can
    # revert them to "pending" — otherwise they'd be orphaned with no slot.
    clearing_task_ids = {b.task_id for b in to_delete if b.task_id is not None}

    for block in to_delete:
        db.delete(block)
    db.flush()   # push deletes to DB within this transaction

    if clearing_task_ids:
        db.query(Task).filter(
            Task.id.in_(clearing_task_ids),
            Task.status == "scheduled",
        ).update({"status": "pending"}, synchronize_session=False)
        db.flush()

    # ── Step 3: Load tasks that need rescheduling ─────────────────────────────
    tasks: List[Task] = (
        db.query(Task)
        .filter(
            Task.user_id == user_id,
            Task.status.in_(["pending", "partial", "missed"]),
        )
        .all()
    )
    sorted_tasks = sorted(tasks, key=lambda t: PRIORITY_ORDER.get(t.priority, 99))

    # ── Step 4: Rebuild life blocks for all future days ───────────────────────
    new_blocks: List[ScheduleBlock] = []

    def fs(d: date) -> Optional[int]:
        return _future_start(d, cut_date, cut_slot)

    for day_idx in range(7):
        day_date     = week_start + timedelta(days=day_idx)
        future_start = fs(day_date)
        if future_start is None:
            continue   # entire day is in the past
        is_weekday = day_idx < 5

        # Sleep (morning) — skip if a frozen sleep block already exists for this day
        if future_start == 0 and wake_slot > 0 and day_idx not in frozen_sleep_morning:
            new_blocks.append(_block(user_id, day_date, "sleep", "Sleep",
                                     0, wake_slot, is_locked=True))

        # Sleep (evening) — skip if a frozen sleep block already covers this slot
        if (bed_slot < SLOTS_PER_DAY and bed_slot >= future_start
                and day_idx not in frozen_sleep_evening):
            new_blocks.append(_block(user_id, day_date, "sleep", "Sleep",
                                     bed_slot, SLOTS_PER_DAY - bed_slot, is_locked=True))

        # Morning routine
        routine_end = wake_slot + routine_slots
        if wake_slot >= future_start:
            mark_occupied(time_map, day_idx, wake_slot, routine_slots)
            new_blocks.append(_block(user_id, day_date, "routine", "Morning Routine",
                                     wake_slot, routine_slots))

        # Night routine (slot already pre-marked in time_map)
        if night_routine_start >= future_start:
            new_blocks.append(_block(user_id, day_date, "routine", "Night Routine",
                                     night_routine_start, night_routine_slots))

        # Commute
        after_morning = max(routine_end, future_start)
        if is_weekday and not is_remote:
            am_start = routine_end
            if am_start >= future_start and am_start + commute_slots <= night_routine_start:
                mark_occupied(time_map, day_idx, am_start, commute_slots)
                new_blocks.append(_block(user_id, day_date, "commute", "Commute (Morning)",
                                         am_start, commute_slots))
                after_morning = am_start + commute_slots

            pm = find_free_slot(time_map, day_idx, commute_slots,
                                start_from=max(35, future_start),
                                end_before=night_routine_start)
            if pm is None:
                pm = find_free_slot(time_map, day_idx, commute_slots,
                                    start_from=max(after_morning, future_start),
                                    end_before=night_routine_start)
            if pm is not None:
                mark_occupied(time_map, day_idx, pm, commute_slots)
                new_blocks.append(_block(user_id, day_date, "commute", "Commute (Evening)",
                                         pm, commute_slots))

        # Meals
        breakfast_target = max(after_morning + 1, future_start)
        lunch_target     = max(time_to_slot("12:30"), future_start)
        dinner_target    = max(time_to_slot("19:00"), future_start)

        if meals_per_day == 1:
            meal_plan = [("Breakfast", breakfast_target)]
        elif meals_per_day == 2:
            meal_plan = [("Breakfast", breakfast_target), ("Dinner", dinner_target)]
        else:
            meal_plan = [("Breakfast", breakfast_target),
                         ("Lunch",     lunch_target),
                         ("Dinner",    dinner_target)]

        for meal_name, target in meal_plan:
            ms = find_free_slot(time_map, day_idx, MEAL_DURATION_SLOTS,
                                start_from=target, end_before=night_routine_start)
            if ms is None:
                ms = find_free_slot(time_map, day_idx, MEAL_DURATION_SLOTS,
                                    start_from=future_start, end_before=night_routine_start)
            if ms is not None:
                mark_occupied(time_map, day_idx, ms, MEAL_DURATION_SLOTS)
                new_blocks.append(_block(user_id, day_date, "meal", meal_name,
                                         ms, MEAL_DURATION_SLOTS))

    # Gym — only fill what's still needed after counting past/locked sessions
    remaining_gym = max(0, gym_days_per_week - frozen_gym)
    gym_assigned  = 0
    for day_idx in GYM_PREFERRED:
        if gym_assigned >= remaining_gym:
            break
        day_date     = week_start + timedelta(days=day_idx)
        future_start = fs(day_date)
        if future_start is None:
            continue
        gs = find_free_slot(time_map, day_idx, gym_slots,
                            start_from=max(AFTERNOON_START, future_start),
                            end_before=night_routine_start)
        if gs is None:
            gs = find_free_slot(time_map, day_idx, gym_slots,
                                start_from=max(wake_slot + routine_slots, future_start),
                                end_before=night_routine_start)
        if gs is not None:
            mark_occupied(time_map, day_idx, gs, gym_slots)
            new_blocks.append(_block(user_id, day_date, "gym", "Gym", gs, gym_slots))
            gym_assigned += 1

    # Muay Thai — same pattern
    remaining_mt = max(0, muay_thai_days_per_week - frozen_mt)
    mt_assigned  = 0
    for day_idx in MT_PREFERRED:
        if mt_assigned >= remaining_mt:
            break
        day_date     = week_start + timedelta(days=day_idx)
        future_start = fs(day_date)
        if future_start is None:
            continue
        ms = find_free_slot(time_map, day_idx, mt_slots,
                            start_from=max(AFTERNOON_START, future_start),
                            end_before=night_routine_start)
        if ms is None:
            ms = find_free_slot(time_map, day_idx, mt_slots,
                                start_from=max(wake_slot + routine_slots, future_start),
                                end_before=night_routine_start)
        if ms is not None:
            mark_occupied(time_map, day_idx, ms, mt_slots)
            new_blocks.append(_block(user_id, day_date, "muay_thai", "Muay Thai", ms, mt_slots))
            mt_assigned += 1

    # ── Steps 5 & 6: Task placement with deadline protection & overload guard ─

    def try_place(task: Task, before_date: Optional[date] = None) -> bool:
        """Attempt to place task in the first available future slot.
        If before_date is set, only consider days <= before_date."""
        task_n = slots_needed(task.duration_minutes)
        for d_idx in range(7):
            d_date       = week_start + timedelta(days=d_idx)
            future_start = fs(d_date)
            if future_start is None:
                continue
            if before_date and d_date > before_date:
                continue
            ts = find_free_slot(
                time_map, d_idx, task_n,
                start_from=max(wake_slot + routine_slots, future_start),
                end_before=night_routine_start,
            )
            if ts is not None:
                mark_occupied(time_map, d_idx, ts, task_n)
                new_blocks.append(_block(
                    user_id, d_date, "task", task.title, ts, task_n,
                    task_id=task.id, priority=task.priority,
                ))
                return True
        return False

    tasks_rescheduled: List[Task] = []
    tasks_dropped:     List[Task] = []
    deadline_at_risk:  List[Task] = []

    for task in sorted_tasks:
        deadline_date: Optional[date] = task.deadline.date() if task.deadline else None

        if deadline_date:
            # Try to fit before the deadline first
            if try_place(task, before_date=deadline_date):
                tasks_rescheduled.append(task)
            else:
                # Couldn't fit within deadline window
                deadline_at_risk.append(task)
                # Still attempt to place it anywhere remaining in the week
                if try_place(task):
                    tasks_rescheduled.append(task)
                else:
                    tasks_dropped.append(task)
        else:
            if try_place(task):
                tasks_rescheduled.append(task)
            else:
                tasks_dropped.append(task)

    # Critical / high tasks that couldn't be placed trigger overload flag
    HIGH = {"critical", "high"}
    is_overloaded = any(t.priority in HIGH for t in tasks_dropped)

    # ── Save new blocks ───────────────────────────────────────────────────────
    for block in new_blocks:
        db.add(block)

    # Promote successfully placed tasks to "scheduled"
    placed_ids: Set[int] = {b.task_id for b in new_blocks if b.task_id is not None}
    for task in tasks:
        if task.id in placed_ids:
            task.status = "scheduled"

    # ── Step 7: Log the reorganization ───────────────────────────────────────
    log = ReorganizationLog(
        user_id=user_id,
        triggered_at=now,
        reason=reason,
        blocks_cleared=blocks_cleared,
        blocks_created=len(new_blocks),
        tasks_rescheduled=len(tasks_rescheduled),
        tasks_dropped=len(tasks_dropped),
    )
    db.add(log)
    db.commit()
    db.refresh(log)

    for block in new_blocks:
        db.refresh(block)

    return {
        "blocks_cleared":        blocks_cleared,
        "blocks_created":        len(new_blocks),
        "tasks_rescheduled":     tasks_rescheduled,
        "tasks_dropped":         tasks_dropped,
        "deadline_at_risk":      deadline_at_risk,
        "is_overloaded":         is_overloaded,
        "reorganization_log_id": log.id,
    }
