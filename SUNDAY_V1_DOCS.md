# Sunday V1 — Complete Documentation

---

## What Sunday Is

Sunday is an AI-powered weekly life-planning assistant. It generates a full 7-day schedule around your fixed life constraints (sleep, routines, workouts, commute, meals) and then fits your tasks into the remaining gaps. When plans change, it reorganizes intelligently — displacing lower-priority tasks to make room for higher-priority ones, and asking for confirmation before making disruptive changes.

The primary interface is a **Slack bot** driven by natural language. A **web dashboard** provides a visual week view and setup wizard. There is no mobile app in V1.

---

## Live URLs

| Service | URL |
|---|---|
| Frontend (Cloudflare Pages) | https://sunday-app.pages.dev |
| Backend API (Railway) | https://sunday-app-production-d774.up.railway.app |
| API health check | https://sunday-app-production-d774.up.railway.app/health |
| Interactive API docs | https://sunday-app-production-d774.up.railway.app/docs |

---

## Tech Stack

### Backend
- **Python 3.x** with **FastAPI 0.136** — REST API, port 8080 (local) / `$PORT` (Railway)
- **SQLAlchemy 2.0** — ORM, supports SQLite (local dev) and PostgreSQL (production)
- **SQLite** locally (`backend/sunday.db`), **PostgreSQL** on Railway
- **slack-bolt 1.28** — Slack Socket Mode bot
- **anthropic 0.104** — Claude Sonnet 4.6 for intent parsing and natural language extraction
- **python-dotenv** — environment variable loading
- **uvicorn 0.48** — ASGI server
- **psycopg2-binary 2.9** — PostgreSQL driver

### Frontend
- **Next.js 14** (App Router) with **TypeScript**
- **TailwindCSS** — styling
- **shadcn/ui** — component primitives
- **Static export** (`output: "export"`) for Cloudflare Pages deployment
- Fonts: **Inter** (dark app), **DM Sans** (setup wizard) via `next/font/google`

### Infrastructure
- **Railway** — backend API + bot worker (two services, same repo)
- **Cloudflare Pages** — frontend static hosting
- **GitHub** (`syedhamzahabib2026-source/sunday-app`) — source of truth, auto-deploys both

---

## Architecture Overview

```
GitHub (main branch)
  │
  ├── push → Railway (backend/)
  │            ├── sunday-api: uvicorn main:app --host 0.0.0.0 --port $PORT
  │            └── sunday-bot: python run_bot.py
  │
  └── push → Cloudflare Pages (frontend/)
               └── npm run build → static export → sunday-app.pages.dev
```

**Request flow:**
```
User (Slack) → Slack API → sunday-bot (Socket Mode)
                              └── HTTP calls → FastAPI → SQLAlchemy → PostgreSQL

User (browser) → sunday-app.pages.dev → fetch() → FastAPI → PostgreSQL
```

**Single user model:** All data is scoped to `user_id = 1`. The test user is created automatically by `run_bot.py` on first start.

---

## All Features Built in V1

### Web App
- **Today page** (`/`) — scrollable list of today's blocks with Complete / Miss actions, live confidence score (% of waking hours scheduled), overload banner, empty state with link to setup
- **Week page** (`/week`) — 7-column grid, prev/next week navigation, "Today" shortcut button, archived weeks list below the grid (click to view read-only, delete with confirmation)
- **Setup wizard** (`/setup`) — full-screen white wizard (Motion.so style), collects all preferences and initial tasks, generates first schedule on completion

### Slack Bot
- Natural language intent parsing via Claude Sonnet 4.6
- Multi-turn conversation flows (add task, pick task, add event, confirm reorganization)
- Keyword fallback when Claude is unavailable
- All intents listed in the Slack Bot section below

### Scheduling
- Full 7-day schedule generation from preferences
- Smart reorganization with priority cascade bumping
- Fixed event blocking (shifts, appointments, travel) with warning mode
- Schedule lifecycle: pending → active → archived

### Infrastructure
- Auto-migrations on every startup (`run_migrations()`)
- CORS locked to `pages.dev` and localhost
- `postgres://` → `postgresql://` URL fix for Railway compatibility
- All secrets in environment variables, `.env.example` provided

