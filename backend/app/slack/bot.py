import difflib
import json
import os
import re
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional

import requests
from dotenv import load_dotenv
from slack_bolt import App

load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

print(f"[DEBUG] ANTHROPIC_API_KEY loaded: {'YES' if os.getenv('ANTHROPIC_API_KEY') else 'NO - KEY MISSING'}")

app = App(
    token=os.environ["SLACK_BOT_TOKEN"],
    signing_secret=os.environ["SLACK_SIGNING_SECRET"],
)

BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000/api/v1")
USER_ID = 1

# Keyed by Slack user_id: {"flow": str, "step": str, "data": dict}
conversation_state: dict = {}

HELP_TEXT = """Here's what I can do:
• *add task* — Add a task (just describe it naturally!)
• *my tasks* — See all your pending tasks
• *complete* — Mark a task as done
• *cancel task* — Cancel a task
• *missed* — Mark a task as missed
• *my schedule* — See today's schedule
• *reschedule* — Trigger a schedule reorganization
• *generate schedule* — Build your schedule for this week
• *cancel* or *stop* — Abort the current action"""


# ── Claude intent parser ──────────────────────────────────────────────────────

_CLAUDE_SYSTEM = """\
You are the message parser for Sunday, a life scheduling assistant. \
Extract the user's intent and any structured data from their message.

Possible intents:
- add_task: user wants to add a NEW task (extract: title, duration_minutes, priority, deadline). \
Examples: "add a task", "I need to buy groceries", "remind me to call mom", "new task: write report"
- my_tasks: user wants to SEE their existing task list. \
Examples: "current tasks", "what tasks do I have", "show me tasks", "list tasks", "my tasks", "show tasks"
- my_schedule: user wants to SEE TODAY's schedule or calendar. \
Examples: "show me the schedule", "what's on my schedule today", "today's schedule", \
"show schedule", "what's on my schedule", "my schedule"
- day_query: user wants to see a SPECIFIC DAY's schedule (not today). \
Extract: day (e.g. "Wednesday", "Thursday", "tomorrow", "Friday"). \
Examples: "what does my Wednesday look like", "show me Thursday", "what's on Friday", \
"how does Tuesday look", "what's happening Saturday"
- add_event: user is adding a FIXED event to their calendar (shift, appointment, dentist, travel, etc). \
Extract: title, day, start_time (24h HH:MM), end_time (24h HH:MM, compute from duration if needed), duration_minutes. \
Examples: "I picked up a shift Wednesday 2pm to 10pm", "dentist Thursday at 3, 1 hour", \
"block off Friday afternoon for travel", "I have a meeting Monday 10am to 11:30am"
- complete_task: user wants to mark a task complete
- cancel_task: user wants to cancel a task
- missed_task: user wants to mark a task as missed
- reschedule: user wants to reorganize their schedule
- generate_schedule: user wants to generate a new weekly schedule
- help: user wants help
- cancel_flow: user wants to cancel current action (stop, cancel, quit, nevermind, go back)
- unknown: none of the above

IMPORTANT: "show me the schedule", "what's on my schedule", "today's schedule" → my_schedule (NOT add_task).
IMPORTANT: "current tasks", "list tasks", "show tasks" → my_tasks (NOT add_task).
IMPORTANT: "what does Wednesday look like", "show Thursday" → day_query (NOT my_schedule).
IMPORTANT: "I picked up a shift", "dentist appointment", "block off time" → add_event (NOT add_task).

Priority values: critical, high, medium, low, optional
If duration is given in hours convert to minutes.
If no priority stated, use "medium".
For add_event: convert times like "2pm" → "14:00", "3pm" → "15:00", "10am" → "10:00".
For add_event: if only start_time and duration given, compute end_time = start_time + duration.

Respond ONLY with raw JSON starting with { — no markdown, no code fences, no extra text:
{"intent":"add_task","data":{"title":"Work meeting","duration_minutes":60,"priority":"critical","deadline":null},"confidence":"high","missing_fields":["duration_minutes"]}"""

print(f"[DEBUG] system prompt loaded: {_CLAUDE_SYSTEM[:120]}...")

_claude_client = None


def _get_claude_client():
    global _claude_client
    if _claude_client is None:
        import anthropic
        _claude_client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    return _claude_client


def parse_intent(message_text: str, state: Optional[dict] = None) -> dict:
    """Call Claude Sonnet to extract intent and structured data.

    Returns {} on any failure so the caller falls back to keyword routing.
    """
    try:
        content = message_text
        if state:
            content = f"Current conversation state: {state}\n\nUser message: {message_text}"
        client = _get_claude_client()
        resp = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=300,
            system=_CLAUDE_SYSTEM,
            messages=[{"role": "user", "content": content}],
        )
        raw = resp.content[0].text.strip()
        # Strip markdown code fences if the model wraps its output
        if raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\s*", "", raw)
            raw = re.sub(r"\s*```\s*$", "", raw).strip()
        return json.loads(raw)
    except Exception as exc:
        print(f"[DEBUG] parse_user_intent failed: {exc}")
        return {}


# ── HTTP helpers ──────────────────────────────────────────────────────────────

def _api_get(path: str):
    resp = requests.get(f"{BASE_URL}{path}", timeout=10)
    resp.raise_for_status()
    return resp.json()


