"""
Google Calendar sync service.
Called as a FastAPI BackgroundTask after schedule generation so it never
blocks the API response.
"""
import os
from datetime import datetime, timedelta, date
from typing import List

import httpx
from sqlalchemy.orm import Session

_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
_CALENDAR_EVENTS  = "https://www.googleapis.com/calendar/v3/calendars/primary/events"

# Google Calendar colorId per block type
_COLOR = {
    "sleep":     "8",   # Graphite
    "meal":      "5",   # Banana
    "gym":       "2",   # Sage
    "muay_thai": "4",   # Flamingo
    "commute":   "3",   # Grape
    "routine":   "8",   # Graphite
    "buffer":    "8",   # Graphite
    "task":      "7",   # Peacock
    "event":     "11",  # Tomato
    "deep_work": "9",   # Blueberry
}


def _refresh_if_needed(user, db: Session):
    """Return a valid access token, refreshing via refresh_token if needed."""
    if not user.google_access_token:
        return None

    now = datetime.utcnow()
    if user.google_token_expiry and user.google_token_expiry > now + timedelta(minutes=5):
        return user.google_access_token

    if not user.google_refresh_token:
        return None

    resp = httpx.post(_GOOGLE_TOKEN_URL, data={
        "client_id":     os.getenv("GOOGLE_CLIENT_ID", ""),
        "client_secret": os.getenv("GOOGLE_CLIENT_SECRET", ""),
        "refresh_token": user.google_refresh_token,
        "grant_type":    "refresh_token",
    })
    if resp.status_code != 200:
        return None
    data = resp.json()
    user.google_access_token  = data["access_token"]
    user.google_token_expiry  = now + timedelta(seconds=data.get("expires_in", 3600))
    db.commit()
    return user.google_access_token


def _end_datetime(block_date: date, end_time: str) -> str:
    """
    Handle midnight overflow: if end_time is "00:00" the event ends at the
    start of the following day.
    """
    if end_time == "00:00":
        next_day = block_date + timedelta(days=1)
        return f"{next_day}T00:00:00"
    return f"{block_date}T{end_time}:00"


def push_blocks_to_calendar(user_id: int, block_ids: List[int]) -> None:
    """
    Background task: push a list of schedule blocks to the user's Google
    Calendar. Stores the returned event ID on each block so it can be cleaned
    up on re-generation. Creates a fresh DB session so it is safe to call
    after the request session has closed.
    """
    from app.database import SessionLocal
    from app.models.user import User
    from app.models.schedule_block import ScheduleBlock

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return

        access_token = _refresh_if_needed(user, db)
        if not access_token:
            return

        blocks = db.query(ScheduleBlock).filter(ScheduleBlock.id.in_(block_ids)).all()
        tz = user.timezone or "UTC"

        with httpx.Client() as client:
            for block in blocks:
                start_dt = f"{block.date}T{block.start_time}:00"
                end_dt   = _end_datetime(block.date, block.end_time)
                color_id = _COLOR.get(block.block_type, "7")

                event = {
                    "summary":     block.title,
                    "description": f"Sunday · {block.block_type.replace('_', ' ').title()}",
                    "start":       {"dateTime": start_dt, "timeZone": tz},
                    "end":         {"dateTime": end_dt,   "timeZone": tz},
                    "colorId":     color_id,
                    "reminders":   {
                        "useDefault": False,
                        "overrides":  [{"method": "popup", "minutes": 10}],
                    },
                }
                resp = client.post(
                    _CALENDAR_EVENTS,
                    json=event,
                    headers={"Authorization": f"Bearer {access_token}"},
                )
                if resp.status_code in (200, 201):
                    event_data = resp.json()
                    block.google_event_id = event_data.get("id")

        db.commit()
    finally:
        db.close()


def delete_calendar_events(user_id: int, event_ids: List[str]) -> None:
    """
    Background task: delete a list of Google Calendar events by their event IDs.
    Called before re-generating a schedule to avoid duplicate calendar entries.
    """
    from app.database import SessionLocal
    from app.models.user import User

    if not event_ids:
        return

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return

        access_token = _refresh_if_needed(user, db)
        if not access_token:
            return

        with httpx.Client() as client:
            for event_id in event_ids:
                client.delete(
                    f"{_CALENDAR_EVENTS}/{event_id}",
                    headers={"Authorization": f"Bearer {access_token}"},
                )
    finally:
        db.close()
