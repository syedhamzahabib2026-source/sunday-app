"""
Core scheduling engine for Sunday V1.
Generates a full 7-day ScheduleBlock list for a user, working from a
30-minute slot grid and inserting blocks in strict priority order.
"""
from datetime import date, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.schedule_block import ScheduleBlock
from app.models.task import Task
from app.models.weekly_preferences import WeeklyPreferences

# ── Constants ─────────────────────────────────────────────────────────────────

SLOTS_PER_DAY = 48          # 30-min slots: index 0 = 00:00 … 47 = 23:30
GYM_DURATION_MINS = 75
MT_DURATION_MINS = 90
MEAL_DURATION_SLOTS = 1     # 30 min each

PRIORITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3, "optional": 4}

# Preferred day indices (0=Mon … 6=Sun)
GYM_PREFERRED = [0, 2, 4, 1, 3, 5, 6]   # Mon/Wed/Fri first
MT_PREFERRED  = [1, 3, 0, 2, 4, 5, 6]   # Tue/Thu first


# ── Time helpers ──────────────────────────────────────────────────────────────

def time_to_slot(time_str: str) -> int:
    """'HH:MM' → slot index 0-47."""
    h, m = map(int, time_str.split(":"))
    return h * 2 + (1 if m >= 30 else 0)


def slot_to_time(slot: int) -> str:
    """Slot index → 'HH:MM'. Slot 48 maps to '00:00' (midnight end-of-day)."""
    slot = min(slot, SLOTS_PER_DAY)
    if slot == SLOTS_PER_DAY:
        return "00:00"
    return f"{slot // 2:02d}:{30 if slot % 2 else 0:02d}"


