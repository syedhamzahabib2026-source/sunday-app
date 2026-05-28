"""
Smart reorganization engine with priority-cascade bumping and warning mode.

Algorithm per the spec:
  STEP 1 — Empty slot first (always)
  STEP 2 — No empty slot: bump exactly one level down (cascade)
  STEP 3 — Deadline check before every placement
  STEP 4 — Collect warnings; if any exist, return plan without applying
            (caller sends to Slack and waits for confirmation)
"""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Set, Tuple

from sqlalchemy.orm import Session

from app.engines.scheduler import (
    PRIORITY_ORDER,
    SLOTS_PER_DAY,
    _block,
    find_free_slot,
    mark_occupied,
    slot_to_time,
    slots_needed,
    time_to_slot,
)
from app.models.reorganization_log import ReorganizationLog
from app.models.schedule_block import ScheduleBlock
from app.models.task import Task
from app.models.weekly_preferences import WeeklyPreferences

# ── Priority cascade map ──────────────────────────────────────────────────────
# "which priority level does this task bump down into?"
BUMPS_INTO: Dict[str, str] = {
    "high": "medium",
    "medium": "low",
    "low": "optional",
    # critical → never bumped (warning only)
    # optional → always dropped
}


# ── Data structures ───────────────────────────────────────────────────────────

@dataclass
class PlannedMove:
    task: Task
    day_idx: int
    day_date: date
    start_slot: int
    num_slots: int
    bumped_from_title: Optional[str] = None


@dataclass
class ReorgPlan:
    moves: List[PlannedMove] = field(default_factory=list)
    drops: List[Task] = field(default_factory=list)
    deadline_risks: List[Task] = field(default_factory=list)
    warning_lines: List[str] = field(default_factory=list)

    @property
    def has_warnings(self) -> bool:
        return bool(self.warning_lines)

    def format_warning_message(self) -> str:
        lines = ["Here's what needs to change:"]
        for m in self.moves:
            s = slot_to_time(m.start_slot)
            e = slot_to_time(m.start_slot + m.num_slots)
            day = m.day_date.strftime("%A")
            lines.append(f"✅ Moving *{m.task.title}* → {day} {s}–{e}")
        lines.extend(self.warning_lines)
        lines.append("\nShould I go ahead? Reply *yes* or *no*.")
        return "\n".join(lines)

    def format_confirm_message(self) -> str:
        n = len(self.moves)
        d = len(self.drops)
        msg = f"{n} task{'s' if n != 1 else ''} rescheduled."
        if d:
            msg += f" {d} task{'s' if d != 1 else ''} dropped (no space left)."
        return msg


# ── Helpers ───────────────────────────────────────────────────────────────────

def _end_slot(time_str: str) -> int:
    return SLOTS_PER_DAY if time_str == "00:00" else time_to_slot(time_str)


def _load_prefs(user_id: int, db: Session):
    prefs = (
        db.query(WeeklyPreferences)
        .filter(WeeklyPreferences.user_id == user_id)
        .order_by(WeeklyPreferences.week_start_date.desc())
        .first()
    )

    def p(attr, default):
        return getattr(prefs, attr, default) if prefs else default

    wake_slot = time_to_slot(p("preferred_wake_time", "07:30"))
    bed_slot = time_to_slot(p("preferred_bedtime", "23:30"))
    routine_slots = slots_needed(p("morning_routine_mins", 30))
    night_routine_slots = slots_needed(p("night_routine_mins", 20))
    night_routine_start = max(wake_slot + routine_slots, bed_slot - night_routine_slots)
    task_start = wake_slot + routine_slots
    return wake_slot, bed_slot, night_routine_start, task_start


# ── Plan builder ──────────────────────────────────────────────────────────────

