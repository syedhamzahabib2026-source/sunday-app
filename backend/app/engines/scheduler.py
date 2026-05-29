"""
Core scheduling engine for Sunday V1.
Generates a full 7-day ScheduleBlock list for a user, working from a
30-minute slot grid and inserting blocks in strict priority order.
"""
import json
import os
from datetime import date, datetime, timedelta, timezone
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
    Gracefully returns {} on any failure (API key missing, network error, parse error).
    """
    if not scheduling_notes or not scheduling_notes.strip():
        return {}

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        print("[scheduler] ANTHROPIC_API_KEY not set — skipping AI scheduling hints")
        return {}

    task_lines = "\n".join(
        f"- {t.title} ({t.priority} priority, {t.duration_minutes} min)"
        for t in tasks[:25]  # cap to avoid huge prompts on large task lists
    )

    prompt = f"""You are a scheduling assistant helping build a weekly schedule.

User constraints: Wake {wake_time}, Bed {bed_time}.

User scheduling preferences (follow these closely):
{scheduling_notes}

Apply these preferences when deciding task order, time-of-day placement, and free time distribution.

Tasks to schedule:
{task_lines}

For each task, return the preferred time of day as exactly one of:
  "morning"   (before 12pm)
  "afternoon" (12pm–5pm)
  "evening"   (after 5pm)
  "any"       (no preference)

