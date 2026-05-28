import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import users, weekly_preferences, tasks, schedule_blocks, completions, schedules

app = FastAPI(title="Sunday API", version="1.0.0")

_ALWAYS_ALLOWED = [
    "https://sunday-app.pages.dev",
    "http://localhost:3000",
    "http://localhost:3001",
]
_raw_origins = os.getenv("ALLOWED_ORIGINS", "")
_env_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]
_allowed_origins = list(dict.fromkeys(_ALWAYS_ALLOWED + _env_origins))  # deduplicated, order preserved

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
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


@app.on_event("startup")
def on_startup():
    from migrate import run_migrations
    run_migrations()


@app.get("/health")
def health():
    return {"status": "ok"}