def _api_post(path: str, payload: dict):
    resp = requests.post(f"{BASE_URL}{path}", json=payload, timeout=15)
    resp.raise_for_status()
    return resp.json()


def _api_patch(path: str, payload: Optional[dict] = None):
    kwargs: dict = {"timeout": 10}
    if payload is not None:
        kwargs["json"] = payload
    resp = requests.patch(f"{BASE_URL}{path}", **kwargs)
    resp.raise_for_status()
    return resp.json()


def _api_delete(path: str):
    resp = requests.delete(f"{BASE_URL}{path}", timeout=10)
    resp.raise_for_status()


# ── Date helpers ──────────────────────────────────────────────────────────────

def _today() -> date:
    return date.today()


def _this_monday() -> date:
    today = _today()
    return today - timedelta(days=today.weekday())


def _fmt_date(d: date) -> str:
    return d.strftime("%A, %B") + f" {d.day}"


# ── Shared helpers ────────────────────────────────────────────────────────────

def _active_tasks() -> list:
    all_tasks = _api_get(f"/tasks/{USER_ID}")
    return [t for t in all_tasks if t["status"] in ("pending", "scheduled")]


def _fuzzy_find_task(query: str, tasks: list, threshold: float = 0.3) -> Optional[dict]:
    """Return the best-matching task from *tasks*, or None.

    Two-pass strategy:
    1. Word-inclusion: if all meaningful query words (>=3 chars) appear in the task
       title, return it immediately regardless of sequence ratio.
    2. SequenceMatcher fallback with lowered threshold.
    """
    if not query or not tasks:
        return None
    q = query.lower()
    q_words = [w for w in q.split() if len(w) >= 3]

    for task in tasks:
        t = task["title"].lower()
        if q_words and all(w in t for w in q_words):
            return task

    best_task = None
    best_ratio = threshold
    for task in tasks:
        ratio = difflib.SequenceMatcher(None, q, task["title"].lower()).ratio()
        if ratio > best_ratio:
            best_ratio = ratio
            best_task = task
    return best_task


def _numbered_list(tasks: list) -> str:
    lines = ["Pick a number:"]
    for i, t in enumerate(tasks, 1):
        deadline = f" | Due: {t['deadline'][:10]}" if t.get("deadline") else ""
        lines.append(
            f"*{i}.* {t['title']} — {t['duration_minutes']} min"
            f" | {t['priority']} | {t['energy_level']}{deadline}"
        )
    return "\n".join(lines)


def _find_task_block(task_id: int) -> Optional[dict]:
    monday = _this_monday()
    for offset in (0, 1):
        week_start = monday + timedelta(weeks=offset)
        try:
            blocks = _api_get(f"/schedule/{USER_ID}/week/{week_start}")
            for b in blocks:
                if b.get("task_id") == task_id:
                    return b
        except Exception:
            pass
    return None


def _do_reorganize() -> str:
    data = _api_post("/schedule/reorganize", {"user_id": USER_ID, "reason": "manual"})
    placed = len(data.get("tasks_rescheduled", []))
    dropped = len(data.get("tasks_dropped", []))
    msg = f"Schedule updated — {placed} task{'s' if placed != 1 else ''} placed"
    if dropped:
        msg += f", {dropped} couldn't fit"
    return msg + "."


_DAY_NAMES = {
    "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
    "friday": 4, "saturday": 5, "sunday": 6,
}


def _parse_relative_day(text: str) -> Optional[date]:
    """Convert a natural language day reference to a date.  Returns None if unparseable."""
    lower = text.lower().strip()
    today = _today()
    if not lower or lower == "today":
        return today
    if lower == "tomorrow":
        return today + timedelta(days=1)
    if lower in _DAY_NAMES:
        target_dow = _DAY_NAMES[lower]
        days_ahead = (target_dow - today.weekday()) % 7
        if days_ahead == 0:
            days_ahead = 7  # same weekday → next week
        return today + timedelta(days=days_ahead)
    return None


def _cancel_matching_block(type_hint: str, day_hint: str, say) -> bool:
    """Find and delete schedule blocks matching *type_hint* on *day_hint*.

    Returns True if at least one block was cancelled; False if nothing matched.
    """
    target = _parse_relative_day(day_hint)
    if not target:
        return False

    try:
        blocks = _api_get(f"/schedule/{USER_ID}/day/{target}")
    except Exception:
        return False

    # Normalise hint for block_type matching (e.g. "muay thai" → "muay_thai")
    norm = type_hint.lower().replace(" ", "_").replace("-", "_")
    matched = [
        b for b in blocks
        if norm in b.get("block_type", "").lower() or norm in b.get("title", "").lower()
    ]

    if not matched:
        return False

    for block in matched:
        try:
            _api_delete(f"/schedule/block/{block['id']}")
        except Exception as exc:
            print(f"[DEBUG] delete block {block['id']} failed: {exc}")

    _do_reorganize()
    day_label = _fmt_date(target)
    type_label = type_hint.replace("_", " ").capitalize()
    say(f":x: *{type_label}* cancelled for *{day_label}*. Schedule updated.")
    return True


