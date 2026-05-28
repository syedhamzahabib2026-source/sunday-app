"""
Database migration script -- run once on any environment.
Safe to re-run: checks for existing columns before adding.
Adds:
  tasks     -> original_priority VARCHAR, bumped_from VARCHAR
  schedules -> created via create_all (new table)
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent / ".env")

from sqlalchemy import inspect, text
from app.database import engine, init_db


def column_names(table: str) -> set:
    return {col["name"] for col in inspect(engine).get_columns(table)}


def add_column_if_missing(table: str, column: str, definition: str):
    if column not in column_names(table):
        with engine.connect() as conn:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {definition}"))
            conn.commit()
        print(f"  + {table}.{column} added")
    else:
        print(f"  ok: {table}.{column} already exists")


def run():
    print("\n-- Step 1: Create any missing tables --")
    init_db()
    print("  ok: create_all complete")

    print("\n-- Step 2: Migrate tasks table --")
    add_column_if_missing("tasks", "original_priority", "VARCHAR")
    add_column_if_missing("tasks", "bumped_from", "VARCHAR")

    print("\n-- Step 3: Verify schema --")
    for table in ("tasks", "schedules"):
        cols = column_names(table)
        print(f"  {table}: {sorted(cols)}")

    print("\n-- Migration complete --\n")


if __name__ == "__main__":
    run()
