"""Invariant tests for the weekly schedule generator.

Reproduces the real-world setup that shook out the July 2026 bug batch:
per-job commutes, 7am Muay Thai classes, a packed shift week, lunch+dinner
only. Each test locks in one invariant that regressed at least once.

Run:  python -m pytest tests/test_scheduler.py -q   (from backend/)
"""
import json
import os
from datetime import date

# Point the app at a throwaway sqlite DB BEFORE importing app modules.
os.environ["DATABASE_URL"] = "sqlite:///./test_scheduler.db"

import pytest  # noqa: E402

from app.database import SessionLocal, init_db, engine, Base  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.task import Task  # noqa: E402
from app.models.weekly_preferences import WeeklyPreferences  # noqa: E402
from app.engines.scheduler import generate_weekly_schedule  # noqa: E402

# A Monday far enough in the future that "schedule start" never trims the week.
WEEK_START = date(2027, 3, 1)

COMMITMENTS = [
    {"title": "Panera shift",   "start_time": "14:00", "end_time": "21:30",
     "days": ["Monday"], "recurring": True, "commute_minutes": 75, "location": "Panera"},
    {"title": "Panera shift",   "start_time": "10:00", "end_time": "16:00",
     "days": ["Saturday", "Sunday"], "recurring": True, "commute_minutes": 75, "location": "Panera"},
    {"title": "Marianos shift", "start_time": "13:00", "end_time": "21:00",
     "days": ["Tuesday", "Wednesday", "Thursday"], "recurring": True, "commute_minutes": 30, "location": "Marianos"},
    {"title": "Marianos shift", "start_time": "14:00", "end_time": "22:00",
     "days": ["Friday"], "recurring": True, "commute_minutes": 30, "location": "Marianos"},
    {"title": "Class",          "start_time": "10:00", "end_time": "12:30",
     "days": ["Tuesday", "Thursday"], "recurring": True, "commute_minutes": 0},
    {"title": "Parents visit",  "start_time": "17:30", "end_time": "19:00",
     "days": ["Saturday", "Sunday"], "recurring": True, "commute_minutes": 0},
]


def _mins(t: str) -> int:
    h, m = map(int, t.split(":"))
    total = h * 60 + m
    return 1440 if total == 0 else total  # end-of-day "00:00" means midnight


@pytest.fixture(scope="module")
def week_blocks():
    Base.metadata.drop_all(bind=engine)
    init_db()
    db = SessionLocal()
    try:
        user = User(name="Test", email="scheduler-test@sunday.app", timezone="America/Chicago")
        db.add(user)
        db.commit()
        db.refresh(user)

        db.add(WeeklyPreferences(
            user_id=user.id, week_start_date=WEEK_START,
            preferred_wake_time="05:00", preferred_bedtime="23:00",
            sleep_target_hours=6.0,
            morning_routine_mins=30, night_routine_mins=20, shower_mins=15,
            meals_per_day=2, meal_types=json.dumps(["Dinner", "Lunch"]),
            meal_lunch_time="12:30", meal_dinner_time="20:30",
            gym_days_per_week=4, gym_duration_mins=60, gym_commute_minutes=15,
            gym_split_labels=json.dumps(["Chest Day", "Back Day", "Shoulder Day", "Leg Day"]),
            muay_thai_days_per_week=3, muay_thai_duration_mins=90,
            muay_thai_commute_minutes=60, muay_thai_preferred_time="07:00",
            workout_time_preference="morning",
            is_remote=True, energy_preference="spread",
            deep_work_enabled=True, deep_work_session_duration=120,
            fixed_commitments=json.dumps(COMMITMENTS),
        ))
        for title, mins in [("Meal prep + laundry", 120), ("Clean room", 60)]:
            db.add(Task(user_id=user.id, title=title, duration_minutes=mins,
                        priority="medium", energy_level="medium",
                        is_flexible=True, status="pending", is_recurring=True))
        db.commit()

        result = generate_weekly_schedule(user.id, WEEK_START, db)
        yield result["blocks"]
    finally:
        db.rollback()
        db.close()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()
        try:
            os.remove("test_scheduler.db")
        except OSError:
            pass


def _by_day(blocks):
    days = {}
    for b in blocks:
        days.setdefault(b.date, []).append(b)
    for lst in days.values():
        lst.sort(key=lambda b: _mins(b.start_time))
    return days


def test_no_overlapping_blocks(week_blocks):
    for day, blocks in _by_day(week_blocks).items():
        prev_end, prev_title = 0, None
        for b in blocks:
            start, end = _mins(b.start_time), _mins(b.end_time)
            assert start >= prev_end, (
                f"{day}: '{b.title}' {b.start_time} overlaps '{prev_title}' ending {prev_end // 60:02d}:{prev_end % 60:02d}"
            )
            prev_end, prev_title = end, b.title


def test_commitment_commutes_use_exact_minutes(week_blocks):
    durations = {"Panera shift": 75, "Marianos shift": 30}
    seen = set()
    for b in week_blocks:
        for job, expected in durations.items():
            if b.block_type == "commute" and job in b.title:
                actual = _mins(b.end_time) - _mins(b.start_time)
                assert actual == expected, (
                    f"{b.date} '{b.title}' is {actual} min, expected exactly {expected}"
                )
                seen.add(job)
    assert seen == set(durations), f"missing commute blocks for {set(durations) - seen}"


def test_muay_thai_three_sessions_at_preferred_time(week_blocks):
    mt = [b for b in week_blocks if b.block_type == "muay_thai"]
    assert len(mt) == 3, f"expected 3 MT sessions, got {len(mt)}"
    for b in mt:
        assert b.start_time == "07:00", f"{b.date} MT starts {b.start_time}, wanted 07:00"


def test_gym_four_sessions_labels_in_calendar_order(week_blocks):
    gym = sorted((b for b in week_blocks if b.block_type == "gym"),
                 key=lambda b: (b.date, b.start_time))
    assert len(gym) == 4, f"expected 4 gym sessions, got {len(gym)}"
    labels = [b.title.split("— ")[-1] for b in gym]
    assert labels == ["Chest Day", "Back Day", "Shoulder Day", "Leg Day"], labels


def test_meals_stay_near_their_targets(week_blocks):
    targets = {"Lunch": 12 * 60 + 30, "Dinner": 20 * 60 + 30}
    for day, blocks in _by_day(week_blocks).items():
        for meal, target in targets.items():
            found = [b for b in blocks if b.block_type == "meal" and b.title == meal]
            assert len(found) <= 1, f"{day}: duplicate {meal}"
            for b in found:
                drift = abs(_mins(b.start_time) - target)
                assert drift <= 150, (
                    f"{day}: {meal} at {b.start_time} is {drift} min from target — should have been skipped"
                )


def test_every_workout_followed_by_shower(week_blocks):
    days = _by_day(week_blocks)
    for day, blocks in days.items():
        workout_days = [b for b in blocks if b.block_type in ("gym", "muay_thai")]
        if workout_days:
            assert any(b.block_type == "shower" for b in blocks), f"{day}: workout day without shower"