def _energy_from_priority(priority: str) -> str:
    return {
        "critical": "high", "high": "high",
        "medium": "medium",
        "low": "low", "optional": "low",
    }.get(priority, "medium")


def _clean_deadline(raw) -> Optional[str]:
    """Return an ISO datetime string the API accepts, or None if raw is unparseable."""
    if not raw:
        return None
    s = str(raw).strip()
    # Accept YYYY-MM-DD and promote to end-of-day datetime
    try:
        date.fromisoformat(s)
        return s + "T23:59:59"
    except ValueError:
        pass
    # Accept full ISO datetime strings
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M"):
        try:
            datetime.strptime(s, fmt)
            return s
        except ValueError:
            pass
    # Anything else (e.g. "6pm", "next Friday") is not a usable date — discard it
    print(f"[DEBUG] deadline {s!r} not ISO-parseable, ignoring")
    return None


# Exact-match only for ambiguous single characters/words that would cause substring false positives
_SKIP_EXACT = frozenset(("no", "na"))

# Substring-match phrases — longer entries first so they shadow shorter ones
_SKIP_PHRASES = (
    "no due date", "no due", "no deadline", "no date",
    "not sure", "whenever", "anytime",
    "n/a", "nope", "none", "skip", "never", "null",
)


def _is_skip_deadline(lower: str) -> bool:
    """Return True if the lowercased input signals the user wants no deadline."""
    if lower in _SKIP_EXACT:
        return True
    return any(phrase in lower for phrase in _SKIP_PHRASES)


def _parse_deadline_text(text: str) -> tuple:
    """Convert natural language deadline to ISO datetime string.

    Returns (resolved: bool, deadline: Optional[str]):
      (True,  "2026-05-26T23:59:59")  — valid date parsed
      (True,  None)                   — user explicitly said no deadline
      (False, None)                   — unresolvable input; caller should retry
    """
    lower = text.lower().strip()

    # Fast path: skip phrases detected without calling Claude
    if _is_skip_deadline(lower):
        print(f"[DEBUG] deadline: skip phrase detected in {text!r}")
        return (True, None)

    today = _today()
    today_str = today.isoformat()
    weekday_str = today.strftime("%A")

    try:
        client = _get_claude_client()
        prompt = (
            f"Today is {today_str} ({weekday_str}). Convert this to a YYYY-MM-DD date. "
            "Be very lenient — 'tomoow', 'tmrw', 'tomoro' all mean tomorrow. "
            "'nxt week' means next Monday. "
            "'no deadline', 'none', 'nope', 'skip' all mean null. "
            'Return ONLY a JSON object: {"deadline": "YYYY-MM-DD"} or {"deadline": null}. '
            f"Input: {text}"
        )
        resp = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=30,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = resp.content[0].text.strip()
        raw = re.sub(r"^```\w*\s*|\s*```$", "", raw).strip()
        print(f"[DEBUG] deadline text {text!r} → Claude returned {raw!r}")

        parsed = json.loads(raw)
        dl = parsed.get("deadline")

        if dl is None:
            # Claude returned null — only accept if user clearly meant to skip
            has_skip = bool(re.search(r'\b(no|none|nope|skip|null)\b', lower))
            if has_skip:
                return (True, None)
            return (False, None)  # ambiguous null → retry

        # Validate the returned date string before accepting
        date.fromisoformat(str(dl))
        return (True, str(dl) + "T23:59:59")

    except Exception as exc:
        print(f"[DEBUG] _parse_deadline_text failed: {exc}")
        # Direct ISO date fallback (user typed "2026-06-01")
        try:
            date.fromisoformat(text.strip())
            return (True, text.strip() + "T23:59:59")
        except ValueError:
            pass
        # Last resort: if any skip word appears as a whole word, treat as no deadline
        if re.search(r'\b(no|none|nope|skip|null)\b', lower):
            return (True, None)
        return (False, None)


def _extract_duration_minutes(text: str) -> Optional[int]:
    """Pull a single integer minute-count from natural language.

    Tries Claude first; regex digit-scan is always the final fallback.
    """
    print(f"[DEBUG] _extract_duration_minutes called with: {text!r}")

    # ── Claude attempt ────────────────────────────────────────────────────────
    claude_minutes: Optional[int] = None
    try:
        client = _get_claude_client()
        resp = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=10,
            system=(
                "Extract only a single integer number of minutes from the user's text. "
                "If a range is given take the higher number. "
                "If hours are given convert to minutes (1 hour = 60 minutes). "
                "Reply with ONLY the integer digit(s) and nothing else. "
                "If you cannot extract any number reply with 0."
            ),
            messages=[{"role": "user", "content": text}],
        )
        raw = resp.content[0].text.strip()
        raw = re.sub(r"^```\w*\s*|\s*```$", "", raw).strip()
        # Grab just the first run of digits in case the model adds words
        digit_match = re.search(r"\d+", raw)
        if digit_match:
            claude_minutes = int(digit_match.group())
        print(f"[DEBUG] Claude duration result: {claude_minutes!r} from {text!r}")
    except Exception as exc:
        print(f"[DEBUG] _extract_duration_minutes Claude call failed: {exc}")

    if claude_minutes and claude_minutes > 0:
        return claude_minutes

    # ── Regex fallback: grab all digit runs, take the largest ─────────────────
    nums = [int(n) for n in re.findall(r"\d+", text)]
    if nums:
        minutes = max(nums)
        print(f"[DEBUG] duration regex fallback: {minutes} min from {text!r}")
        return minutes

    print(f"[DEBUG] _extract_duration_minutes: no number found in {text!r}")
    return None