---

## How The Scheduling Engine Works

**File:** `backend/app/engines/scheduler.py`

The engine works on a **30-minute slot grid**: 48 slots per day (index 0 = 00:00, index 47 = 23:30). It builds a boolean `time_map[7][48]` and marks slots occupied as it places blocks.

### Placement order (strict priority)

1. **Sleep** — `00:00 → wake_time` and `bedtime → 00:00`, marked `is_locked=True`
2. **Morning routine** — immediately after wake, duration from preferences
3. **Night routine** — just before bedtime, pre-marked in time_map
4. **Commute** — weekdays only, when `is_remote=False`:
   - Morning: right after morning routine
   - Evening: targets 17:30 (slot 35), scans backward if needed
5. **Meals** — breakfast (after morning block), lunch (~12:30), dinner (~19:00), based on `meals_per_day`
6. **Gym** — preferred days: Mon/Wed/Fri first, then Tue/Thu/Sat/Sun. Target window: 13:00 onwards. Duration from `gym_duration_mins` (default 75 min).
7. **Muay Thai** — preferred days: Tue/Thu first, then Mon/Wed/Fri/Sat/Sun. Duration from `muay_thai_duration_mins` (default 90 min).
8. **Tasks** — sorted by priority (`critical=0, high=1, medium=2, low=3, optional=4`), placed first-fit across the week in the window between end-of-morning-routine and start-of-night-routine

### Key functions

```python
time_to_slot("14:30")  # → 29
slot_to_time(29)       # → "14:30"
slots_needed(75)       # → 3  (ceiling-divide, min 1)
find_free_slot(time_map, day, count, start_from, end_before)  # first-fit search
```

### On completion

- All existing blocks for the week are deleted first (idempotent re-generation)
- Placed tasks are promoted to `status="scheduled"`
- Returns `{week_start, blocks, is_overloaded, unscheduled_tasks}`

---

## How The Reorganization Engine Works

Two reorganizers exist:

### Simple reorganizer (`backend/app/engines/reorganizer.py`)
Called by `POST /api/v1/schedule/reorganize`. Used after task completion, cancellation, or manual trigger.

**Cut point:** current time. All blocks before the cut are frozen (past or locked). All future non-task blocks are rebuilt. Tasks are re-placed in priority order using first-fit.

**Cascade behavior (simple):** none — tasks either fit or go to `tasks_dropped`.

**Returns:** `{blocks_cleared, blocks_created, tasks_rescheduled, tasks_dropped, deadline_at_risk, is_overloaded, reorganization_log_id}`

### Smart reorganizer (`backend/app/engines/smart_reorganizer.py`)
Called by `POST /api/v1/schedules/event` when a new fixed event displaces existing task blocks.

**Algorithm — for each displaced task (critical priority first):**

**STEP 1 — Empty slot first:**
Scan all future days before the task's deadline. If any contiguous free slot fits the task → place it there. Done.

**STEP 2 — No empty slot: cascade bump:**
Find a task at exactly one priority level lower that is currently placed in the schedule:

| Task priority | Can displace |
|---|---|
| `high` | `medium` |
| `medium` | `low` |
| `low` | `optional` |
| `critical` | never bumped — warning issued |
| `optional` | always dropped |

Take the lower task's slot. The lower task is then recursively processed (it tries STEP 1, then STEP 2 again, up to depth 6).

**SPECIAL CASE:** If a `critical` or `high` task conflicts but fits in an *earlier slot on the same day*, it is moved there automatically without displacing anyone.

**STEP 3 — Deadline check:** Every slot candidate is validated against the task's deadline before placement. A slot after the deadline is skipped.

**STEP 4 — Warning mode:** The plan is computed as a dry run first. If any warnings exist (drops, displacements, deadline risks), the bot sends the warning message to Slack and waits for confirmation before applying.

**Warning message format:**
```
Here's what needs to change:
✅ Moving [task] → Wednesday 14:00–15:00
⚠️ [high-priority task] displaced [medium task]
🗑 [task] — no space left this week, dropped
Should I go ahead? Reply yes or no.
```

