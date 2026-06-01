import os
import threading
import time as _time
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import users, weekly_preferences, tasks, schedule_blocks, completions, schedules
from app.routers import locations, auth as auth_router

app = FastAPI(title="Sunday API", version="2.0.0")

_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000")
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_PREFIX = "/api/v1"

app.include_router(auth_router.router, prefix=API_PREFIX)
app.include_router(users.router, prefix=API_PREFIX)
app.include_router(weekly_preferences.router, prefix=API_PREFIX)
app.include_router(tasks.router, prefix=API_PREFIX)
app.include_router(schedule_blocks.router, prefix=API_PREFIX)
app.include_router(completions.router, prefix=API_PREFIX)
app.include_router(schedules.router, prefix=API_PREFIX)
app.include_router(locations.router, prefix=API_PREFIX)


def _lifecycle_loop():
    """Background thread: every 5 min, activate pending schedules at Sunday midnight."""
    while True:
        _time.sleep(300)
        try:
            from datetime import datetime, timedelta
            from app.database import SessionLocal
            from app.models.schedule import Schedule
            now = datetime.utcnow()
            if now.weekday() == 6 and now.hour == 0 and now.minute < 10:
                db = SessionLocal()
                next_monday = now.date() + timedelta(days=1)
                updated = (
                    db.query(Schedule)
                    .filter(Schedule.week_start_date == next_monday, Schedule.status == "pending")
                    .update({"status": "active"}, synchronize_session=False)
                )
                if updated:
                    db.commit()
                    print(f"[lifecycle] Activated {updated} pending schedule(s) for {next_monday}")
                db.close()
        except Exception as e:
            print(f"[lifecycle] Background error: {e}")


@app.on_event("startup")
def on_startup():
    from migrate import run_migrations
    run_migrations()
    t = threading.Thread(target=_lifecycle_loop, daemon=True)
    t.start()
    print("[startup] Lifecycle activation thread started")


@app.get("/health")
def health():
    return {"status": "ok"}