# ── One-shot flow handlers ────────────────────────────────────────────────────

def _handle_generate_schedule(say):
    monday = _this_monday()
    data = _api_post("/schedule/generate", {
        "user_id": USER_ID,
        "week_start_date": str(monday),
    })
    lines = [
        f"*Schedule generated for the week of {_fmt_date(monday)}!* :calendar:",
        f"• *{data['block_count']}* blocks created",
    ]
    unscheduled = data.get("unscheduled_tasks", [])
    if unscheduled:
        lines.append(f"• :warning: *{len(unscheduled)}* task(s) couldn't be scheduled")
    if data.get("is_overloaded"):
        lines.append(":rotating_light: *Your week is overloaded.* Some tasks couldn't fit.")
    else:
        lines.append("Everything fits. You're good to go!")
    say("\n".join(lines))


def _handle_my_schedule(say):
    today = _today()
    blocks = _api_get(f"/schedule/{USER_ID}/day/{today}")
    if not blocks:
        say(f"Nothing scheduled for {_fmt_date(today)}.")
        return
    BLOCK_EMOJI = {
        "sleep": ":zzz:", "routine": ":sparkles:", "meal": ":fork_and_knife:",
        "commute": ":bus:", "gym": ":muscle:", "muay_thai": ":martial_arts_uniform:",
        "task": ":white_check_mark:", "buffer": ":hourglass:",
    }
    lines = [f"*Your schedule for {_fmt_date(today)}:*"]
    for b in blocks:
        emoji = BLOCK_EMOJI.get(b.get("block_type", ""), ":calendar:")
        lock = " :lock:" if b.get("is_locked") else ""
        lines.append(f"{emoji} *{b['start_time']} – {b['end_time']}* {b['title']}{lock}")
    say("\n".join(lines))


def _handle_my_tasks(say):
    all_tasks = _api_get(f"/tasks/{USER_ID}")
    print(f"[DEBUG] tasks API response: {all_tasks}")
    ACTIVE_STATUSES = {"pending", "scheduled", "partial", "missed"}
    tasks = [t for t in all_tasks if t["status"] in ACTIVE_STATUSES]
    if not tasks:
        say("You're all caught up! No pending or active tasks.")
        return
    STATUS_EMOJI = {
        "pending": ":clock3:", "scheduled": ":calendar:",
        "partial": ":large_orange_circle:", "missed": ":warning:",
    }
    lines = [f"*Your tasks ({len(tasks)}):*"]
    for t in tasks:
        emoji = STATUS_EMOJI.get(t["status"], ":clipboard:")
        deadline = f" | Due: {t['deadline'][:10]}" if t.get("deadline") else ""
        lines.append(
            f"{emoji} *{t['title']}* — {t['duration_minutes']} min"
            f" | {t['priority']} | {t['status']}{deadline}"
        )
    say("\n".join(lines))


def _handle_reschedule(say):
    data = _api_post("/schedule/reorganize", {"user_id": USER_ID, "reason": "manual"})
    placed = len(data.get("tasks_rescheduled", []))
    dropped = len(data.get("tasks_dropped", []))
    at_risk = len(data.get("deadline_at_risk", []))
    lines = [
        "*Schedule reorganized!* :calendar:",
        f"• *{data['blocks_created']}* blocks rebuilt across the rest of your week",
        f"• *{placed}* task{'s' if placed != 1 else ''} placed",
    ]
    if dropped:
        lines.append(f"• *{dropped}* task{'s' if dropped != 1 else ''} couldn't fit")
    if at_risk:
        lines.append(f"• :warning: *{at_risk}* task{'s' if at_risk != 1 else ''} at risk")
    if data.get("is_overloaded"):
        lines.append(":rotating_light: *Your week is overloaded.*")
    if not dropped and not at_risk and not data.get("is_overloaded"):
        lines.append("Everything fits. You're good to go!")
    say("\n".join(lines))


# ── Smart add_task flow ───────────────────────────────────────────────────────

def _start_add_task(user_id: str, seed: dict, say):
    """Clear any stale state and begin a fresh add_task flow."""
    conversation_state.pop(user_id, None)
    _ask_next_add_task_question(user_id, seed, say)


def _ask_next_add_task_question(user_id: str, data: dict, say):
    """Ask only for the next missing required field, or save immediately if all present."""
    if "title" not in data:
        conversation_state[user_id] = {"flow": "add_task", "step": "ask_name", "data": data}
        say("What's the task name?")
    elif "duration_minutes" not in data:
        conversation_state[user_id] = {"flow": "add_task", "step": "ask_duration", "data": data}
        say(f"How long will *{data['title']}* take? *(minutes, e.g. 45)*")
    elif "priority" not in data:
        conversation_state[user_id] = {"flow": "add_task", "step": "ask_priority", "data": data}
        say(f"What's the priority for *{data['title']}*?\n*critical / high / medium / low / optional*")
    elif "deadline_answered" not in data:
        data["deadline_answered"] = True
        conversation_state[user_id] = {"flow": "add_task", "step": "ask_deadline", "data": data}
        say("When is this due? Say a date like *Monday*, *tomorrow*, *Dec 15*, or *no deadline*.")
    else:
        _complete_add_task(user_id, data, say)