**Plan is NOT applied to the database until user confirms.** If no warnings, it applies immediately.

---

## How The Slack Bot Works

**File:** `backend/app/slack/bot.py`

The bot runs in **Socket Mode** (no public URL required). It uses Claude Sonnet 4.6 to parse every message into a structured intent + data JSON. If Claude is unavailable, it falls back to keyword routing.

### Intent parsing

Every message goes through `parse_intent(text)`, which calls Claude with a system prompt defining all possible intents. Claude returns:
```json
{"intent": "add_task", "data": {"title": "...", "duration_minutes": 60, "priority": "high", "deadline": null}, "confidence": "high", "missing_fields": []}
```

### All intents and what they do

| Intent | Trigger examples | Behavior |
|---|---|---|
| `add_task` | "add a task", "I need to buy groceries", "new task: write report" | Starts multi-turn flow collecting title → duration → priority → deadline, then saves and reorganizes |
| `my_tasks` | "my tasks", "list tasks", "what tasks do I have" | Shows all pending/scheduled/partial/missed tasks with status emoji |
| `my_schedule` | "my schedule", "what's on today", "today's schedule" | Shows today's full block list with emoji per block type |
| `day_query` | "what does Wednesday look like", "show me Friday" | Shows a specific day's schedule. Extracts `day` field, resolves to a date |
| `add_event` | "I picked up a shift Wednesday 2pm to 10pm", "dentist Thursday at 3, 1 hour" | Parses event name/day/start/end, runs smart reorganizer in dry-run, sends warning if needed, waits for confirmation |
| `complete_task` | "complete", "done", "mark X as done" | Fuzzy-matches task title; if confident, marks complete + locks block + reorganizes. If unclear, shows numbered pick list |
| `cancel_task` | "cancel task", "remove X" | Fuzzy-match or pick list, marks cancelled + reorganizes |
| `missed_task` | "missed", "I didn't do X" | Fuzzy-match or pick list, marks missed + reorganizes |
| `reschedule` | "reschedule", "reorganize my week" | Runs reorganizer, reports blocks rebuilt/placed/dropped |
| `generate_schedule` | "generate schedule", "build my week" | Generates full week from next Monday, reports block count |
| `help` | "help", "what can you do" | Shows help text with all commands |
| `cancel_flow` | "cancel", "stop", "nevermind", "go back" | Clears any active conversation flow |
| `unknown` | anything unrecognized | In DMs: "I didn't catch that. Type help." |

### Multi-turn conversation flows

**`add_task` flow:** (up to 4 turns)
1. Ask task name (if not extracted)
2. Ask duration (if not extracted) — handles "45 min", "1 hour", plain numbers
3. Ask priority (if not extracted) — validates against `critical/high/medium/low/optional`
4. Ask deadline — uses Claude to parse natural language dates; accepts "no deadline", "skip", "tomorrow", day names, ISO dates

**`add_event` flow:** (up to 2 turns if info missing)
1. Ask start time if not parsed
2. Ask duration if end time not determined
Then runs warning flow.

**`confirm_reorg` flow:** (1 turn)
After warning message is sent, bot waits for: `yes/y/yep/sure/ok/confirm` → apply changes, or `no/n/nope/cancel` → discard.

**`complete/cancel/missed` pick flows:** (1 turn)
Shows numbered list of active tasks, user replies with a number.

### In-memory state

`conversation_state: dict[slack_user_id, {flow, step, data}]` — stored in process memory, cleared on bot restart.

### Claude helper calls

Beyond intent parsing, Claude is also called for:
- `_parse_deadline_text(text)` — converts "next Friday", "May 30" to ISO date
- `_extract_duration_minutes(text)` — extracts integer minutes from natural language

---

## Setup Wizard — All Steps

**File:** `frontend/app/setup/page.tsx`

The wizard is a full-screen white overlay at `/setup`. It starts with a mode selector, then runs through steps. On completion, it saves preferences and generates the first schedule.

### Mode selection (before steps)

| Mode | Steps | Description |
|---|---|---|
| **Manual** | 7 steps | User sets all sleep/routine/workout/commute preferences |
| **AI** | 2 steps | Sunday uses defaults; user just adds tasks and optional context |