def build_event_plan(
    user_id: int,
    db: Session,
    event_date: date,
    event_start_slot: int,
    event_end_slot: int,
    event_title: str,
) -> Tuple[ReorgPlan, List[int], List[int]]:
    """
    Plan the changes needed to accommodate a new fixed event block.
    Does NOT write to the database.

    Returns:
      (plan, displaced_block_ids, displaced_task_ids)
    """
    plan = ReorgPlan()

    week_start = event_date - timedelta(days=event_date.weekday())
    week_end = week_start + timedelta(days=6)
    now = datetime.now()
    cut_date = now.date()
    cut_slot = now.hour * 2 + (1 if now.minute >= 30 else 0)

    wake_slot, bed_slot, night_routine_start, task_start = _load_prefs(user_id, db)

    # ── Build time_map from frozen + non-task blocks ──────────────────────────
    time_map: List[List[bool]] = [[False] * SLOTS_PER_DAY for _ in range(7)]
    for d in range(7):
        mark_occupied(time_map, d, 0, wake_slot)
        mark_occupied(time_map, d, bed_slot, SLOTS_PER_DAY - bed_slot)
        mark_occupied(time_map, d, night_routine_start,
                      max(1, bed_slot - night_routine_start))

    all_blocks: List[ScheduleBlock] = (
        db.query(ScheduleBlock)
        .filter(
            ScheduleBlock.user_id == user_id,
            ScheduleBlock.date >= week_start,
            ScheduleBlock.date <= week_end,
        )
        .all()
    )

    # slot_task: (day_idx, slot) → task_id  (only moveable task blocks)
    slot_task: Dict[Tuple[int, int], int] = {}
    # task_placements: task_id → (day_idx, start_slot, num_slots)
    task_placements: Dict[int, Tuple[int, int, int]] = {}

    displaced_block_ids: List[int] = []
    displaced_task_ids: List[int] = []

    event_day_idx = (event_date - week_start).days

    for block in all_blocks:
        day_idx = (block.date - week_start).days
        start_s = time_to_slot(block.start_time)
        end_s = _end_slot(block.end_time)
        n_slots = max(1, end_s - start_s)

        is_past = (
            block.date < cut_date
            or (block.date == cut_date and start_s <= cut_slot)
        )
        frozen = block.is_locked or is_past

        # Check overlap with event window (same day only)
        overlaps_event = (
            day_idx == event_day_idx
            and start_s < event_end_slot
            and end_s > event_start_slot
            and block.block_type == "task"
            and not frozen
        )

        if overlaps_event:
            displaced_block_ids.append(block.id)
            if block.task_id:
                displaced_task_ids.append(block.task_id)
            # Don't mark occupied — we'll clear this slot for the event
        elif frozen or block.block_type != "task":
            mark_occupied(time_map, day_idx, start_s, n_slots)
        else:
            # Future, moveable task block — already placed
            mark_occupied(time_map, day_idx, start_s, n_slots)
            if block.task_id:
                slot_task.update({(day_idx, s): block.task_id for s in range(start_s, start_s + n_slots)})
                task_placements[block.task_id] = (day_idx, start_s, n_slots)

    # Mark event window as occupied
    mark_occupied(time_map, event_day_idx, event_start_slot,
                  event_end_slot - event_start_slot)

    if not displaced_task_ids:
        return plan, displaced_block_ids, displaced_task_ids

    # Load displaced tasks
    displaced_tasks: List[Task] = (
        db.query(Task)
        .filter(Task.id.in_(displaced_task_ids))
        .all()
    )
    task_registry: Dict[int, Task] = {t.id: t for t in displaced_tasks}

    # Also include any other placed tasks for bumping purposes
    all_placed_ids = set(task_placements.keys())
    other_tasks = (
        db.query(Task)
        .filter(
            Task.id.in_(all_placed_ids - set(displaced_task_ids)),
        )
        .all()
    ) if all_placed_ids - set(displaced_task_ids) else []
    task_registry.update({t.id: t for t in other_tasks})

    # ── Cascade placement ─────────────────────────────────────────────────────

    def find_empty_slot(task: Task) -> Optional[Tuple[int, int]]:
        task_n = slots_needed(task.duration_minutes)
        deadline_date = task.deadline.date() if task.deadline else None
        for d_idx in range(7):
            d_date = week_start + timedelta(days=d_idx)
            if d_date < cut_date:
                continue
            if deadline_date and d_date > deadline_date:
                break
            fs = cut_slot + 1 if d_date == cut_date else 0
            slot = find_free_slot(
                time_map, d_idx, task_n,
                start_from=max(task_start, fs),
                end_before=night_routine_start,
            )
            if slot is not None:
                return (d_idx, slot)
        return None

    def unplace(task_id: int):
        if task_id not in task_placements:
            return
        d_idx, start, n = task_placements.pop(task_id)
        for s in range(start, start + n):
            slot_task.pop((d_idx, s), None)
            time_map[d_idx][s] = False
        plan.moves[:] = [m for m in plan.moves if m.task.id != task_id]

    def place(task: Task, d_idx: int, slot: int, bumped_from_title: Optional[str] = None):
        task_n = slots_needed(task.duration_minutes)
        mark_occupied(time_map, d_idx, slot, task_n)
        for s in range(slot, slot + task_n):
            slot_task[(d_idx, s)] = task.id
        task_placements[task.id] = (d_idx, slot, task_n)
        plan.moves[:] = [m for m in plan.moves if m.task.id != task.id]
        plan.moves.append(PlannedMove(
            task=task,
            day_idx=d_idx,
            day_date=week_start + timedelta(days=d_idx),
            start_slot=slot,
            num_slots=task_n,
            bumped_from_title=bumped_from_title,
        ))

    def find_lower_occupant(task: Task) -> Optional[int]:
        """Find a task_id at exactly one priority level lower that's currently placed."""
        target_prio = BUMPS_INTO.get(task.priority)
        if not target_prio:
            return None
        deadline_date = task.deadline.date() if task.deadline else None
        for d_idx in range(7):
            d_date = week_start + timedelta(days=d_idx)
            if d_date < cut_date:
                continue
            if deadline_date and d_date > deadline_date:
                break
            for s in range(task_start, night_routine_start):
                tid = slot_task.get((d_idx, s))
                if tid and tid in task_registry and task_registry[tid].priority == target_prio:
                    return tid
        return None

    def cascade(task: Task, depth: int = 0):
        if depth > 6:
            plan.drops.append(task)
            plan.warning_lines.append(f"🗑 *{task.title}* — cascade limit reached, dropped")
            return

        # STEP 1: Empty slot first
        result = find_empty_slot(task)
        if result is not None:
            d_idx, slot = result
            place(task, d_idx, slot)
            return

        # STEP 2: No empty slot
        if task.priority == "optional":
            plan.drops.append(task)
            plan.warning_lines.append(f"🗑 *{task.title}* — no space left this week, dropped")
            return

        if task.priority == "critical":
            # Critical is never bumped — warn but don't drop
            plan.deadline_risks.append(task)
            plan.warning_lines.append(
                f"⚠️ *{task.title}* (critical) — no valid slot found this week"
            )
            return

        bump_target_id = find_lower_occupant(task)
        if bump_target_id is None:
            if task.priority in ("high",):
                plan.deadline_risks.append(task)
                plan.warning_lines.append(f"⚠️ *{task.title}* (high) — no valid slot found")
            else:
                plan.drops.append(task)
                plan.warning_lines.append(f"🗑 *{task.title}* — dropped, no space left")
            return

        bump_target = task_registry[bump_target_id]

        # SPECIAL CASE: Critical/High with deadline — try earlier slot same day first
        if task.priority in ("critical", "high") and bump_target_id in task_placements:
            bump_d, bump_slot, _ = task_placements[bump_target_id]
            task_n = slots_needed(task.duration_minutes)
            earlier = find_free_slot(
                time_map, bump_d, task_n,
                start_from=task_start, end_before=bump_slot,
            )
            if earlier is not None:
                place(task, bump_d, earlier)
                return

        if bump_target_id not in task_placements:
            plan.drops.append(task)
            plan.warning_lines.append(f"🗑 *{task.title}* — dropped, target not placed")
            return

        bump_d, bump_slot, _ = task_placements[bump_target_id]

        # Take the bump target's slot
        unplace(bump_target_id)
        place(task, bump_d, bump_slot, bumped_from_title=bump_target.title)

        if task.priority in ("critical", "high"):
            plan.warning_lines.append(
                f"⚠️ *{task.title}* ({task.priority}) displaced"
                f" *{bump_target.title}* ({bump_target.priority})"
            )

        # Cascade: displaced task looks for a new home
        cascade(bump_target, depth + 1)

    # Sort displaced tasks by priority (critical first)
    sorted_displaced = sorted(
        displaced_tasks,
        key=lambda t: PRIORITY_ORDER.get(t.priority, 99),
    )

    for task in sorted_displaced:
        unplace(task.id)   # clear from current tracking (they're losing their block)
        cascade(task)

    return plan, displaced_block_ids, displaced_task_ids