def _complete_add_task(user_id: str, data: dict, say):
    conversation_state.pop(user_id, None)
    energy = _energy_from_priority(data.get("priority", "medium"))
    payload = {
        "user_id": USER_ID,
        "title": data["title"],
        "duration_minutes": int(data["duration_minutes"]),
        "priority": data["priority"],
        "energy_level": data.get("energy_level", energy),
        "deadline": _clean_deadline(data.get("deadline")),
        "is_flexible": True,
    }
    print(f"[DEBUG] POST /tasks/ payload: {payload}")
    try:
        resp = requests.post(f"{BASE_URL}/tasks/", json=payload, timeout=15)
        if not resp.ok:
            print(f"[DEBUG] task save failed {resp.status_code}: {resp.text}")
            resp.raise_for_status()
        task = resp.json()
    except requests.HTTPError as exc:
        raise RuntimeError(f"Task save failed ({exc}): {exc.response.text if exc.response else ''}") from exc
    reorg = _do_reorganize()
    say(f":white_check_mark: *\"{task['title']}\"* added! {reorg}")


def _continue_add_task(user_id: str, text: str, say):
    state = conversation_state[user_id]
    step = state["step"]
    data = state["data"]

    if step == "ask_name":
        data["title"] = text.strip()
    elif step == "ask_duration":
        print(f"[DEBUG] duration input: {text!r}")
        clean = text.strip()
        if clean.isdigit() and int(clean) > 0:
            data["duration_minutes"] = int(clean)
        else:
            minutes = _extract_duration_minutes(text)
            if minutes:
                data["duration_minutes"] = minutes
            else:
                say("How many minutes will that take? (e.g. *45* or *60*)")
                return
        print(f"[DEBUG] duration extracted: {data['duration_minutes']}")
    elif step == "ask_priority":
        prio = text.lower().strip()
        if prio not in ("critical", "high", "medium", "low", "optional"):
            say("Please choose one: *critical / high / medium / low / optional*")
            return
        data["priority"] = prio
    elif step == "ask_deadline":
        resolved, deadline = _parse_deadline_text(text)
        if not resolved:
            print(f"[DEBUG] staying at ask_deadline, retrying")
            say("I didn't catch that date. Try something like *tomorrow*, *Monday*, *May 30*, or say *no deadline*.")
            return  # state stays locked at ask_deadline — next message retries
        data["deadline"] = deadline
        print(f"[DEBUG] deadline set: {deadline!r} from {text!r}")
    else:
        return

    _ask_next_add_task_question(user_id, data, say)


# ── Pick flows (complete / cancel / missed) ───────────────────────────────────

def _start_pick_flow(user_id: str, flow: str, say):
    tasks = _active_tasks()
    if not tasks:
        say("You have no active tasks to act on.")
        return
    conversation_state[user_id] = {"flow": flow, "step": "pick", "data": {"tasks": tasks}}
    say(_numbered_list(tasks))


def _continue_pick_flow(user_id: str, text: str, say):
    state = conversation_state[user_id]
    flow = state["flow"]
    tasks = state["data"]["tasks"]
    clean = text.strip()

    if not clean.isdigit() or not (1 <= int(clean) <= len(tasks)):
        say(f"Please reply with a number between *1* and *{len(tasks)}*.")
        return

    task = tasks[int(clean) - 1]
    task_id = task["id"]
    del conversation_state[user_id]

    if flow == "complete":
        _api_patch(f"/tasks/{task_id}/status", {"status": "complete"})
        block = _find_task_block(task_id)
        if block:
            _api_patch(f"/schedule/{block['id']}/lock")
        reorg = _do_reorganize()
        say(f":white_check_mark: *\"{task['title']}\"* marked complete! {reorg}")

    elif flow == "cancel":
        _api_patch(f"/tasks/{task_id}/status", {"status": "cancelled"})
        reorg = _do_reorganize()
        say(f":x: *\"{task['title']}\"* cancelled. {reorg}")

    elif flow == "missed":
        _api_patch(f"/tasks/{task_id}/status", {"status": "missed"})
        reorg = _do_reorganize()
        say(f":warning: *\"{task['title']}\"* marked as missed. {reorg}")


def _continue_flow(user_id: str, text: str, say):
    flow = conversation_state[user_id]["flow"]
    if flow == "add_task":
        _continue_add_task(user_id, text, say)
    elif flow in ("complete", "cancel", "missed"):
        _continue_pick_flow(user_id, text, say)
    elif flow == "add_event":
        _continue_add_event(user_id, text, say)
    elif flow == "confirm_reorg":
        _continue_confirm_reorg(user_id, text, say)


# ── Intent router ─────────────────────────────────────────────────────────────