### Manual mode steps (7 total)

**Step 1 — Sleep**
- Bedtime time picker (15-min increments)
- Wake time time picker (15-min increments)
- Live sleep hours indicator (green ≥7h, amber <7h)

**Step 2 — Daily Rhythm**
- Morning routine duration (stepper, 10–120 min)
- Night routine duration (stepper, 5–60 min)
- Shower duration (stepper, 5–30 min)
- Shower preference: Morning / Night / Both
- Meals per day: 1–4 (chip picker)
- Average meal duration (stepper, 10–60 min)
- Meal prep days (multi-select day chips)

**Step 3 — Movement**
- Gym days per week: 0–7 (chip picker)
- Gym session duration (stepper, 30–180 min, if days > 0)
- Muay Thai days per week: 0–7
- Muay Thai session duration (stepper, 45–180 min, if days > 0)
- Preferred workout time: Morning / Afternoon / Evening (if any workout)

**Step 4 — Location**
- Work arrangement: In person / Remote
- If in-person: location name (text input), commute each way (stepper, 5–180 min), days on-site per week (chip picker)

**Step 5 — Capacity**
- Weekly task capacity slider (5–60 hrs/week)
- Energy preference: Front-load (hard work Mon–Wed) / Spread evenly
- Fixed commitments (repeating events): add name + time + duration + days, displayed as list

**Step 6 — Tasks**
- Add initial tasks with: title, duration (15 min increments), priority (chip), timing preference (AI decide / manual with day + time-of-day)
- At least one task required to continue

**Step 7 — Free text**
- Optional context field: "Low energy Wednesday, dentist Thursday 2pm..."

### AI mode steps (2 total)

Step 1: Tasks (same as Manual step 6)
Step 2: Free text (same as Manual step 7)

### On "Generate my week"

1. Saves `WeeklyPreferences` to `/api/v1/preferences/`
2. Creates each task via `POST /api/v1/tasks/`
3. Calls `POST /api/v1/schedule/generate` for next Monday's week
4. Shows animated loading messages while generating
5. Redirects to `/week` on success

---

## Schedule Lifecycle (pending/active/archived)

**Model:** `backend/app/models/schedule.py`
**Router:** `backend/app/routers/schedules.py`

Each week has one `Schedule` record tracking its state.

### States

| Status | Meaning |
|---|---|
| `pending` | Generated on a Sunday for the upcoming week. Not yet running. |
| `active` | The current live schedule being worked from. |
| `archived` | A past week. Read-only. Visible in the /week page archive list. |

### Transition rules

| Trigger | Transition |
|---|---|
| Generated on a **Sunday** for next week | → `pending` |
| Generated on **any other day** | → `active` |
| **Monday arrives** (checked on any API call via `_maybe_run_lifecycle`) | `pending` → `active`, last week's `active` → `archived` |
| User **deletes** an archived schedule | Record + all its blocks deleted |

The lifecycle check (`_maybe_run_lifecycle`) runs automatically on:
- `GET /schedules/{user_id}/archived`
- `GET /schedules/{user_id}/all`
- `POST /schedules/lifecycle/transition`

### Archive UI (/week page)

- Archived weeks appear below the main 7-column grid under "Past Weeks"
- Click a past week label → loads its blocks in a read-only (opacity-70, pointer-events-none) grid
- Each archived week has a delete button with inline "Delete? Yes / No" confirmation
- Deleting removes both the `Schedule` record and all `ScheduleBlock` rows for that week

---

## Database Schema — All Tables and Columns

### `users`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `name` | VARCHAR | |
| `email` | VARCHAR UNIQUE | |
| `timezone` | VARCHAR | default "America/Chicago" |
| `created_at` | DATETIME | |