Respond ONLY with a valid JSON object mapping task title to time preference.
Example: {{"Deep work session": "morning", "Call dentist": "any"}}
Only include tasks whose preference is clearly indicated by the notes. Use "any" when unsure."""

    print(f"[scheduler] scheduling_notes received — sending to Claude AI prompt:\n"
          f"--- SCHEDULING NOTES START ---\n{scheduling_notes}\n--- SCHEDULING NOTES END ---")

    try:
        from anthropic import Anthropic
        client = Anthropic(api_key=api_key)
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=512,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = response.content[0].text.strip()
        print(f"[scheduler] Claude AI scheduling hints response: {raw}")

        if "{" in raw and "}" in raw:
            json_str = raw[raw.index("{") : raw.rindex("}") + 1]
            hints = json.loads(json_str)
            # Normalise values to lowercase
            return {k: str(v).lower() for k, v in hints.items()}

    except Exception as exc:
        print(f"[scheduler] AI hint call failed (non-fatal, using algorithmic fallback): {exc}")

    return {}


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
    # schedule_start = generation_timestamp + 1 hr, rounded up to next 15 min.
    # Blocks are only created on/after schedule_start_date and at/after
    # schedule_start_slot (for the partial first day).
    if generation_timestamp:
        try:
            ts_str = generation_timestamp.replace("Z", "+00:00")
            ts_aware = datetime.fromisoformat(ts_str)
            # Normalise to UTC naive so arithmetic is consistent with server times
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

    print(f"[scheduler] generation_ts={generation_timestamp} "
          f"schedule_start={schedule_start_date} slot={schedule_start_slot} "
          f"({slot_to_time(schedule_start_slot)})")

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

    # ── AI scheduling hints from user's plain-language notes ──────────────────
    scheduling_notes = p("scheduling_notes", None) or ""
    ai_hints = _get_ai_scheduling_hints(
        scheduling_notes,
        tasks,
        wake_time=preferred_wake_time,
        bed_time=preferred_bedtime,
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

    # Pre-mark immovable slots on every day so later passes respect them.
    # Past days are fully occupied so find_free_slot naturally skips them.
    for d in range(7):
        d_date = week_start_date + timedelta(days=d)
        if d_date < schedule_start_date:
            mark_occupied(time_map, d, 0, SLOTS_PER_DAY)  # entire past day
            continue
        mark_occupied(time_map, d, 0, wake_slot)                             # morning sleep
        mark_occupied(time_map, d, bed_slot, SLOTS_PER_DAY - bed_slot)      # evening sleep
        mark_occupied(time_map, d, night_routine_start, night_routine_slots) # night routine
        if d_date == schedule_start_date and schedule_start_slot > wake_slot:
            # Also block waking-but-past slots so tasks/gym don't land there
            mark_occupied(time_map, d, wake_slot, schedule_start_slot - wake_slot)

    # ── Step 3: Insert blocks ─────────────────────────────────────────────────
    blocks: List[ScheduleBlock] = []

    # ── 3a/3b/3c/3d: Per-day fixed blocks (sleep, routine, commute, meals) ────
    for day_idx in range(7):
        day_date   = week_start_date + timedelta(days=day_idx)
        is_weekday = day_idx < 5  # Mon-Fri

        # Skip days that are entirely in the past
        if day_date < schedule_start_date:
            continue

        # For the partial first day, only create blocks that start at/after cutoff
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
            # Morning commute right after routine
            if routine_end + commute_slots <= night_routine_start:
                mark_occupied(time_map, day_idx, routine_end, commute_slots)
                if _ok(routine_end):
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
                if _ok(pm):
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
                if _ok(ms):
                    blocks.append(_block(user_id, day_date, "meal", meal_name,
                                         ms, MEAL_DURATION_SLOTS))

    # ── 3e/3f: Gym and Muay Thai across the week ──────────────────────────────
    # Target window: early afternoon ~13:00 (slot 26) to give tasks the morning
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

    # ── 3g: Tasks — priority-sorted; fixed tasks placed first ────────────────
    sorted_tasks = sorted(tasks, key=lambda t: PRIORITY_ORDER.get(t.priority, 99))
    unscheduled_tasks: List[Task] = []

    # Partition into fixed (is_flexible=False with fixed_start_time) and flexible
    fixed_tasks    = [t for t in sorted_tasks
                      if not t.is_flexible and getattr(t, "fixed_start_time", None)]
    flexible_tasks = [t for t in sorted_tasks
                      if t.is_flexible or not getattr(t, "fixed_start_time", None)]

    # ── Fixed tasks — placed at their exact time on the specified day(s) ─────
    for task in fixed_tasks:
        start_slot = time_to_slot(task.fixed_start_time)
        end_slot   = time_to_slot(task.fixed_end_time) if task.fixed_end_time else start_slot + 1
        task_n     = max(1, end_slot - start_slot)
        task_commute_mins = getattr(task, "commute_minutes", 0) or 0
        task_commute_n    = slots_needed(task_commute_mins) if task_commute_mins else 0

        days_list: List[str] = []
        try:
            if task.preferred_days:
                days_list = json.loads(task.preferred_days)
        except (json.JSONDecodeError, TypeError):
            pass

        placed = False
        for day_name in days_list:
            day_idx = DAY_NAME_TO_IDX.get(day_name)
            if day_idx is None:
                continue

            day_date = week_start_date + timedelta(days=day_idx)

            # Skip days in the past or before schedule_start
            if day_date < schedule_start_date:
                continue
            if day_date == schedule_start_date and start_slot < schedule_start_slot:
                continue

            # Conflict check: are the task slots already occupied?
            if any(time_map[day_idx][s]
                   for s in range(start_slot, min(start_slot + task_n, SLOTS_PER_DAY))):
                unscheduled_tasks.append(task)
                break

            # Commute block before task (if slot is free and within waking hours)
            if task_commute_n > 0:
                before_start = max(wake_slot, start_slot - task_commute_n)
                if before_start >= wake_slot and before_start + task_commute_n <= start_slot:
                    mark_occupied(time_map, day_idx, before_start, task_commute_n)
                    blocks.append(_block(user_id, day_date, "commute", "Commute",
                                         before_start, task_commute_n))

            # Task block (locked — reorganizer will not move it)
            mark_occupied(time_map, day_idx, start_slot, task_n)
            blocks.append(_block(user_id, day_date, "task", task.title,
                                  start_slot, task_n,
                                  task_id=task.id, priority=task.priority,
                                  is_locked=True))

            # Commute block after task
            if task_commute_n > 0:
                after_start = start_slot + task_n
                if after_start + task_commute_n <= night_routine_start:
                    mark_occupied(time_map, day_idx, after_start, task_commute_n)
                    blocks.append(_block(user_id, day_date, "commute", "Return Commute",
                                         after_start, task_commute_n))

            placed = True

        if not placed and task not in unscheduled_tasks:
            unscheduled_tasks.append(task)

    # ── Flexible tasks — first-fit with optional commute wrapping ────────────
    # Slot boundaries for AI time-of-day hints
    MORNING_END   = time_to_slot("12:00")
    AFTERNOON_END = time_to_slot("17:00")

    for task in flexible_tasks:
        task_n = slots_needed(task.duration_minutes)
        task_commute_mins = getattr(task, "commute_minutes", 0) or 0
        task_commute_n    = slots_needed(task_commute_mins) if task_commute_mins else 0
        # Total contiguous slots needed: [commute] + task + [commute]
        total_n = task_commute_n + task_n + task_commute_n

        # AI-suggested time-of-day preference for this task
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
            # Try preferred window first (from AI hint), then full day as fallback
            ts = find_free_slot(time_map, day_idx, total_n,
                                start_from=pref_start, end_before=pref_end)
            if ts is None:
                ts = find_free_slot(time_map, day_idx, total_n,
                                    start_from=wake_slot + routine_slots,
                                    end_before=night_routine_start)
            if ts is not None:
                day_date = week_start_date + timedelta(days=day_idx)

                if task_commute_n > 0:
                    # Commute before
                    mark_occupied(time_map, day_idx, ts, task_commute_n)
                    blocks.append(_block(user_id, day_date, "commute", "Commute",
                                         ts, task_commute_n))

                task_start = ts + task_commute_n
                mark_occupied(time_map, day_idx, task_start, task_n)
                blocks.append(_block(user_id, day_date, "task", task.title,
                                      task_start, task_n,
                                      task_id=task.id, priority=task.priority))

                if task_commute_n > 0:
                    # Return commute
                    return_start = task_start + task_n
                    mark_occupied(time_map, day_idx, return_start, task_commute_n)
                    blocks.append(_block(user_id, day_date, "commute", "Return Commute",
                                         return_start, task_commute_n))

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