def _route_by_intent(intent: str, data: dict, user_id: str, say, event: dict):
    """Dispatch to the correct handler based on Claude's parsed intent."""
    conversation_state.pop(user_id, None)

    if intent == "add_task":
        seed: dict = {}
        if data.get("title"):
            seed["title"] = str(data["title"])
        raw_dur = data.get("duration_minutes")
        if raw_dur is not None:
            try:
                dur = int(raw_dur)
                if dur > 0:
                    seed["duration_minutes"] = dur
            except (ValueError, TypeError):
                pass
        prio = str(data.get("priority", "")).lower()
        if prio in ("critical", "high", "medium", "low", "optional"):
            seed["priority"] = prio
        # Treat Claude's deadline extract as definitive — null means no deadline was mentioned.
        # Pre-setting deadline_answered prevents the bot from asking a follow-up question when
        # the user didn't mention a deadline (the common case for quick task adds).
        seed["deadline_answered"] = True
        seed["deadline"] = _clean_deadline(data.get("deadline"))
        _start_add_task(user_id, seed, say)

    elif intent == "my_tasks":
        _handle_my_tasks(say)
    elif intent == "my_schedule":
        _handle_my_schedule(say)
    elif intent == "complete_task":
        hint = data.get("title") or ""
        tasks = _active_tasks()
        match = _fuzzy_find_task(hint, tasks)
        if match:
            task_id = match["id"]
            _api_patch(f"/tasks/{task_id}/status", {"status": "complete"})
            block = _find_task_block(task_id)
            if block:
                _api_patch(f"/schedule/{block['id']}/lock")
            reorg = _do_reorganize()
            say(f":white_check_mark: *\"{match['title']}\"* marked complete! {reorg}")
        else:
            _start_pick_flow(user_id, "complete", say)

    elif intent == "cancel_task":
        hint = data.get("title") or ""
        tasks = _active_tasks()
        match = _fuzzy_find_task(hint, tasks)
        if match:
            task_id = match["id"]
            _api_patch(f"/tasks/{task_id}/status", {"status": "cancelled"})
            reorg = _do_reorganize()
            say(f":x: *\"{match['title']}\"* cancelled. {reorg}")
        else:
            # No task matched — try to cancel a schedule block instead.
            # Claude uses inconsistent keys for the day: "day", "date", or "deadline".
            day_hint = data.get("day") or data.get("date") or data.get("deadline") or ""
            if not _cancel_matching_block(hint, day_hint, say):
                _start_pick_flow(user_id, "cancel", say)

    elif intent == "missed_task":
        hint = data.get("title") or ""
        tasks = _active_tasks()
        match = _fuzzy_find_task(hint, tasks)
        if match:
            task_id = match["id"]
            _api_patch(f"/tasks/{task_id}/status", {"status": "missed"})
            reorg = _do_reorganize()
            say(f":warning: *\"{match['title']}\"* marked as missed. {reorg}")
        else:
            _start_pick_flow(user_id, "missed", say)
    elif intent == "reschedule":
        _handle_reschedule(say)
    elif intent == "generate_schedule":
        _handle_generate_schedule(say)
    elif intent == "add_event":
        _handle_add_event(user_id, data, say)
    elif intent == "day_query":
        _handle_day_query(data, say)
    elif intent == "help":
        say(HELP_TEXT)
    elif event.get("channel_type") == "im":
        say("I didn't catch that. Type *help* to see what I can do.")


# ── Day query handler ─────────────────────────────────────────────────────────

def _handle_day_query(data: dict, say):
    day_str = (data.get("day") or "today").strip()
    target = _parse_relative_day(day_str)
    if not target:
        say(f"I couldn't understand *{day_str}*. Try 'Wednesday', 'tomorrow', or 'Friday'.")
        return
    blocks = _api_get(f"/schedule/{USER_ID}/day/{target}")
    if not blocks:
        say(f"Nothing scheduled for *{_fmt_date(target)}*.")
        return
    BLOCK_EMOJI = {
        "sleep": ":zzz:", "routine": ":sparkles:", "meal": ":fork_and_knife:",
        "commute": ":bus:", "gym": ":muscle:", "muay_thai": ":martial_arts_uniform:",
        "task": ":white_check_mark:", "buffer": ":hourglass:", "event": ":calendar:",
    }
    lines = [f"*Schedule for {_fmt_date(target)}:*"]
    for b in blocks:
        emoji = BLOCK_EMOJI.get(b.get("block_type", ""), ":calendar:")
        lock = " :lock:" if b.get("is_locked") else ""
        lines.append(f"{emoji} *{b['start_time']} – {b['end_time']}* {b['title']}{lock}")
    say("\n".join(lines))


# ── Event add handler ─────────────────────────────────────────────────────────

def _parse_time_str(raw: Optional[str]) -> Optional[str]:
    """Ensure time is HH:MM 24h format. Returns None if unparseable."""
    if not raw:
        return None
    raw = str(raw).strip()
    if re.match(r"^\d{1,2}:\d{2}$", raw):
        h, m = raw.split(":")
        return f"{int(h):02d}:{int(m):02d}"
    return None


def _add_minutes_to_time(time_str: str, minutes: int) -> str:
    h, m = map(int, time_str.split(":"))
    total = h * 60 + m + minutes
    return f"{(total // 60) % 24:02d}:{total % 60:02d}"


