from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import users, weekly_preferences, tasks, schedule_blocks, completions, schedules

app = FastAPI(title="Sunday API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_PREFIX = "/api/v1"

app.include_router(users.router, prefix=API_PREFIX)
app.include_router(weekly_preferences.router, prefix=API_PREFIX)
app.include_router(tasks.router, prefix=API_PREFIX)
app.include_router(schedule_blocks.router, prefix=API_PREFIX)
app.include_router(completions.router, prefix=API_PREFIX)
app.include_router(schedules.router, prefix=API_PREFIX)


def _seed_default_user():
    from app.database import SessionLocal
    from app.models.user import User
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.id == 1).first()
        if not existing:
            db.add(User(
                id=1,
                name="Default User",
                email="user@sunday.app",
                timezone="America/Chicago",
            ))
            db.commit()
            print("[startup] Default user created (id=1)")
        else:
            print("[startup] Default user already exists")
    except Exception as e:
        print(f"[startup] User seed failed: {e}")
        db.rollback()
    finally:
        db.close()


@app.on_event("startup")
def on_startup():
    from migrate import run_migrations
    run_migrations()      # tables must exist before seeding
    _seed_default_user()


@app.get("/health")
def health():
    return {"status": "ok"}
