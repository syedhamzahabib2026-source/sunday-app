"""
Database migrations -- runs automatically on every app startup via main.py.
Also runnable standalone: python migrate.py

To add future schema changes: drop a new _add_column_if_missing() call
inside run_migrations(). It will be applied on next deploy, no manual steps.
"""
import sys
from pathlib import Path

# Needed when running standalone; no-op when imported from within the running app
_here = Path(__file__).resolve().parent
if str(_here) not in sys.path:
    sys.path.insert(0, str(_here))

from sqlalchemy import inspect, text
from app.database import engine, init_db


def _column_names(table: str) -> set:
    return {col["name"] for col in inspect(engine).get_columns(table)}


def _add_column_if_missing(table: str, column: str, definition: str) -> None:
    if column in _column_names(table):
        print(f"  [migrate] ok: {table}.{column}")
        return
    try:
        with engine.connect() as conn:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {definition}"))
            conn.commit()
        print(f"  [migrate] + {table}.{column} added")
    except Exception as exc:
        # Swallow "duplicate column" errors from concurrent startups or
        # databases that don't support IF NOT EXISTS on ALTER TABLE
        print(f"  [migrate] skipped {table}.{column} ({exc})")


def run_migrations() -> None:
    """
    Idempotent. Safe to call on every startup even if nothing has changed.

    HOW TO ADD FUTURE MIGRATIONS:
      _add_column_if_missing("table_name", "column_name", "VARCHAR")
      _add_column_if_missing("table_name", "other_col",  "INTEGER DEFAULT 0")
    New tables: add the SQLAlchemy model to app/models/ and import it in
    app/database.py init_db() — create_all() below handles the rest.
    """
    # 1. Create any new tables defined in SQLAlchemy models
    init_db()

    # 2. Columns added after initial schema (ALTER TABLE, idempotent)
    _add_column_if_missing("tasks", "original_priority", "VARCHAR")
    _add_column_if_missing("tasks", "bumped_from",       "VARCHAR")
    _add_column_if_missing("tasks",               "fixed_start_time",  "VARCHAR")
    _add_column_if_missing("tasks",               "fixed_end_time",    "VARCHAR")
    _add_column_if_missing("tasks",               "commute_minutes",   "INTEGER DEFAULT 0")
    _add_column_if_missing("weekly_preferences",  "scheduling_notes",  "TEXT")
    _add_column_if_missing("schedule_blocks",     "status",            "VARCHAR")
    _add_column_if_missing("schedule_blocks",     "is_rescheduled",    "BOOLEAN DEFAULT FALSE")

    print("  [migrate] all migrations applied")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv(_here / ".env")
    run_migrations()