def _handle_add_event(user_id: str, data: dict, say):
    title = (data.get("title") or "Event").strip()
    day_str = (data.get("day") or "today").strip()
    start_time = _parse_time_str(data.get("start_time"))
    end_time = _parse_time_str(data.get("end_time"))
    duration = data.get("duration_minutes")

    target_date = _parse_relative_day(day_str)
    if not target_date:
        say(f"I couldn't understand the day *{day_str}*. Try 'Wednesday' or 'tomorrow'.")
        return

    if not start_time:
        say(f"What time does *{title}* start? *(e.g. 2pm or 14:00)*")
        conversation_state[user_id] = {
            "flow": "add_event",
            "step": "ask_start_time",
            "data": {"title": title, "day_str": day_str, "target_date": str(target_date)},
        }
        return

    if not end_time:
        if duration:
            end_time = _add_minutes_to_time(start_time, int(duration))
        else:
            say(f"How long is *{title}*? *(e.g. 2 hours or 90 minutes)*")
            conversation_state[user_id] = {
                "flow": "add_event",
                "step": "ask_duration",
                "data": {
                    "title": title, "day_str": day_str,
                    "target_date": str(target_date), "start_time": start_time,
                },
            }
            return

    _execute_event_plan(user_id, title, target_date, start_time, end_time, say)


def _execute_event_plan(user_id: str, title: str, target_date, start_time: str, end_time: str, say):
    """Call dry_run, then either apply immediately or send warning for confirmation."""
    day_label = _fmt_date(target_date)
    try:
        resp = requests.post(
            f"{BASE_URL}/schedules/event",
            json={
                "user_id": USER_ID,
                "date": str(target_date),
                "title": title,
                "start_time": start_time,
                "end_time": end_time,
                "dry_run": True,
            },
            timeout=15,
        )
        resp.raise_for_status()
        plan = resp.json()
    except Exception as exc:
        say(f"Something went wrong checking the schedule. ({exc})")
        return

    if not plan.get("has_warnings"):
        # Apply immediately — no warnings
        try:
            apply_resp = requests.post(
                f"{BASE_URL}/schedules/event",
                json={
                    "user_id": USER_ID,
                    "date": str(target_date),
                    "title": title,
                    "start_time": start_time,
                    "end_time": end_time,
                    "dry_run": False,
                },
                timeout=15,
            )
            apply_resp.raise_for_status()
            result = apply_resp.json()
            summary = result.get("summary", "Schedule updated.")
            say(
                f":calendar: *{title}* added for *{day_label}* {start_time}–{end_time}.\n{summary}"
            )
        except Exception as exc:
            say(f"Failed to add event. ({exc})")
        return

    # Has warnings — store in state and ask for confirmation
    conversation_state[user_id] = {
        "flow": "confirm_reorg",
        "step": "waiting_confirm",
        "data": {
            "event": {
                "user_id": USER_ID,
                "date": str(target_date),
                "title": title,
                "start_time": start_time,
                "end_time": end_time,
                "dry_run": False,
            },
            "day_label": day_label,
        },
    }
    say(plan["warning_message"])


def _continue_add_event(user_id: str, text: str, say):
    state = conversation_state[user_id]
    step = state["step"]
    data = state["data"]

    if step == "ask_start_time":
        # Try to extract a time from the reply
        resolved = None
        clean = text.strip()
        # Try Claude's time parsing via deadline parser, or simple regex
        match = re.search(r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)?", clean, re.IGNORECASE)
        if match:
            h = int(match.group(1))
            m = int(match.group(2) or 0)
            ampm = (match.group(3) or "").lower()
            if ampm == "pm" and h < 12:
                h += 12
            elif ampm == "am" and h == 12:
                h = 0
            resolved = f"{h:02d}:{m:02d}"
        if not resolved:
            say("I didn't catch that time. Try *2pm* or *14:00*.")
            return
        del conversation_state[user_id]
        _handle_add_event(user_id, {
            "title": data["title"],
            "day": data["day_str"],
            "start_time": resolved,
        }, say)

    elif step == "ask_duration":
        minutes = _extract_duration_minutes(text)
        if not minutes:
            say("How many minutes? (e.g. *60* or *2 hours*)")
            return
        end_time = _add_minutes_to_time(data["start_time"], minutes)
        del conversation_state[user_id]
        _execute_event_plan(
            user_id, data["title"],
            date.fromisoformat(data["target_date"]),
            data["start_time"], end_time, say,
        )


def _continue_confirm_reorg(user_id: str, text: str, say):
    lower = text.lower().strip()
    state = conversation_state[user_id]
    event_data = state["data"]["event"]
    day_label = state["data"]["day_label"]

    _YES = frozenset(("yes", "y", "yep", "yeah", "sure", "ok", "okay", "confirm", "go ahead", "do it"))
    _NO  = frozenset(("no", "n", "nope", "nah", "cancel", "stop", "abort"))

    if lower in _YES:
        del conversation_state[user_id]
        try:
            resp = requests.post(f"{BASE_URL}/schedules/event", json=event_data, timeout=15)
            resp.raise_for_status()
            result = resp.json()
            say(
                f":white_check_mark: Done. *{event_data['title']}* added for *{day_label}*"
                f" {event_data['start_time']}–{event_data['end_time']}.\n"
                f"{result.get('summary', 'Schedule updated.')}"
            )
        except Exception as exc:
            say(f"Failed to apply changes. ({exc})")
    elif lower in _NO:
        del conversation_state[user_id]
        say("Cancelled. No changes were made.")
    else:
        say("Please reply *yes* to confirm or *no* to cancel.")