### `tasks`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `user_id` | INTEGER FK → users | |
| `title` | VARCHAR | |
| `duration_minutes` | INTEGER | |
| `deadline` | DATETIME | nullable |
| `priority` | VARCHAR | critical / high / medium / low / optional |
| `location` | VARCHAR | nullable |
| `energy_level` | VARCHAR | high / medium / low |
| `is_flexible` | BOOLEAN | default True |
| `status` | VARCHAR | pending / scheduled / complete / partial / missed / cancelled |
| `timing_preference` | VARCHAR | ai_decide / morning / afternoon / evening |
| `preferred_days` | VARCHAR | JSON-encoded list, nullable |
| `original_priority` | VARCHAR | set at creation, not changed by bumping |
| `bumped_from` | VARCHAR | title of task that displaced this one |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | auto-updated on write |

### `schedule_blocks`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `user_id` | INTEGER FK → users | |
| `task_id` | INTEGER FK → tasks | nullable |
| `block_type` | VARCHAR | task / sleep / meal / commute / gym / muay_thai / routine / buffer / event |
| `title` | VARCHAR | |
| `start_time` | VARCHAR | "HH:MM" |
| `end_time` | VARCHAR | "HH:MM" ("00:00" = midnight end) |
| `date` | DATE | |
| `is_locked` | BOOLEAN | locked blocks never moved by reorganizer |
| `priority` | VARCHAR | nullable, copied from task |
| `created_at` | DATETIME | |

### `schedules`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `user_id` | INTEGER FK → users | |
| `week_start_date` | DATE | always a Monday |
| `status` | VARCHAR | pending / active / archived, default "active" |
| `week_label` | VARCHAR | "Week of May 26", nullable |
| `archived_at` | DATETIME | set when status → archived |
| `created_at` | DATETIME | |

### `weekly_preferences`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `user_id` | INTEGER FK → users | |
| `week_start_date` | DATE | |
| `sleep_target_hours` | FLOAT | default 8.0 |
| `preferred_bedtime` | VARCHAR | "HH:MM", default "23:30" |
| `preferred_wake_time` | VARCHAR | "HH:MM", default "07:30" |
| `morning_routine_mins` | INTEGER | default 30 |
| `night_routine_mins` | INTEGER | default 20 |
| `shower_mins` | INTEGER | default 15 |
| `shower_preference` | VARCHAR | morning / night / both |
| `meals_per_day` | INTEGER | default 2 |
| `meal_duration_mins` | INTEGER | default 20 |
| `meal_prep_days` | TEXT | JSON-encoded list of day names |
| `gym_days_per_week` | INTEGER | default 3 |
| `gym_duration_mins` | INTEGER | default 75 |
| `muay_thai_days_per_week` | INTEGER | default 2 |
| `muay_thai_duration_mins` | INTEGER | default 90 |
| `workout_time_preference` | VARCHAR | morning / afternoon / evening |
| `commute_minutes` | INTEGER | default 30 |
| `is_remote` | BOOLEAN | default False |
| `work_days_per_week` | INTEGER | default 5 |
| `work_location_name` | VARCHAR | nullable |
| `weekly_task_capacity_hours` | FLOAT | default 40.0 |
| `energy_preference` | VARCHAR | front_load / spread_out |
| `fixed_commitments` | TEXT | JSON-encoded list of commitment objects |
| `notes` | TEXT | nullable |
| `mode` | VARCHAR | ai / manual, default "manual" |
| `extra_context` | TEXT | nullable free-text |
| `created_at` | DATETIME | |

### `completion_records`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `user_id` | INTEGER FK → users | |
| `schedule_block_id` | INTEGER FK → schedule_blocks | |
| `task_id` | INTEGER FK → tasks | nullable |
| `status` | VARCHAR | complete / partial / missed / cancelled |
| `completed_at` | DATETIME | nullable |
| `notes` | VARCHAR | nullable |
| `created_at` | DATETIME | |

### `reorganization_logs`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `user_id` | INTEGER FK → users | |
| `triggered_at` | DATETIME | |
| `reason` | VARCHAR | manual / task_complete / task_missed / event_add / etc. |
| `blocks_cleared` | INTEGER | |
| `blocks_created` | INTEGER | |
| `tasks_rescheduled` | INTEGER | |
| `tasks_dropped` | INTEGER | |

---

## API Endpoints — All Routes

Base URL: `https://sunday-app-production-d774.up.railway.app/api/v1`

