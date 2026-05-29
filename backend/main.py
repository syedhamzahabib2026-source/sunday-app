import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from app.routers import users, weekly_preferences, tasks, schedule_blocks, completions, schedules

app = FastAPI(title="Sunday API", version="1.0.0")

_allowed_origins = [
    "https://sunday-app.pages.dev",
    "https://sunday-app.pages.dev/",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
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


@app.options("/{rest_of_path:path}")
async def preflight_handler(rest_of_path: str):
    return Response(
        status_code=200,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PATCH, DELETE",
            "Access-Control-Allow-Headers": "*",
        },
    )