def slots_needed(minutes: int) -> int:
    """Ceiling-divide minutes into 30-min slot count (minimum 1)."""
    return max(1, (minutes + 29) // 30)


# ── Time-map helpers ──────────────────────────────────────────────────────────

def mark_occupied(time_map: List[List[bool]], day: int, start: int, count: int) -> None:
    for s in range(start, min(start + count, SLOTS_PER_DAY)):
        time_map[day][s] = True


def find_free_slot(
    time_map: List[List[bool]],
    day: int,
    count: int,
    start_from: int = 0,
    end_before: int = SLOTS_PER_DAY,
) -> Optional[int]:
    """First contiguous free block of `count` slots in [start_from, end_before)."""
    limit = min(end_before, SLOTS_PER_DAY) - count
    for start in range(max(0, start_from), limit + 1):
        if all(not time_map[day][s] for s in range(start, start + count)):
            return start
    return None


# ── Block factory ─────────────────────────────────────────────────────────────

def _block(
    user_id: int,
    day_date: date,
    block_type: str,
    title: str,
    start_slot: int,
    num_slots: int,
    task_id: Optional[int] = None,
    is_locked: bool = False,
    priority: Optional[str] = None,
) -> ScheduleBlock:
    return ScheduleBlock(
        user_id=user_id,
        task_id=task_id,
        block_type=block_type,
        title=title,
        start_time=slot_to_time(start_slot),
        end_time=slot_to_time(start_slot + num_slots),
        date=day_date,
        is_locked=is_locked,
        priority=priority,
    )


# ── Main engine ───────────────────────────────────────────────────────────────

def generate_weekly_schedule(
    user_id: int,
    week_start_date: date,
    db: Session,
) -> Dict[str, Any]:
    """
    Generate a full 7-day schedule for `user_id` starting on `week_start_date`.
    Returns:
        {
            "week_start":        date,
            "blocks":            List[ScheduleBlock],
            "is_overloaded":     bool,
            "unscheduled_tasks": List[Task],
        }
    """

    # ── Step 1: Load inputs ───────────────────────────────────────────────────
    prefs: Optional[WeeklyPreferences] = (
        db.query(WeeklyPreferences)
        .filter(WeeklyPreferences.user_id == user_id)
        .order_by(WeeklyPreferences.week_start_date.desc())
        .first()
    )

    def p(attr: str, default):
        return getattr(prefs, attr, default) if prefs else default

    preferred_wake_time     = p("preferred_wake_time",    "07:30")
    preferred_bedtime       = p("preferred_bedtime",      "23:30")
    morning_routine_mins    = p("morning_routine_mins",   30)
    night_routine_mins      = p("night_routine_mins",     20)
    meals_per_day           = p("meals_per_day",          2)
    gym_days_per_week       = p("gym_days_per_week",      3)
    muay_thai_days_per_week = p("muay_thai_days_per_week", 2)
    commute_minutes         = p("commute_minutes",        30)
    is_remote               = p("is_remote",              False)

    tasks: List[Task] = (
        db.query(Task)
        .filter(Task.user_id == user_id, Task.status.in_(["pending", "scheduled"]))
        .all()
    )

    # ── Step 2: Build time map ────────────────────────────────────────────────
    time_map: List[List[bool]] = [[False] * SLOTS_PER_DAY for _ in range(7)]

    wake_slot           = time_to_slot(preferred_wake_time)
    bed_slot            = time_to_slot(preferred_bedtime)
    routine_slots       = slots_needed(morning_routine_mins)
    night_routine_slots = slots_needed(night_routine_mins)
    commute_slots       = slots_needed(commute_minutes)
    gym_slots           = slots_needed(GYM_DURATION_MINS)
    mt_slots            = slots_needed(MT_DURATION_MINS)

    # Night routine starts just before bed, never overlapping morning routine
    night_routine_start = max(wake_slot + routine_slots, bed_slot - night_routine_slots)

    # Pre-mark immovable slots on every day so later passes respect them
    for d in range(7):
        mark_occupied(time_map, d, 0, wake_slot)                             # morning sleep
        mark_occupied(time_map, d, bed_slot, SLOTS_PER_DAY - bed_slot)      # evening sleep
        mark_occupied(time_map, d, night_routine_start, night_routine_slots) # night routine

    # ── Step 3: Insert blocks ─────────────────────────────────────────────────
    blocks: List[ScheduleBlock] = []

    # ── 3a/3b/3c/3d: Per-day fixed blocks (sleep, routine, commute, meals) ────
    for day_idx in range(7):
        day_date   = week_start_date + timedelta(days=day_idx)
        is_weekday = day_idx < 5  # Mon-Fri

        # Sleep — morning (00:00 → wake) + evening (bed → midnight)
        if wake_slot > 0:
            blocks.append(_block(user_id, day_date, "sleep", "Sleep",
                                 0, wake_slot, is_locked=True))
        if bed_slot < SLOTS_PER_DAY:
            blocks.append(_block(user_id, day_date, "sleep", "Sleep",
                                 bed_slot, SLOTS_PER_DAY - bed_slot, is_locked=True))

        # Morning routine — immediately after wake
        mark_occupied(time_map, day_idx, wake_slot, routine_slots)
        blocks.append(_block(user_id, day_date, "routine", "Morning Routine",
                             wake_slot, routine_slots))
        routine_end = wake_slot + routine_slots

        # Night routine — slot already pre-marked; just create the block
        blocks.append(_block(user_id, day_date, "routine", "Night Routine",
                             night_routine_start, night_routine_slots))

        # Commute — weekdays only when not remote
        after_morning = routine_end
        if is_weekday and not is_remote:
            # Morning commute right after routine
            if routine_end + commute_slots <= night_routine_start:
                mark_occupied(time_map, day_idx, routine_end, commute_slots)
                blocks.append(_block(user_id, day_date, "commute", "Commute (Morning)",
                                     routine_end, commute_slots))
                after_morning = routine_end + commute_slots

            # Evening commute: target ~17:30 (slot 35), scan backwards if needed
            pm = find_free_slot(time_map, day_idx, commute_slots,
                                start_from=35, end_before=night_routine_start)
            if pm is None:
                pm = find_free_slot(time_map, day_idx, commute_slots,
                                    start_from=after_morning, end_before=night_routine_start)
            if pm is not None:
                mark_occupied(time_map, day_idx, pm, commute_slots)
                blocks.append(_block(user_id, day_date, "commute", "Commute (Evening)",
                                     pm, commute_slots))

        # Meals — breakfast just after morning block, lunch ~12:30, dinner ~19:00
        breakfast_slot = after_morning + 1          # 30-min buffer
        lunch_slot     = time_to_slot("12:30")
        dinner_slot    = time_to_slot("19:00")

        if meals_per_day == 1:
            meal_plan = [("Breakfast", breakfast_slot)]
        elif meals_per_day == 2:
            meal_plan = [("Breakfast", breakfast_slot), ("Dinner", dinner_slot)]
        else:
            meal_plan = [("Breakfast", breakfast_slot),
                         ("Lunch",     lunch_slot),
                         ("Dinner",    dinner_slot)]

        for meal_name, target in meal_plan:
            ms = find_free_slot(time_map, day_idx, MEAL_DURATION_SLOTS,
                                start_from=target, end_before=night_routine_start)
            if ms is None:   # fallback: first available waking slot
                ms = find_free_slot(time_map, day_idx, MEAL_DURATION_SLOTS,
                                    start_from=after_morning, end_before=night_routine_start)
            if ms is not None:
                mark_occupied(time_map, day_idx, ms, MEAL_DURATION_SLOTS)
                blocks.append(_block(user_id, day_date, "meal", meal_name,
                                     ms, MEAL_DURATION_SLOTS))

    # ── 3e/3f: Gym and Muay Thai across the week ──────────────────────────────
    # Target window: early afternoon ~13:00 (slot 26) to give tasks the morning
    AFTERNOON_START = 26   # 13:00

    gym_assigned = 0
    for day_idx in GYM_PREFERRED:
        if gym_assigned >= gym_days_per_week:
            break
        gs = find_free_slot(time_map, day_idx, gym_slots,
                            start_from=AFTERNOON_START, end_before=night_routine_start)
        if gs is None:
            gs = find_free_slot(time_map, day_idx, gym_slots,
                                start_from=wake_slot + routine_slots, end_before=night_routine_start)
        if gs is not None:
            day_date = week_start_date + timedelta(days=day_idx)
            mark_occupied(time_map, day_idx, gs, gym_slots)
            blocks.append(_block(user_id, day_date, "gym", "Gym", gs, gym_slots))
            gym_assigned += 1

    mt_assigned = 0
    for day_idx in MT_PREFERRED:
        if mt_assigned >= muay_thai_days_per_week:
            break
        ms = find_free_slot(time_map, day_idx, mt_slots,
                            start_from=AFTERNOON_START, end_before=night_routine_start)
        if ms is None:
            ms = find_free_slot(time_map, day_idx, mt_slots,
                                start_from=wake_slot + routine_slots, end_before=night_routine_start)
        if ms is not None:
            day_date = week_start_date + timedelta(days=day_idx)
            mark_occupied(time_map, day_idx, ms, mt_slots)
            blocks.append(_block(user_id, day_date, "muay_thai", "Muay Thai", ms, mt_slots))
            mt_assigned += 1

    # ── 3g: Tasks — priority-sorted, first-fit across the week ───────────────
    sorted_tasks = sorted(tasks, key=lambda t: PRIORITY_ORDER.get(t.priority, 99))
    unscheduled_tasks: List[Task] = []

    for task in sorted_tasks:
        task_n = slots_needed(task.duration_minutes)
        placed = False
        for day_idx in range(7):
            ts = find_free_slot(time_map, day_idx, task_n,
                                start_from=wake_slot + routine_slots,
                                end_before=night_routine_start)
            if ts is not None:
                day_date = week_start_date + timedelta(days=day_idx)
                mark_occupied(time_map, day_idx, ts, task_n)
                blocks.append(_block(user_id, day_date, "task", task.title, ts, task_n,
                                     task_id=task.id, priority=task.priority))
                placed = True
                break
        if not placed:
            unscheduled_tasks.append(task)

    is_overloaded = bool(unscheduled_tasks)

    # ── Step 4: Save to database ──────────────────────────────────────────────
    week_end = week_start_date + timedelta(days=6)

    # Full replace — delete all existing blocks for this week so re-generation
    # is idempotent (sleep blocks are re-created each run anyway)
    db.query(ScheduleBlock).filter(
        ScheduleBlock.user_id == user_id,
        ScheduleBlock.date >= week_start_date,
        ScheduleBlock.date <= week_end,
    ).delete(synchronize_session=False)

    for block in blocks:
        db.add(block)

    # Promote placed tasks to "scheduled"
    placed_ids = {b.task_id for b in blocks if b.task_id is not None}
    for task in tasks:
        if task.id in placed_ids:
            task.status = "scheduled"

    db.commit()

    for block in blocks:
        db.refresh(block)

    # ── Step 5: Return result ─────────────────────────────────────────────────
    return {
        "week_start":        week_start_date,
        "blocks":            blocks,
        "is_overloaded":     is_overloaded,
        "unscheduled_tasks": unscheduled_tasks,
    }