### Users — `/users`
| Method | Path | Description |
|---|---|---|
| `POST` | `/users/` | Create user |
| `GET` | `/users/` | List all users |
| `GET` | `/users/{user_id}` | Get user by ID |

### Tasks — `/tasks`
| Method | Path | Description |
|---|---|---|
| `POST` | `/tasks/` | Create task |
| `GET` | `/tasks/{user_id}` | List all tasks for user |
| `GET` | `/tasks/{user_id}/pending` | List pending tasks only |
| `PATCH` | `/tasks/{task_id}/status` | Update task status |
| `DELETE` | `/tasks/{task_id}` | Cancel task (sets status=cancelled) |

### Schedule Blocks — `/schedule`
| Method | Path | Description |
|---|---|---|
| `POST` | `/schedule/` | Create a single block |
| `GET` | `/schedule/{user_id}/week/{week_start}` | Get all blocks for a week |
| `GET` | `/schedule/{user_id}/day/{day}` | Get all blocks for a day |
| `DELETE` | `/schedule/block/{block_id}` | Delete a single block |
| `PATCH` | `/schedule/{block_id}/lock` | Lock a block (is_locked=True) |
| `POST` | `/schedule/generate` | Generate full week schedule |
| `POST` | `/schedule/reorganize` | Rebuild future schedule from now |

### Schedules (Lifecycle) — `/schedules`
| Method | Path | Description |
|---|---|---|
| `GET` | `/schedules/{user_id}/archived` | List archived schedule records |
| `GET` | `/schedules/{user_id}/all` | List all schedule records |
| `GET` | `/schedules/week/{user_id}/{week_start}` | Get blocks for an archived week |
| `DELETE` | `/schedules/{schedule_id}` | Delete archived schedule + blocks |
| `POST` | `/schedules/lifecycle/transition` | Manually trigger Mon midnight transition |
| `POST` | `/schedules/generate` | Generate with lifecycle status tracking |
| `POST` | `/schedules/event` | Add fixed event block (dry_run or apply) |

### Weekly Preferences — `/preferences`
| Method | Path | Description |
|---|---|---|
| `POST` | `/preferences/` | Create preferences record |
| `GET` | `/preferences/{user_id}/current` | Get most recent preferences |
| `PUT` | `/preferences/{pref_id}` | Update preferences |

### Completions — `/completions`
| Method | Path | Description |
|---|---|---|
| `POST` | `/completions/` | Create completion record |
| `GET` | `/completions/{user_id}` | List all completions |
| `GET` | `/completions/{user_id}/week/{week_start}` | List completions for a week |

### Root
| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check, returns `{"status": "ok"}` |

---

## Environment Variables Required

### API service `sunday-app` (Railway)
| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Reference `${{Postgres.DATABASE_URL}}`. `postgres://` is auto-fixed to `postgresql://` on startup. |
| `JWT_SECRET_KEY` | Yes | Reference `${{Postgres.JWT_SECRET_KEY}}` — single source shared with the bot so bot-minted tokens validate. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | Yes | Google OAuth sign-in + Calendar sync. |
| `BACKEND_URL` / `FRONTEND_URL` | Yes | Used in OAuth redirects. |
| `ALLOWED_ORIGINS` | Optional | Comma-separated additional CORS origins. `https://sunday-app.pages.dev` and `localhost:3000/3001` are always allowed hardcoded. |

### Bot service `sunday-bot` (Railway — root dir `backend`, start `python run_bot.py`)
| Variable | Required | Description |
|---|---|---|
| `SLACK_BOT_TOKEN` | Yes | `xoxb-...` from Slack app OAuth page |
| `SLACK_SIGNING_SECRET` | Yes | From Slack app → Basic Information |
| `SLACK_APP_TOKEN` | Yes | `xapp-...` from Slack app → Socket Mode (enables bot socket connection) |
| `ANTHROPIC_API_KEY` | Yes | For Claude intent parsing and date/duration extraction |
| `API_BASE_URL` | Yes | Full URL to FastAPI, e.g. `https://sunday-app-production-d774.up.railway.app/api/v1`. Bot defaults to `http://localhost:8080/api/v1` if unset. |
| `BOT_USER_ID` | Yes | The real user's `users.id` the bot acts as (production: `3`; the seed test user is `4`). |
| `DATABASE_URL` | Yes | Reference `${{Postgres.DATABASE_URL}}`. |
| `JWT_SECRET_KEY` | Yes | Reference `${{Postgres.JWT_SECRET_KEY}}` — must match the API service or every bot API call 401s. |
| `PYTHONUNBUFFERED` | Yes | `1` — without it Python prints never reach Railway deploy logs. |

