"""
Core scheduling engine for Sunday V1.
Generates a full 7-day ScheduleBlock list for a user, working from a
30-minute slot grid and inserting blocks in strict priority order.
"""
import json
import logging
import os
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.schedule_block import ScheduleBlock
from app.models.task import Task
from app.models.weekly_preferences import WeeklyPreferences

# ── Constants ─────────────────────────────────────────────────────────────────

logger = logging.getLogger(__name__)

SLOTS_PER_DAY = 48          # 30-min slots: index 0 = 00:00 … 47 = 23:30
GYM_DURATION_MINS = 75
MT_DURATION_MINS = 90
MEAL_DURATION_SLOTS = 1     # 30 min each

PRIORITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3, "optional": 4}

# Preferred day indices (0=Mon … 6=Sun)
GYM_PREFERRED = [0, 2, 4, 1, 3, 5, 6]   # Mon/Wed/Fri first
MT_PREFERRED  = [1, 3, 0, 2, 4, 5, 6]   # Tue/Thu first

# Day-name → weekday index for fixed-time task placement
DAY_NAME_TO_IDX = {
    "Monday": 0, "Tuesday": 1, "Wednesday": 2, "Thursday": 3,
    "Friday": 4, "Saturday": 5, "Sunday": 6,
}


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


# ── AI scheduling hints ───────────────────────────────────────────────────────

def _get_ai_scheduling_hints(
    scheduling_notes: str,
    tasks: List[Task],
    wake_time: str = "07:30",
    bed_time: str = "23:30",
) -> Dict[str, str]:
    """
    Call Claude with the user's scheduling_notes and task list.
    Returns a dict mapping task title → preferred time slot:
      "morning" | "afternoon" | "evening" | "any"
    Special key "fill_remaining_with" contains a task title to fill free slots with (or None).
    Gracefully returns {} on any failure (API key missing, network error, parse error).
    """
    if not scheduling_notes or not scheduling_notes.strip():
        return {}

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        logger.warning("ANTHROPIC_API_KEY not set — skipping AI scheduling hints")
        return {}

    system_prompt = (
        "You are a scheduling assistant. You MUST follow the user's preferences exactly. "
        "Given a list of tasks and constraints, return ONLY a JSON object. "
        "No explanations. No markdown. Raw JSON only. "
        "If the user says 'fill free time with X', 'use remaining time for X', "
        "'X whenever possible', or 'all available slots for X', you MUST set "
        "fill_remaining_with to that task's exact title from the list."
    )

    task_data = [
        {"title": t.title, "duration_min": t.duration_minutes,
         "priority": t.priority, "deadline": str(t.deadline)}
        for t in tasks[:25]
    ]

    user_prompt = (
        f"User constraints:\n"
        f"- Wake: {wake_time}, Sleep: {bed_time}\n"
        f"- Work hours: 9am-6pm preferred\n"
        f"- Energy: high in morning, low after 3pm\n\n"
        f"Tasks to schedule:\n{json.dumps(task_data, indent=2)}\n\n"
        f"User preferences: {scheduling_notes or 'none'}\n\n"
        f"IMPORTANT: If the user says fill free time with X or use remaining time for X, "
        f"you MUST return fill_remaining_with set to that task's exact title.\n\n"
        f'Return JSON:\n{{\n'
        f'  "task title": "morning|afternoon|evening|any",\n'
        f'  "fill_remaining_with": "exact task title or null"\n'
        f'}}'
    )

    logger.info(f"Sending {len(task_data)} tasks to Claude for scheduling hints")

    try:
        from anthropic import Anthropic
        client = Anthropic(api_key=api_key)
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=512,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )
        raw = response.content[0].text.strip()
        logger.debug("Claude scheduling hints received")

        if "{" in raw and "}" in raw:
            json_str = raw[raw.index("{") : raw.rindex("}") + 1]
            hints = json.loads(json_str)
            # Normalise all values to lowercase strings, preserving fill_remaining_with
            result: Dict[str, str] = {}
            for k, v in hints.items():
                if k == "fill_remaining_with":
                    result[k] = str(v) if v and str(v).lower() != "null" else ""
                else:
                    result[k] = str(v).lower()
            return result

    except Exception as exc:
        logger.warning(f"AI hint call failed (non-fatal): {exc}")
        return {t.title: "any" for t in tasks}

    return {t.title: "any" for t in tasks}