# ── Plan applicator ───────────────────────────────────────────────────────────

def apply_event_plan(
    user_id: int,
    db: Session,
    event_date: date,
    event_start_slot: int,
    event_end_slot: int,
    event_title: str,
    plan: ReorgPlan,
    displaced_block_ids: List[int],
    displaced_task_ids: List[int],
    reason: str = "event_add",
) -> Dict[str, Any]:
    """Apply the event and its reorganization plan to the database."""
    now = datetime.now()

    # 1. Get displaced task_ids from blocks before deleting
    if displaced_block_ids:
        db.query(ScheduleBlock).filter(
            ScheduleBlock.id.in_(displaced_block_ids)
        ).delete(synchronize_session=False)
        db.flush()

    # 2. Revert displaced tasks to pending
    if displaced_task_ids:
        db.query(Task).filter(
            Task.id.in_(displaced_task_ids),
            Task.status == "scheduled",
        ).update({"status": "pending"}, synchronize_session=False)
        db.flush()

    # 3. Create the fixed event block
    event_block = ScheduleBlock(
        user_id=user_id,
        block_type="event",
        title=event_title,
        start_time=slot_to_time(event_start_slot),
        end_time=slot_to_time(event_end_slot) if event_end_slot < SLOTS_PER_DAY else "00:00",
        date=event_date,
        is_locked=True,
        priority=None,
    )
    db.add(event_block)

    # 4. Create new task blocks from the plan
    blocks_created = 1  # the event block itself
    placed_task_ids: Set[int] = set()

    for move in plan.moves:
        new_block = _block(
            user_id,
            move.day_date,
            "task",
            move.task.title,
            move.start_slot,
            move.num_slots,
            task_id=move.task.id,
            priority=move.task.priority,
        )
        db.add(new_block)
        placed_task_ids.add(move.task.id)
        blocks_created += 1

        # Track bumped_from on task
        if move.bumped_from_title:
            db.query(Task).filter(Task.id == move.task.id).update(
                {"bumped_from": move.bumped_from_title},
                synchronize_session=False,
            )

    # 5. Update task statuses
    if placed_task_ids:
        db.query(Task).filter(Task.id.in_(placed_task_ids)).update(
            {"status": "scheduled"}, synchronize_session=False
        )

    for dropped in plan.drops:
        db.query(Task).filter(Task.id == dropped.id).update(
            {"status": "pending"}, synchronize_session=False
        )

    # 6. Log
    log = ReorganizationLog(
        user_id=user_id,
        triggered_at=now,
        reason=reason,
        blocks_cleared=len(displaced_block_ids),
        blocks_created=blocks_created,
        tasks_rescheduled=len(plan.moves),
        tasks_dropped=len(plan.drops),
    )
    db.add(log)
    db.commit()

    return {
        "blocks_cleared": len(displaced_block_ids),
        "blocks_created": blocks_created,
        "tasks_rescheduled": len(plan.moves),
        "tasks_dropped": len(plan.drops),
    }