**Slack app config** (api.slack.com → app `Sunday`): Socket Mode ON; bot events `app_mention`, `message.channels`, `message.im`, `message.groups` (private channels — added Jul 2026, requires app reinstall to take effect).

### Frontend (Cloudflare Pages)
| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Yes | Railway backend URL without `/api/v1`, e.g. `https://sunday-app-production-d774.up.railway.app`. Falls back to `http://localhost:8080` if unset. |

---

## How Auto-Deploy Works (GitHub → Railway / Cloudflare)

### Backend (Railway)
1. Push to `main` branch on GitHub
2. Railway detects the push via webhook
3. Railway pulls `backend/` (root directory configured in Railway settings)
4. Nixpacks builds the Python environment from `requirements.txt`
5. Railway runs: `uvicorn main:app --host 0.0.0.0 --port $PORT`
6. FastAPI startup event fires `run_migrations()` automatically
7. Service is live

**Bot service** (`sunday-bot`, start command `python run_bot.py`) is a second Railway service pointing at the same repo with root dir `backend`. It rebuilds automatically on push. Note: `railway.toml` / `Procfile` do NOT create this service — it was created manually in the Railway dashboard (Jul 2026).

### Backend tests
From `backend/`: `python -m pytest tests/test_scheduler.py -q` — invariant suite for the weekly generator (no overlapping blocks, exact per-job commute minutes, MT at preferred time, split labels in calendar order, meals within ±2.5h of target or skipped, showers after workouts). Requires `pip install pytest` (not in requirements.txt to keep the deploy image lean).

### Frontend (Cloudflare Pages)
1. Push to `main` branch on GitHub
2. Cloudflare Pages detects the push
3. Build runs: `npm run build` inside `frontend/` (root directory configured in Cloudflare)
4. Output goes to `frontend/.next` → served as static files
5. `NEXT_PUBLIC_API_URL` is baked in at build time

---

## How Auto-Migrations Work

**Files:** `backend/migrate.py`, `backend/main.py`

### On every startup

```python
# main.py
@app.on_event("startup")
def on_startup():
    from migrate import run_migrations
    run_migrations()
```

`run_migrations()` does three things in order:

1. **`init_db()`** — calls SQLAlchemy `Base.metadata.create_all()`. Creates any tables that don't exist yet (new models added to `app/models/`). Does nothing for existing tables.

2. **`_add_column_if_missing(table, column, definition)`** — checks `inspect(engine).get_columns(table)` before issuing `ALTER TABLE`. If the column already exists, prints `ok:` and skips. If missing, runs the ALTER and prints `+ added`. Wraps in try/except to survive concurrent startups on multi-worker deployments.

3. **Verify and log** — prints column lists for `tasks` and `schedules` to the Railway log for confirmation.

### How to add future migrations

```python
# In run_migrations() in migrate.py:
_add_column_if_missing("tasks",     "new_column",   "VARCHAR")
_add_column_if_missing("schedules", "another_col",  "INTEGER DEFAULT 0")
```

For new tables: add the SQLAlchemy model to `backend/app/models/`, import it in `init_db()` inside `database.py`. `create_all()` handles the rest on next deploy.

### Standalone use

```bash
cd backend
python migrate.py
```

Loads `.env` locally and runs the same `run_migrations()`. Safe to run at any time.

---

## Known Limitations (Save for V2)

1. **Single user only.** `USER_ID = 1` is hardcoded in the bot and frontend. No authentication, no registration flow for additional users.

2. **Bot state is in-memory.** `conversation_state` is a plain Python dict in the bot process. Restarting the bot clears all active flows. Users mid-conversation lose their state.