# ── Main engine ───────────────────────────────────────────────────────────────

def generate_weekly_schedule(
    user_id: int,
    week_start_date: date,
    db: Session,
    generation_timestamp: Optional[str] = None,
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

    # ── Schedule-start window ─────────────────────────────────────────────────
    if generation_timestamp:
        try:
            ts_str = generation_timestamp.replace("Z", "+00:00")
            ts_aware = datetime.fromisoformat(ts_str)
            ts = ts_aware.astimezone(timezone.utc).replace(tzinfo=None)
        except Exception:
            ts = datetime.utcnow()
    else:
        ts = datetime.utcnow()

    schedule_start_dt = ts + timedelta(hours=1)
    rem = schedule_start_dt.minute % 15
    if rem != 0:
        schedule_start_dt += timedelta(minutes=(15 - rem))
    schedule_start_dt = schedule_start_dt.replace(second=0, microsecond=0)

    schedule_start_date: date = schedule_start_dt.date()
    schedule_start_slot: int  = time_to_slot(
        f"{schedule_start_dt.hour:02d}:{schedule_start_dt.minute:02d}"
    )

    logger.info(f"schedule_start={schedule_start_date} slot={schedule_start_slot}")

    # ── Step 1: Load inputs ───────────────────────────────────────────────────
    prefs: Optional[WeeklyPreferences] = (
        db.query(WeeklyPreferences)
        .filter(WeeklyPreferences.user_id == user_id)
        .order_by(WeeklyPreferences.week_start_date.desc(), WeeklyPreferences.id.desc())
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

    # Preferred meal times (Bug 2)
    meal_breakfast_time = p("meal_breakfast_time", None)
    meal_lunch_time     = p("meal_lunch_time",     None)
    meal_dinner_time    = p("meal_dinner_time",    None)

    # AI mode: override wake/bed time defaults and disable Muay Thai.
    if p("mode", "manual") == "ai":
        preferred_wake_time     = "07:00"
        preferred_bedtime       = "23:00"
        morning_routine_mins    = 30
        night_routine_mins      = 20
        muay_thai_days_per_week = 0

    tasks: List[Task] = (
        db.query(Task)
        .filter(Task.user_id == user_id, Task.status.in_(["pending", "scheduled"]))
        .all()
    )

    # Filter out tasks whose deadline has already passed; mark them expired in DB.
    _today = date.today()
    _expired_ids: List[int] = []
    _valid_tasks: List[Task] = []
    for _t in tasks:
        if _t.deadline is not None:
            try:
                if isinstance(_t.deadline, str):
                    _dl = date.fromisoformat(_t.deadline[:10])
                elif hasattr(_t.deadline, "date"):
                    _dl = _t.deadline.date()
                else:
                    _dl = date.fromisoformat(str(_t.deadline)[:10])
                if _dl < _today:
                    _expired_ids.append(_t.id)
                    continue
            except Exception:
                pass
        _valid_tasks.append(_t)
    if _expired_ids:
        db.query(Task).filter(Task.id.in_(_expired_ids)).update(
            {"status": "expired"}, synchronize_session=False
        )
        db.flush()
        logger.warning(f"Marked {len(_expired_ids)} task(s) as expired (past deadline)")
    tasks = _valid_tasks

    logger.info(f"Total tasks loaded: {len(tasks)}")

    # ── AI scheduling hints from user's plain-language notes ──────────────────
    scheduling_notes = p("scheduling_notes", None) or ""
    ai_hints = _get_ai_scheduling_hints(
        scheduling_notes,
        tasks,
        wake_time=preferred_wake_time,
        bed_time=preferred_bedtime,
    )

    # Pop special fill_remaining_with key before using hints for time-of-day placement
    ai_fill_title: str = ai_hints.pop("fill_remaining_with", "") or ""

    # Also parse fill-remaining patterns directly from scheduling_notes (regex fallback)
    _fill_patterns = [
        r"fill\s+(?:free|remaining|all)\s+(?:time|slots?)\s+with\s+(.+?)(?:\s*$|[.,;])",
        r"use\s+(?:remaining|all|free)\s+(?:time|slots?)\s+for\s+(.+?)(?:\s*$|[.,;])",
        r"(.+?)\s+whenever\s+possible",
        r"all\s+available\s+slots?\s+(?:for\s+)?(.+?)(?:\s*$|[.,;])",
    ]
    regex_fill_title = ""
    if scheduling_notes and not ai_fill_title:
        for _pat in _fill_patterns:
            _m = re.search(_pat, scheduling_notes.strip(), re.IGNORECASE)
            if _m:
                regex_fill_title = _m.group(1).strip().lower()
                break

    # ── Step 2: Build time map ────────────────────────────────────────────────
    time_map: List[List[bool]] = [[False] * SLOTS_PER_DAY for _ in range(7)]

    wake_slot           = time_to_slot(preferred_wake_time)
    bed_slot            = time_to_slot(preferred_bedtime)
    if bed_slot == 0:
        bed_slot = SLOTS_PER_DAY  # midnight bedtime: treat as end-of-day
    routine_slots       = slots_needed(morning_routine_mins)
    night_routine_slots = slots_needed(night_routine_mins)
    commute_slots       = slots_needed(commute_minutes)
    gym_slots           = slots_needed(GYM_DURATION_MINS)
    mt_slots            = slots_needed(MT_DURATION_MINS)

    night_routine_start = max(wake_slot + routine_slots, bed_slot - night_routine_slots)

    # Pre-mark immovable slots on every day so later passes respect them.
    for d in range(7):
        d_date = week_start_date + timedelta(days=d)
        if d_date < schedule_start_date:
            mark_occupied(time_map, d, 0, SLOTS_PER_DAY)  # entire past day
            continue
        mark_occupied(time_map, d, 0, wake_slot)                              # morning sleep
        mark_occupied(time_map, d, bed_slot, SLOTS_PER_DAY - bed_slot)       # evening sleep
        mark_occupied(time_map, d, night_routine_start, night_routine_slots)  # night routine
        if d_date == schedule_start_date and schedule_start_slot > wake_slot:
            mark_occupied(time_map, d, wake_slot, schedule_start_slot - wake_slot)

    # Snapshot before fixed-task pre-marking — used in step 3g to detect overlapping fixed tasks.
    time_map_baseline: List[List[bool]] = [row[:] for row in time_map]

    # ── Bug 1 fix: Pre-mark fixed task slots so meals/gym won't land there ────
    # This runs AFTER sleep is marked but BEFORE per-day blocks (meals, commute, gym).
    sorted_tasks = sorted(tasks, key=lambda t: PRIORITY_ORDER.get(t.priority, 99))

    fixed_tasks    = [t for t in sorted_tasks
                      if not t.is_flexible and getattr(t, "fixed_start_time", None)]
    flexible_tasks = [t for t in sorted_tasks
                      if t.is_flexible or not getattr(t, "fixed_start_time", None)]

    logger.info(f"Fixed tasks: {len(fixed_tasks)}, Flexible: {len(flexible_tasks)}")

    for _ft in fixed_tasks:
        try:
            _fs = time_to_slot(_ft.fixed_start_time)
            _fe = time_to_slot(_ft.fixed_end_time) if _ft.fixed_end_time else _fs + 1
            _fn = max(1, _fe - _fs)
        except Exception:
            continue
        _days_raw: List[str] = []
        try:
            if _ft.preferred_days:
                _days_raw = json.loads(_ft.preferred_days)
        except (json.JSONDecodeError, TypeError):
            pass
        for _dn in _days_raw:
            _di = DAY_NAME_TO_IDX.get(_dn)
            if _di is None:
                continue
            _dd = week_start_date + timedelta(days=_di)
            if _dd < schedule_start_date:
                continue
            if _dd == schedule_start_date and _fs < schedule_start_slot:
                continue
            # Only pre-mark during waking hours so we don't disturb sleep marks
            if _fs >= wake_slot and (_fs + _fn) <= bed_slot:
                mark_occupied(time_map, _di, _fs, _fn)
                logger.debug(f"Pre-marked fixed task on {_dn} slots {_fs}-{_fs+_fn}")

    # ── Step 3: Insert blocks ─────────────────────────────────────────────────
    blocks: List[ScheduleBlock] = []

    # ── 3a/3b/3c/3d: Per-day fixed blocks (sleep, routine, commute, meals) ────
    for day_idx in range(7):
        day_date   = week_start_date + timedelta(days=day_idx)
        is_weekday = day_idx < 5  # Mon-Fri

        if day_date < schedule_start_date:
            continue

        cutoff = schedule_start_slot if day_date == schedule_start_date else 0

        def _ok(start_slot: int) -> bool:
            return start_slot >= cutoff

        # Sleep — morning (00:00 → wake) + evening (bed → midnight)
        if wake_slot > 0 and _ok(0):
            blocks.append(_block(user_id, day_date, "sleep", "Sleep",
                                 0, wake_slot, is_locked=True))
        if bed_slot < SLOTS_PER_DAY and _ok(bed_slot):
            blocks.append(_block(user_id, day_date, "sleep", "Sleep",
                                 bed_slot, SLOTS_PER_DAY - bed_slot, is_locked=True))

        # Morning routine — immediately after wake
        mark_occupied(time_map, day_idx, wake_slot, routine_slots)
        if _ok(wake_slot):
            blocks.append(_block(user_id, day_date, "routine", "Morning Routine",
                                 wake_slot, routine_slots))
        routine_end = wake_slot + routine_slots

        # Night routine — slot already pre-marked; just create the block
        if _ok(night_routine_start):
            blocks.append(_block(user_id, day_date, "routine", "Night Routine",
                                 night_routine_start, night_routine_slots))

        # Commute — weekdays only when not remote
        after_morning = routine_end
        if is_weekday and not is_remote:
            if routine_end + commute_slots <= night_routine_start:
                mark_occupied(time_map, day_idx, routine_end, commute_slots)
                if _ok(routine_end):
                    blocks.append(_block(user_id, day_date, "commute", "Commute (Morning)",
                                         routine_end, commute_slots))
                after_morning = routine_end + commute_slots

            pm = find_free_slot(time_map, day_idx, commute_slots,
                                start_from=35, end_before=night_routine_start)
            if pm is None:
                pm = find_free_slot(time_map, day_idx, commute_slots,
                                    start_from=after_morning, end_before=night_routine_start)
            if pm is not None:
                mark_occupied(time_map, day_idx, pm, commute_slots)
                if _ok(pm):
                    blocks.append(_block(user_id, day_date, "commute", "Commute (Evening)",
                                         pm, commute_slots))

        # Meals — use preferred times from prefs (Bug 2), fall back to defaults
        default_breakfast_slot = after_morning + 1   # 30-min buffer after morning block
        breakfast_slot = (
            time_to_slot(meal_breakfast_time) if meal_breakfast_time
            else default_breakfast_slot
        )
        lunch_slot  = time_to_slot(meal_lunch_time)  if meal_lunch_time  else time_to_slot("12:30")
        dinner_slot = time_to_slot(meal_dinner_time) if meal_dinner_time else time_to_slot("19:00")

        # Ensure breakfast target isn't before morning routine ends
        breakfast_slot = max(breakfast_slot, after_morning)

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
                if _ok(ms):
                    blocks.append(_block(user_id, day_date, "meal", meal_name,
                                         ms, MEAL_DURATION_SLOTS))

    # ── 3e/3f: Gym and Muay Thai across the week ──────────────────────────────
    AFTERNOON_START = 26   # 13:00

    gym_assigned = 0
    for day_idx in GYM_PREFERRED:
        if gym_assigned >= gym_days_per_week:
            break
        day_date = week_start_date + timedelta(days=day_idx)
        cutoff = schedule_start_slot if day_date == schedule_start_date else 0
        gs = find_free_slot(time_map, day_idx, gym_slots,
                            start_from=max(AFTERNOON_START, cutoff), end_before=night_routine_start)
        if gs is None:
            gs = find_free_slot(time_map, day_idx, gym_slots,
                                start_from=max(wake_slot + routine_slots, cutoff),
                                end_before=night_routine_start)
        if gs is not None:
            mark_occupied(time_map, day_idx, gs, gym_slots)
            blocks.append(_block(user_id, day_date, "gym", "Gym", gs, gym_slots))
            gym_assigned += 1

    mt_assigned = 0
    for day_idx in MT_PREFERRED:
        if mt_assigned >= muay_thai_days_per_week:
            break
        day_date = week_start_date + timedelta(days=day_idx)
        cutoff = schedule_start_slot if day_date == schedule_start_date else 0
        ms = find_free_slot(time_map, day_idx, mt_slots,
                            start_from=max(AFTERNOON_START, cutoff), end_before=night_routine_start)
        if ms is None:
            ms = find_free_slot(time_map, day_idx, mt_slots,
                                start_from=max(wake_slot + routine_slots, cutoff),
                                end_before=night_routine_start)
        if ms is not None:
            mark_occupied(time_map, day_idx, ms, mt_slots)
            blocks.append(_block(user_id, day_date, "muay_thai", "Muay Thai", ms, mt_slots))
            mt_assigned += 1

    # ── 3g: Tasks — fixed tasks placed first (slots already pre-marked in step 2)
    unscheduled_tasks: List[Task] = []

    # ── Fixed tasks — placed at their exact time on the specified day(s) ──────
    for task in fixed_tasks:
        try:
            start_slot = time_to_slot(task.fixed_start_time)
            end_slot   = time_to_slot(task.fixed_end_time) if task.fixed_end_time else start_slot + 1
        except Exception:
            unscheduled_tasks.append(task)
            continue
        task_n            = max(1, end_slot - start_slot)
        task_commute_mins = getattr(task, "commute_minutes", 0) or 0
        task_commute_n    = slots_needed(task_commute_mins) if task_commute_mins else 0

        days_list: List[str] = []
        try:
            if task.preferred_days:
                days_list = json.loads(task.preferred_days)
        except (json.JSONDecodeError, TypeError):
            pass

        if not days_list:
            logger.warning(f"Fixed task id={task.id} has no preferred_days — skipping")
            unscheduled_tasks.append(task)
            continue

        placed = False
        for day_name in days_list:
            day_idx = DAY_NAME_TO_IDX.get(day_name)
            if day_idx is None:
                continue

            day_date = week_start_date + timedelta(days=day_idx)

            if day_date < schedule_start_date:
                continue
            if day_date == schedule_start_date and start_slot < schedule_start_slot:
                continue

            # Reject if task falls entirely outside waking hours (user error)
            if start_slot < wake_slot or (start_slot + task_n) > bed_slot:
                logger.warning(f"Fixed task id={task.id} on {day_name} falls outside waking hours")
                continue

            # Check for conflicts with other fixed tasks (FIX 1)
            _conflict = False
            for _s in range(start_slot, min(start_slot + task_n, SLOTS_PER_DAY)):
                if time_map[day_idx][_s] and not time_map_baseline[day_idx][_s]:
                    _conflict = True
                    break
            if _conflict:
                logger.warning(
                    f"Fixed task id={task.id} on {day_name} conflicts with another fixed task — skipping"
                )
                continue

            # Slots are pre-reserved in step 2; just create the block.
            # Commute block before task
            if task_commute_n > 0:
                before_start = max(wake_slot, start_slot - task_commute_n)
                if before_start >= wake_slot and before_start + task_commute_n <= start_slot:
                    mark_occupied(time_map, day_idx, before_start, task_commute_n)
                    blocks.append(_block(user_id, day_date, "commute", "Commute",
                                         before_start, task_commute_n))

            # Task block (locked — reorganizer will not move it)
            blocks.append(_block(user_id, day_date, "task", task.title,
                                  start_slot, task_n,
                                  task_id=task.id, priority=task.priority,
                                  is_locked=True))
            logger.info(f"Placed fixed task id={task.id} on {day_name}")

            # Commute block after task
            if task_commute_n > 0:
                after_start = start_slot + task_n
                if after_start + task_commute_n <= night_routine_start:
                    mark_occupied(time_map, day_idx, after_start, task_commute_n)
                    blocks.append(_block(user_id, day_date, "commute", "Return Commute",
                                         after_start, task_commute_n))

            placed = True

        if not placed:
            unscheduled_tasks.append(task)

    # ── Flexible tasks — first-fit with optional commute wrapping ────────────
    MORNING_END   = time_to_slot("12:00")
    AFTERNOON_END = time_to_slot("17:00")

    for task in flexible_tasks:
        _dur = task.duration_minutes or 0
        if _dur <= 0:
            logger.warning(f"Task id={task.id} has duration={_dur}, defaulting to 30 min")
            _dur = 30
        task_n = slots_needed(_dur)
        task_commute_mins = getattr(task, "commute_minutes", 0) or 0
        task_commute_n    = slots_needed(task_commute_mins) if task_commute_mins else 0
        total_n = task_commute_n + task_n + task_commute_n

        hint = ai_hints.get(task.title, "any").lower()
        if hint == "morning":
            pref_start, pref_end = wake_slot + routine_slots, MORNING_END
        elif hint == "afternoon":
            pref_start, pref_end = MORNING_END, AFTERNOON_END
        elif hint == "evening":
            pref_start, pref_end = AFTERNOON_END, night_routine_start
        else:
            pref_start, pref_end = wake_slot + routine_slots, night_routine_start

        placed = False
        for day_idx in range(7):
            ts = find_free_slot(time_map, day_idx, total_n,
                                start_from=pref_start, end_before=pref_end)
            if ts is None:
                ts = find_free_slot(time_map, day_idx, total_n,
                                    start_from=wake_slot + routine_slots,
                                    end_before=night_routine_start)
            if ts is not None:
                day_date = week_start_date + timedelta(days=day_idx)

                if task_commute_n > 0:
                    mark_occupied(time_map, day_idx, ts, task_commute_n)
                    blocks.append(_block(user_id, day_date, "commute", "Commute",
                                         ts, task_commute_n))

                task_start = ts + task_commute_n
                mark_occupied(time_map, day_idx, task_start, task_n)
                blocks.append(_block(user_id, day_date, "task", task.title,
                                      task_start, task_n,
                                      task_id=task.id, priority=task.priority))

                if task_commute_n > 0:
                    return_start = task_start + task_n
                    mark_occupied(time_map, day_idx, return_start, task_commute_n)
                    blocks.append(_block(user_id, day_date, "commute", "Return Commute",
                                         return_start, task_commute_n))

                placed = True
                break

        if not placed:
            unscheduled_tasks.append(task)

    # ── Bug 3: Fill remaining free slots with the specified task ──────────────
    # Resolve fill target: prefer AI response, fall back to regex parse of notes.
    _fill_target_title = ai_fill_title or regex_fill_title

    if _fill_target_title:
        # Find the matching task (case-insensitive)
        fill_task: Optional[Task] = None
        for _t in tasks:
            if _t.title.lower() == _fill_target_title.lower():
                fill_task = _t
                break
        if fill_task is None:
            # Partial match fallback
            for _t in tasks:
                if (_fill_target_title.lower() in _t.title.lower() or
                        _t.title.lower() in _fill_target_title.lower()):
                    fill_task = _t
                    break

        if fill_task is not None:
            logger.info(f"Filling remaining free slots with task id={fill_task.id}")
            # Avoid duplicating days where normal scheduling already placed this task.
            fill_placed_dates = {b.date for b in blocks if b.task_id == fill_task.id}
            extra_placed = 0
            MAX_EXTRA = 4
            MAX_PER_DAY = 3
            fill_slots = slots_needed(120)  # 2-hour fill blocks

            for day_idx in range(7):
                if extra_placed >= MAX_EXTRA:
                    break
                day_date = week_start_date + timedelta(days=day_idx)
                if day_date < schedule_start_date:
                    continue
                if day_date in fill_placed_dates:
                    continue  # already has a block from normal scheduling
                day_fill_count = 0
                scan_from = wake_slot + routine_slots
                while extra_placed < MAX_EXTRA and day_fill_count < MAX_PER_DAY:
                    ts = find_free_slot(time_map, day_idx, fill_slots,
                                        start_from=scan_from,
                                        end_before=night_routine_start)
                    if ts is None:
                        break
                    mark_occupied(time_map, day_idx, ts, fill_slots)
                    blocks.append(_block(user_id, day_date, "task", fill_task.title,
                                          ts, fill_slots,
                                          task_id=fill_task.id,
                                          priority=fill_task.priority))
                    extra_placed += 1
                    day_fill_count += 1
                    scan_from = ts + fill_slots
        else:
            logger.warning("fill_remaining_with specified but no matching task found")

    # ── Deep work blocks — fill remaining free slots when enabled ────────────
    dw_enabled: bool = bool(p("deep_work_enabled", False))
    if dw_enabled:
        dw_session_mins: int = int(p("deep_work_session_duration", 120))
        dw_slots = slots_needed(dw_session_mins)
        LATE_CUTOFF = time_to_slot("21:00")  # never schedule deep work at or after 21:00
        MAX_DW_PER_DAY = 4
        logger.info(f"Deep work enabled: {dw_session_mins} min sessions")

        for day_idx in range(7):
            day_date = week_start_date + timedelta(days=day_idx)
            if day_date < schedule_start_date:
                continue
            dw_day_count = 0
            scan_from = wake_slot + routine_slots
            while dw_day_count < MAX_DW_PER_DAY:
                ts = find_free_slot(
                    time_map, day_idx, dw_slots,
                    start_from=scan_from,
                    end_before=min(LATE_CUTOFF, night_routine_start),
                )
                if ts is None:
                    break
                mark_occupied(time_map, day_idx, ts, dw_slots)
                blocks.append(_block(user_id, day_date, "deep_work", "Deep Work",
                                     ts, dw_slots))
                dw_day_count += 1
                scan_from = ts + dw_slots

    is_overloaded = bool(unscheduled_tasks)

    # ── Step 4: Save to database ──────────────────────────────────────────────
    week_end = week_start_date + timedelta(days=6)

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


# ── Missed-task rescheduler ───────────────────────────────────────────────────

def reorganize_missed_task(
    user_id: int,
    missed_block_id: int,
    db: Session,
) -> Dict[str, Any]:
    """
    Full priority-aware rescheduler. Scores all candidate slots and picks best.
    Priority rules:
      optional  → always dropped
      low       → only reschedule if slot available today/tomorrow
      medium    → reschedule within week, same time-of-day preferred
      high      → ASAP, any slot
      critical  → ASAP, flag as needs_attention if no slot found
    """
    missed_block = db.query(ScheduleBlock).filter(ScheduleBlock.id == missed_block_id).first()
    if not missed_block or not missed_block.task_id:
        return {"rescheduled": False, "reason": "block_not_a_task"}

    task = db.query(Task).filter(Task.id == missed_block.task_id).first()
    if not task:
        return {"rescheduled": False, "reason": "task_not_found"}

    priority  = task.priority or "medium"
    task_slots = slots_needed(task.duration_minutes)

    now   = datetime.utcnow()
    today = now.date()

    if priority == "optional":
        return {"rescheduled": False, "reason": "optional_dropped", "task_title": task.title}

    deadline_date: Optional[date] = None
    if task.deadline is not None:
        try:
            if isinstance(task.deadline, str):
                deadline_date = date.fromisoformat(task.deadline[:10])
            elif hasattr(task.deadline, "date"):
                deadline_date = task.deadline.date()
            else:
                deadline_date = date.fromisoformat(str(task.deadline)[:10])
        except Exception:
            logger.warning(f"Could not parse deadline for task id={task.id}: {task.deadline!r}")
            deadline_date = None
        if deadline_date is not None and deadline_date < today:
            return {"rescheduled": False, "reason": "deadline_passed", "task_title": task.title}

    week_end   = today + timedelta(days=6 - today.weekday())
    search_end = min(deadline_date, week_end) if deadline_date else week_end

    if priority == "low":
        search_end = min(search_end, today + timedelta(days=1))

    num_days = max(1, (search_end - today).days + 1)

    now_mins          = now.hour * 60 + now.minute + 30
    search_start_slot = min(now_mins // 30 + 1, SLOTS_PER_DAY)

    time_map: List[List[bool]] = [[False] * SLOTS_PER_DAY for _ in range(num_days)]

    future_blocks = (
        db.query(ScheduleBlock)
        .filter(
            ScheduleBlock.user_id == user_id,
            ScheduleBlock.date >= today,
            ScheduleBlock.date <= search_end,
            ScheduleBlock.id != missed_block_id,
        )
        .all()
    )

    for fb in future_blocks:
        d_offset = (fb.date - today).days
        if d_offset < 0 or d_offset >= num_days:
            continue
        s_start = time_to_slot(fb.start_time)
        eh, em  = map(int, fb.end_time.split(":"))
        s_end   = SLOTS_PER_DAY if (eh == 0 and em == 0) else time_to_slot(fb.end_time)
        mark_occupied(time_map, d_offset, s_start, max(1, s_end - s_start))

    mark_occupied(time_map, 0, 0, min(search_start_slot, SLOTS_PER_DAY))

    LATE_NIGHT_SLOT = time_to_slot("22:00")
    MEAL_SLOTS      = [time_to_slot("08:00"), time_to_slot("12:30"), time_to_slot("19:00")]
    original_slot   = time_to_slot(missed_block.start_time) if missed_block else None

    def _orig_period(s: Optional[int]) -> int:
        if s is None: return 1
        return 0 if s < 24 else 1 if s < 34 else 2

    orig_period = _orig_period(original_slot)

    candidates: List[tuple] = []

    for d_offset in range(num_days):
        from_slot = search_start_slot if d_offset == 0 else 0
        for start in range(from_slot, SLOTS_PER_DAY - task_slots + 1):
            if not all(not time_map[d_offset][s] for s in range(start, start + task_slots)):
                continue

            score = d_offset

            if start >= LATE_NIGHT_SLOT:
                score += 2

            for ms in MEAL_SLOTS:
                if abs(start - ms) <= 1:
                    score += 1
                    break

            if priority in ("medium", "low"):
                slot_period = 0 if start < 24 else 1 if start < 34 else 2
                if slot_period == orig_period:
                    score -= 1

            candidates.append((score, d_offset, start))

    if not candidates:
        if priority in ("critical", "high"):
            return {
                "rescheduled": False,
                "reason": "needs_attention",
                "task_title": task.title,
                "priority": priority,
            }
        return {"rescheduled": False, "reason": "no_slot_found", "task_title": task.title}

    candidates.sort()
    _, best_d_offset, best_slot = candidates[0]
    new_date = today + timedelta(days=best_d_offset)

    new_block = ScheduleBlock(
        user_id       = user_id,
        task_id       = task.id,
        block_type    = "task",
        title         = task.title,
        start_time    = slot_to_time(best_slot),
        end_time      = slot_to_time(best_slot + task_slots),
        date          = new_date,
        is_locked     = False,
        priority      = task.priority,
        is_rescheduled= True,
    )
    db.add(new_block)
    db.commit()
    db.refresh(new_block)

    return {
        "rescheduled":    True,
        "task_title":     task.title,
        "new_date":       str(new_date),
        "new_start_time": slot_to_time(best_slot),
        "new_end_time":   slot_to_time(best_slot + task_slots),
        "block_id":       new_block.id,
    }