# ── Keyword fallback (used when Claude API is unavailable) ────────────────────

def _keyword_route(text: str, user_id: str, say, event: dict, in_flow: bool):
    """Simple substring fallback — intentionally loose so nothing gets dropped."""
    lower = text.lower()

    # Standalone abort words — must not match "cancel task" (handled separately below)
    if lower.strip() in _CANCEL_WORDS:
        if in_flow:
            del conversation_state[user_id]
            say("Cancelled. Type *help* if you need anything.")
        else:
            say("Nothing to cancel. Type *help* to see what I can do.")
        return

    if in_flow:
        _continue_flow(user_id, text, say)
        return

    # Order matters: more specific checks first
    if "generate" in lower and "schedule" in lower:
        _handle_generate_schedule(say)
    elif "schedule" in lower:
        _handle_my_schedule(say)
    elif "complete" in lower or "done" in lower or "finished" in lower:
        _start_pick_flow(user_id, "complete", say)
    elif "cancel" in lower and ("task" in lower or "tasks" in lower):
        _start_pick_flow(user_id, "cancel", say)
    elif "miss" in lower:
        _start_pick_flow(user_id, "missed", say)
    elif "reschedule" in lower or "reorganize" in lower:
        _handle_reschedule(say)
    elif "what can you do" in lower or "what else" in lower:
        say(HELP_TEXT)
    elif "help" in lower:
        say(HELP_TEXT)
    elif "add" in lower or "new task" in lower or "need to" in lower or "want to" in lower:
        _start_add_task(user_id, {}, say)
    elif "task" in lower or "tasks" in lower:
        # Broad match: any mention of task(s) without a more specific action → show list
        _handle_my_tasks(say)
    elif event.get("channel_type") == "im":
        say("I didn't catch that. Type *help* to see what I can do.")


# ── Shared message processing core ───────────────────────────────────────────

_CANCEL_WORDS = frozenset((
    "cancel", "stop", "stop it", "quit", "exit",
    "nevermind", "never mind", "go back", "back", "forget it",
))


def _process_message(text: str, user_id: str, say, event: dict):
    """Parse intent via Claude and route, falling back to keywords on failure."""
    in_flow = user_id in conversation_state
    lower = text.lower().strip()

    print(f"[DEBUG] message received: {text!r} | state: {conversation_state.get(user_id)}")

    # Cancel always clears state regardless of whether we are mid-flow.
    if lower in _CANCEL_WORDS:
        if in_flow:
            del conversation_state[user_id]
            say("Cancelled. Type *help* if you need anything.")
        else:
            say("Nothing to cancel. Type *help* to see what I can do.")
        return

    # When mid-flow, still parse so that a fresh intent (e.g. the user starting a brand-new
    # task while a previous flow was left open) overrides the stale state.
    # Short replies like bare numbers or single words parse as "unknown" and stay in the flow.
    if in_flow:
        print(f"[DEBUG] mid-flow detected, checking for fresh-intent override")
        parsed = parse_intent(text, None)
        if parsed:
            intent = parsed.get("intent", "unknown")
            if intent not in ("unknown", "cancel_flow"):
                print(f"[DEBUG] fresh intent {intent!r} overrides stale flow — clearing state")
                conversation_state.pop(user_id, None)
                _route_by_intent(intent, parsed.get("data") or {}, user_id, say, event)
                return
        # No clear new intent — treat as mid-flow continuation
        _continue_flow(user_id, text, say)
        return

    parsed = parse_intent(text, None)
    print(f"[DEBUG] parsed intent: {parsed}")

    # Claude unavailable → graceful keyword fallback
    if not parsed:
        _keyword_route(text, user_id, say, event, in_flow=False)
        return

    intent = parsed.get("intent", "unknown")

    if intent == "cancel_flow":
        say("Nothing to cancel. Type *help* to see what I can do.")
        return

    _route_by_intent(intent, parsed.get("data") or {}, user_id, say, event)


# ── Event handlers ────────────────────────────────────────────────────────────

@app.event("app_mention")
def handle_mention(body, say):
    event = body.get("event", {})
    user_id = event.get("user")
    if not user_id:
        return

    raw_text = (event.get("text") or "").strip()
    # Strip all <@BOTID> mention tags to get just the user's actual words
    text_after_mention = re.sub(r"<@[A-Z0-9]+>", "", raw_text).strip()

    if not text_after_mention:
        say("Hey! I'm Sunday. Your life scheduler. Type *help* to see what I can do.")
        return

    try:
        _process_message(text_after_mention, user_id, say, event)
    except Exception as exc:
        conversation_state.pop(user_id, None)
        say(f"Something went wrong. ({exc})")


@app.event("message")
def handle_message(body, say):
    event = body.get("event", {})
    if event.get("subtype"):
        return
    user_id = event.get("user")
    if not user_id:
        return
    text = (event.get("text") or "").strip()
    if not text:
        return

    try:
        _process_message(text, user_id, say, event)
    except Exception as exc:
        conversation_state.pop(user_id, None)
        say(f"Something went wrong. ({exc})")