3. **Schedule lifecycle runs on API calls, not a cron.** The `_maybe_run_lifecycle()` function (Monday transition: pending→active, active→archived) only fires when certain API endpoints are hit. If no requests come in on Monday, the transition is delayed until the next request.

4. **No real-time updates.** The web app polls on page load only. Changes made via Slack (task added, event blocked) are not pushed to any open browser tabs.

5. **`event` block type not rendered with a distinct style in the DayColumn UI.** It falls back to the default calendar emoji and no special card treatment.

6. **Fixed commitments saved in preferences are not actually blocked in the schedule.** The wizard collects them and stores them as JSON in `weekly_preferences.fixed_commitments`, but the scheduler does not currently read and block them.

7. **No calendar sync.** Events on Google Calendar, Outlook, etc. are not imported. All events must be told to the bot manually.

8. **All times are stored without timezone info.** The app uses the server's local time. The `timezone` column on the `User` model exists but is not applied to scheduling logic.

9. **`original_priority` is not automatically set on task creation.** The column was added via migration but the task creation endpoint doesn't populate it; it stays `null` unless explicitly set.

10. **The Slack bot uses `model="claude-sonnet-4-6"` hardcoded.** No model selection or fallback to a cheaper model for simpler intents.

---

## V2 Ideas

- **Multi-user support** with proper authentication (OAuth / magic link), user registration, and per-user data isolation
- **True cron job** for Sunday midnight schedule generation and Monday lifecycle transitions (Railway cron or a scheduled task)
- **Real-time updates** via WebSockets or Server-Sent Events — Slack changes reflect instantly in the browser
- **Calendar sync** — import events from Google Calendar / Apple Calendar as fixed blocks automatically
- **Timezone-aware scheduling** — apply each user's `timezone` to all time calculations
- **Richer DayColumn UI** — distinct rendering for `event` blocks, drag-to-reschedule, click-to-complete
- **Populate `original_priority`** on task creation so bump history is fully tracked
- **Honour fixed commitments** — read `weekly_preferences.fixed_commitments` in the scheduler and block those slots
- **Task recurrence** — "gym every Monday/Wednesday/Friday" as a repeating task rather than a fixed block
- **Weekly review flow** in Slack — Sunday morning check-in: "Last week: X tasks done, Y missed. Ready to build this week?"
- **AI mode scheduling** — let Claude decide bedtime, wake time, and workout slots based on user goals rather than explicit preferences
- **Partial completion tracking** — mark a task as half-done, have the reorganizer split the remaining time into a new block
- **Cheaper model routing** — use Haiku for duration extraction and date parsing, reserve Sonnet for full intent parsing

---

## Reorganization Engine — Full Logic

**File:** `backend/app/engines/scheduler.py` — `reorganize_missed_task()`

When a task is marked as Missed, Sunday runs the full rescheduler:

### Priority rules

| Priority | Behavior |
|---|---|
| `optional` | Always dropped — never rescheduled |
| `low` | Reschedule only if a free slot exists today or tomorrow |
| `medium` | Reschedule within the week, same time-of-day preferred |
| `high` | Reschedule ASAP, any available slot |
| `critical` | Reschedule ASAP; if no slot found → `needs_attention` flag |

### Slot scoring (lower = better)

| Condition | Score delta |
|---|---|
| Today | 0 |
| Tomorrow | +1 |
| Day after tomorrow | +2 |
| Each additional day | +day_offset |
| Late-night slot (after 10 PM) | +2 |
| Adjacent to a meal time (±30 min of 8am/12:30pm/7pm) | +1 |
| Matches original time-of-day period (morning/afternoon/evening) | −1 |
| Past deadline | Slot disqualified entirely |

### Drop conditions

- Deadline already passed at time of marking
- Priority is `optional`
- Priority is `low` and no slot found today or tomorrow
- Priority is `medium` and no slot found before deadline/week-end
- No slot found before deadline (medium and below)

### `needs_attention` flag

When `critical` or `high` priority tasks have no available slot:
- `reorganize_missed_task()` returns `{rescheduled: false, reason: "needs_attention"}`
- Frontend shows a red toast: "[Task name] — no slot found! Needs your attention."
- No block is created; user must manually reorganize or extend the deadline
