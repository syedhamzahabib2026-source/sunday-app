"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SetupSection from "@/components/SetupSection";
import {
  getPreferences,
  savePreferences,
  generateSchedule,
  createTask,
} from "@/lib/api";

// ── Constants ─────────────────────────────────────────────────────────────────

const USER_ID = 1;

const DAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAYS_FULL = [
  "Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday",
];
const STEP_LABELS = ["Your Week", "Preferences", "Tasks", "Review"];
const LOADING_MESSAGES = [
  "Protecting your sleep...",
  "Inserting meals and routines...",
  "Scheduling your tasks...",
  "Checking for overload...",
];

const INPUT =
  "w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-md px-3 text-[14px] text-[#f0f0f0] placeholder-[#555555] focus:outline-none focus:border-[#6366f1] transition-colors h-9";
const LABEL = "text-[12px] text-[#888888] mb-1.5 block";

// ── Types ─────────────────────────────────────────────────────────────────────

type Priority = "critical" | "high" | "medium" | "low" | "optional";

const PRIORITIES: Priority[] = ["critical", "high", "medium", "low", "optional"];

interface WizardTask {
  id: string;
  title: string;
  durationText: string;
  durationMinutes: number;
  priority: Priority;
  deadlineText: string;
}

interface WizardData {
  weekStartDate: string;
  sleep_target_hours: number;
  preferred_bedtime: string;
  preferred_wake_time: string;
  morning_routine_mins: number;
  night_routine_mins: number;
  shower_mins: number;
  meals_per_day: number;
  meal_prep_days: string[];
  gym_days_per_week: number;
  muay_thai_days_per_week: number;
  commute_minutes: number;
  is_remote: boolean;
  tasks: WizardTask[];
}

interface TaskDraft {
  title: string;
  durationText: string;
  priority: Priority;
  deadlineText: string;
}

// ── Priority styling ──────────────────────────────────────────────────────────

const PRIORITY_BORDER: Record<Priority, string> = {
  critical: "#dc2626",
  high:     "#d97706",
  medium:   "#6366f1",
  low:      "#525252",
  optional: "#525252",
};

const PRIORITY_BADGE_BG: Record<Priority, string> = {
  critical: "#450a0a",
  high:     "#431407",
  medium:   "#1e1b4b",
  low:      "#1f2937",
  optional: "#1f2937",
};

const PRIORITY_BADGE_COLOR: Record<Priority, string> = {
  critical: "#fca5a5",
  high:     "#fcd34d",
  medium:   "#a5b4fc",
  low:      "#9ca3af",
  optional: "#9ca3af",
};

const PRIORITY_PILL_ACTIVE: Record<Priority, string> = {
  critical: "bg-[#7f1d1d] text-[#fca5a5] border-[#7f1d1d]",
  high:     "bg-[#78350f] text-[#fcd34d] border-[#78350f]",
  medium:   "bg-[#1e1b4b] text-[#a5b4fc] border-[#1e1b4b]",
  low:      "bg-[#1f2937] text-[#9ca3af] border-[#1f2937]",
  optional: "bg-[#1f2937] text-[#9ca3af] border-[#1f2937]",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function toLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatWeekRange(monday: Date): string {
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  const startStr = monday.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  if (monday.getMonth() === sunday.getMonth()) {
    return `${startStr} – ${sunday.getDate()}, ${sunday.getFullYear()}`;
  }
  return `${startStr} – ${sunday.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`;
}

function parseDurationToMinutes(text: string): number | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  // "1h 30m" / "1 hour 30 mins"
  const hm = t.match(/^(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\s+(\d+)\s*(?:minutes?|mins?|m)?$/);
  if (hm) return Math.round(parseFloat(hm[1]) * 60 + parseInt(hm[2]));
  // "2 hours" / "1.5h"
  const h = t.match(/^(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)$/);
  if (h) return Math.round(parseFloat(h[1]) * 60);
  // "90 mins" / "30m" / "45" (bare number = minutes)
  const m = t.match(/^(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|m)?$/);
  if (m) return Math.round(parseFloat(m[1]));
  return null;
}

function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function estimateFreeHours(d: WizardData): number {
  const dailyFixed =
    d.sleep_target_hours +
    (d.morning_routine_mins + d.night_routine_mins + d.shower_mins) / 60 +
    (d.meals_per_day * 30) / 60;
  const weeklyFixed =
    dailyFixed * 7 +
    (d.is_remote ? 0 : (d.commute_minutes * 2 * 5) / 60) +
    d.gym_days_per_week * 1.5 +
    d.muay_thai_days_per_week * 1.5;
  return Math.max(0, Math.round(7 * 16 - weeklyFixed));
}

function getWeekOptions(): { label: string; monday: Date }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dow = today.getDay(); // 0=Sun, 1=Mon

  if (dow === 0) {
    // Sunday: upcoming Monday = tomorrow
    const a = new Date(today);
    a.setDate(today.getDate() + 1);
    const b = new Date(a);
    b.setDate(a.getDate() + 7);
    return [
      { label: "This coming week", monday: a },
      { label: "Next week", monday: b },
    ];
  }
  if (dow === 1) {
    // Monday: this week or next
    const a = new Date(today);
    const b = new Date(today);
    b.setDate(today.getDate() + 7);
    return [
      { label: "This week", monday: a },
      { label: "Next week", monday: b },
    ];
  }
  // Tue–Sat: only next Monday
  const diff = 8 - dow;
  const next = new Date(today);
  next.setDate(today.getDate() + diff);
  return [{ label: "Upcoming week", monday: next }];
}

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_DATA: WizardData = {
  weekStartDate: toLocalDateString(getWeekOptions()[0].monday),
  sleep_target_hours: 8,
  preferred_bedtime: "23:30",
  preferred_wake_time: "07:30",
  morning_routine_mins: 30,
  night_routine_mins: 20,
  shower_mins: 15,
  meals_per_day: 3,
  meal_prep_days: [],
  gym_days_per_week: 3,
  muay_thai_days_per_week: 2,
  commute_minutes: 30,
  is_remote: false,
  tasks: [],
};

const DEFAULT_DRAFT: TaskDraft = {
  title: "",
  durationText: "",
  priority: "medium",
  deadlineText: "",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>(DEFAULT_DATA);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [draft, setDraft] = useState<TaskDraft>(DEFAULT_DRAFT);
  const [generating, setGenerating] = useState(false);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // Pre-populate preferences from last saved
  useEffect(() => {
    getPreferences(USER_ID)
      .then((prefs) => {
        setData((prev) => ({
          ...prev,
          sleep_target_hours: prefs.sleep_target_hours,
          preferred_bedtime: prefs.preferred_bedtime,
          preferred_wake_time: prefs.preferred_wake_time,
          morning_routine_mins: prefs.morning_routine_mins,
          night_routine_mins: prefs.night_routine_mins,
          shower_mins: prefs.shower_mins,
          meals_per_day: prefs.meals_per_day,
          meal_prep_days: prefs.meal_prep_days,
          gym_days_per_week: prefs.gym_days_per_week,
          muay_thai_days_per_week: prefs.muay_thai_days_per_week,
          commute_minutes: prefs.commute_minutes,
          is_remote: prefs.is_remote,
        }));
      })
      .catch(() => {/* fall back to defaults */});
  }, []);

  // Cycle loading messages during generation
  useEffect(() => {
    if (!generating) return;
    const interval = setInterval(
      () => setLoadingMsgIdx((i) => (i + 1) % LOADING_MESSAGES.length),
      1500
    );
    return () => clearInterval(interval);
  }, [generating]);

  function setField<K extends keyof WizardData>(key: K, value: WizardData[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  function toggleDay(fullDay: string) {
    setData((prev) => ({
      ...prev,
      meal_prep_days: prev.meal_prep_days.includes(fullDay)
        ? prev.meal_prep_days.filter((d) => d !== fullDay)
        : [...prev.meal_prep_days, fullDay],
    }));
  }

  function addTask() {
    const mins = parseDurationToMinutes(draft.durationText);
    if (!draft.title.trim() || mins === null) return;
    const task: WizardTask = {
      id: `${Date.now()}-${Math.random()}`,
      title: draft.title.trim(),
      durationText: draft.durationText,
      durationMinutes: mins,
      priority: draft.priority,
      deadlineText: draft.deadlineText,
    };
    setData((prev) => ({ ...prev, tasks: [...prev.tasks, task] }));
    setDraft(DEFAULT_DRAFT);
    setShowTaskForm(false);
  }

  function removeTask(id: string) {
    setData((prev) => ({ ...prev, tasks: prev.tasks.filter((t) => t.id !== id) }));
  }

  async function handleGenerate() {
    setGenerating(true);
    setErrMsg(null);
    setLoadingMsgIdx(0);
    try {
      await savePreferences({
        user_id: USER_ID,
        week_start_date: data.weekStartDate,
        sleep_target_hours: data.sleep_target_hours,
        preferred_bedtime: data.preferred_bedtime,
        preferred_wake_time: data.preferred_wake_time,
        morning_routine_mins: data.morning_routine_mins,
        night_routine_mins: data.night_routine_mins,
        shower_mins: data.shower_mins,
        meals_per_day: data.meals_per_day,
        meal_prep_days: data.meal_prep_days,
        gym_days_per_week: data.gym_days_per_week,
        muay_thai_days_per_week: data.muay_thai_days_per_week,
        commute_minutes: data.commute_minutes,
        is_remote: data.is_remote,
        fixed_commitments: [],
        notes: null,
      });
      for (const task of data.tasks) {
        await createTask({
          user_id: USER_ID,
          title: task.title,
          duration_minutes: task.durationMinutes,
          deadline: null,
          priority: task.priority,
          energy_level: "medium",
          is_flexible: true,
        });
      }
      await generateSchedule(USER_ID, data.weekStartDate);
      router.push("/week");
    } catch (e) {
      setErrMsg(String(e));
      setGenerating(false);
    }
  }

  // Derived values
  const weekOptions = getWeekOptions();
  const draftMins = parseDurationToMinutes(draft.durationText);
  const totalTaskMins = data.tasks.reduce((s, t) => s + t.durationMinutes, 0);
  const freeHours = estimateFreeHours(data);
  const taskHours = totalTaskMins / 60;
  const isHeavy = taskHours > freeHours;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-[600px] pt-10 pb-20">

      {/* ── Progress bar ────────────────────────────────────────────── */}
      <div className="flex items-start mb-10">
        {STEP_LABELS.map((label, i) => (
          <React.Fragment key={label}>
            {i > 0 && (
              <div
                className={`flex-1 h-px mt-[11px] transition-colors ${
                  i < step ? "bg-[#6366f1]" : "bg-[#2a2a2a]"
                }`}
              />
            )}
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`w-[22px] h-[22px] rounded-full flex items-center justify-center text-[11px] font-semibold border-2 transition-all ${
                  i + 1 <= step
                    ? "bg-[#6366f1] border-[#6366f1] text-white"
                    : "bg-[#0f0f0f] border-[#2a2a2a] text-[#555555]"
                }`}
              >
                {i + 1 < step ? "✓" : i + 1}
              </div>
              <span
                className={`text-[10px] whitespace-nowrap ${
                  i + 1 <= step ? "text-[#888888]" : "text-[#555555]"
                }`}
              >
                {label}
              </span>
            </div>
          </React.Fragment>
        ))}
      </div>

      {/* ── Step indicator ──────────────────────────────────────────── */}
      <p className="text-[12px] text-[#555555] mb-5">
        Step {step} of 4 — {STEP_LABELS[step - 1]}
      </p>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* Step 1 — Your Week                                          */}
      {/* ════════════════════════════════════════════════════════════ */}
      {step === 1 && (
        <div>
          <h2 className="text-[22px] font-semibold text-[#f0f0f0] mb-1.5">
            Which week are you planning?
          </h2>
          <p className="text-[14px] text-[#888888] mb-7">
            We&apos;ll build your schedule around this window.
          </p>

          <div
            className={`grid gap-3 ${
              weekOptions.length > 1 ? "grid-cols-2" : "grid-cols-1 max-w-xs"
            }`}
          >
            {weekOptions.map(({ label, monday }) => {
              const dateStr = toLocalDateString(monday);
              const selected = data.weekStartDate === dateStr;
              return (
                <button
                  key={dateStr}
                  type="button"
                  onClick={() => setField("weekStartDate", dateStr)}
                  className={`rounded-lg border-2 px-5 py-4 text-left transition-all ${
                    selected
                      ? "border-[#6366f1] bg-[#1e1b4b]/40"
                      : "border-[#2a2a2a] bg-[#1a1a1a] hover:border-[#3a3a3a]"
                  }`}
                >
                  <div
                    className={`text-[11px] font-medium uppercase tracking-[0.06em] mb-1.5 ${
                      selected ? "text-[#a5b4fc]" : "text-[#555555]"
                    }`}
                  >
                    {label}
                  </div>
                  <div
                    className={`text-[16px] font-semibold ${
                      selected ? "text-[#f0f0f0]" : "text-[#888888]"
                    }`}
                  >
                    {formatWeekRange(monday)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/* Step 2 — Preferences                                        */}
      {/* ════════════════════════════════════════════════════════════ */}
      {step === 2 && (
        <div>
          <h2 className="text-[22px] font-semibold text-[#f0f0f0] mb-1.5">
            Set your preferences
          </h2>
          <p className="text-[14px] text-[#888888] mb-8">
            These shape your daily schedule every week.
          </p>

          <div className="space-y-8">
            {/* Sleep */}
            <SetupSection title="Sleep">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={LABEL}>Bedtime</label>
                  <input
                    type="time"
                    className={INPUT}
                    value={data.preferred_bedtime}
                    onChange={(e) => setField("preferred_bedtime", e.target.value)}
                  />
                </div>
                <div>
                  <label className={LABEL}>Wake time</label>
                  <input
                    type="time"
                    className={INPUT}
                    value={data.preferred_wake_time}
                    onChange={(e) => setField("preferred_wake_time", e.target.value)}
                  />
                </div>
                <div>
                  <label className={LABEL}>Target (hrs)</label>
                  <input
                    type="number"
                    min="6"
                    max="10"
                    step="0.5"
                    className={INPUT}
                    value={data.sleep_target_hours}
                    onChange={(e) =>
                      setField("sleep_target_hours", Number(e.target.value))
                    }
                  />
                </div>
              </div>
            </SetupSection>

            {/* Routines */}
            <SetupSection title="Routines">
              {(
                [
                  { key: "morning_routine_mins", label: "Morning routine", min: 15, max: 90 },
                  { key: "night_routine_mins",   label: "Night routine",   min: 10, max: 60 },
                  { key: "shower_mins",          label: "Shower",          min: 5,  max: 30 },
                ] as const
              ).map(({ key, label, min, max }) => (
                <div key={key} className="flex items-center gap-4">
                  <label className="text-[13px] text-[#888888] w-36 shrink-0">
                    {label}
                  </label>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step="5"
                    className="flex-1 h-1 accent-[#6366f1]"
                    value={data[key]}
                    onChange={(e) => setField(key, Number(e.target.value))}
                  />
                  <span className="text-[13px] text-[#555555] w-14 text-right tabular-nums">
                    {data[key]} min
                  </span>
                </div>
              ))}
            </SetupSection>

            {/* Meals */}
            <SetupSection title="Meals">
              <div>
                <label className={LABEL}>Meals per day</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setField("meals_per_day", n)}
                      className={`w-9 h-9 rounded-md text-[13px] font-medium transition-colors ${
                        data.meals_per_day === n
                          ? "bg-[#6366f1] text-white"
                          : "bg-[#1a1a1a] border border-[#2a2a2a] text-[#888888] hover:border-[#3a3a3a]"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={LABEL}>Meal prep days</label>
                <div className="flex gap-2 flex-wrap">
                  {DAYS_SHORT.map((short, i) => {
                    const full = DAYS_FULL[i];
                    const active = data.meal_prep_days.includes(full);
                    return (
                      <button
                        key={full}
                        type="button"
                        onClick={() => toggleDay(full)}
                        className={`px-3 py-1 rounded text-[12px] font-medium transition-colors ${
                          active
                            ? "bg-[#1e1b4b] text-[#818cf8]"
                            : "bg-[#1a1a1a] border border-[#2a2a2a] text-[#555555] hover:border-[#3a3a3a]"
                        }`}
                      >
                        {short}
                      </button>
                    );
                  })}
                </div>
              </div>
            </SetupSection>

            {/* Fitness */}
            <SetupSection title="Fitness">
              {(
                [
                  { key: "gym_days_per_week",       label: "Gym days / week" },
                  { key: "muay_thai_days_per_week",  label: "Muay Thai days / week" },
                ] as const
              ).map(({ key, label }) => (
                <div key={key} className="flex items-center gap-4">
                  <label className="text-[13px] text-[#888888] w-44 shrink-0">
                    {label}
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setField(key, Math.max(0, data[key] - 1))}
                      className="w-8 h-8 rounded bg-[#2a2a2a] text-[#f0f0f0] hover:bg-[#3a3a3a] transition-colors text-[18px] flex items-center justify-center"
                    >
                      −
                    </button>
                    <span className="text-[#f0f0f0] font-semibold w-5 text-center tabular-nums">
                      {data[key]}
                    </span>
                    <button
                      type="button"
                      onClick={() => setField(key, Math.min(7, data[key] + 1))}
                      className="w-8 h-8 rounded bg-[#2a2a2a] text-[#f0f0f0] hover:bg-[#3a3a3a] transition-colors text-[18px] flex items-center justify-center"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </SetupSection>

            {/* Commute */}
            <SetupSection title="Commute">
              <div className="flex items-end gap-6">
                <div className="flex-1">
                  <label className={LABEL}>One-way commute (minutes)</label>
                  <input
                    type="number"
                    min="0"
                    max="180"
                    className={INPUT}
                    value={data.commute_minutes}
                    onChange={(e) =>
                      setField("commute_minutes", Number(e.target.value))
                    }
                  />
                </div>
                <div className="flex items-center gap-3 pb-0.5">
                  <button
                    type="button"
                    aria-label="Toggle remote work"
                    onClick={() => setField("is_remote", !data.is_remote)}
                    className={`relative w-10 h-5 rounded-full transition-colors ${
                      data.is_remote ? "bg-[#6366f1]" : "bg-[#2a2a2a]"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                        data.is_remote ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                  <span className="text-[13px] text-[#888888] whitespace-nowrap">
                    Remote work
                  </span>
                </div>
              </div>
            </SetupSection>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/* Step 3 — Tasks                                              */}
      {/* ════════════════════════════════════════════════════════════ */}
      {step === 3 && (
        <div>
          <h2 className="text-[22px] font-semibold text-[#f0f0f0] mb-1.5">
            What do you need to get done?
          </h2>
          <p className="text-[14px] text-[#888888] mb-7">
            Add everything on your plate. Sunday will fit it into your schedule.
          </p>

          {/* Task cards */}
          {data.tasks.length > 0 && (
            <div className="space-y-2 mb-4">
              {data.tasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-3 bg-[#1a1a1a] border border-[#2a2a2a] border-l-[3px] rounded-lg px-4 py-3"
                  style={{ borderLeftColor: PRIORITY_BORDER[task.priority] }}
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-[14px] font-medium text-[#f0f0f0] block truncate">
                      {task.title}
                    </span>
                    {task.deadlineText && (
                      <span className="text-[11px] text-[#555555]">
                        Due: {task.deadlineText}
                      </span>
                    )}
                  </div>
                  <span className="shrink-0 text-[11px] bg-[#2a2a2a] text-[#888888] px-2 py-0.5 rounded tabular-nums">
                    {formatMinutes(task.durationMinutes)}
                  </span>
                  <span
                    className="shrink-0 text-[11px] px-2 py-0.5 rounded capitalize"
                    style={{
                      backgroundColor: PRIORITY_BADGE_BG[task.priority],
                      color: PRIORITY_BADGE_COLOR[task.priority],
                    }}
                  >
                    {task.priority}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeTask(task.id)}
                    className="shrink-0 w-5 h-5 flex items-center justify-center text-[#555555] hover:text-[#f87171] transition-colors text-[18px] leading-none ml-1"
                    aria-label="Remove task"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {data.tasks.length === 0 && !showTaskForm && (
            <div className="py-10 text-center border border-dashed border-[#2a2a2a] rounded-lg mb-4">
              <p className="text-[13px] text-[#555555]">
                No tasks yet — this week might just be routines.
              </p>
            </div>
          )}

          {/* Inline add form */}
          {showTaskForm && (
            <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4 mb-4 space-y-3">
              <div>
                <label className={LABEL}>Task name</label>
                <input
                  type="text"
                  autoFocus
                  className={INPUT}
                  placeholder="e.g. Finish project proposal"
                  value={draft.title}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, title: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.preventDefault();
                  }}
                />
              </div>

              <div>
                <label className={LABEL}>Duration</label>
                <input
                  type="text"
                  className={INPUT}
                  placeholder="e.g. 90 mins, 2 hours"
                  value={draft.durationText}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, durationText: e.target.value }))
                  }
                />
                {draft.durationText && (
                  <p
                    className="text-[11px] mt-1 tabular-nums"
                    style={{
                      color: draftMins !== null ? "#a5b4fc" : "#f87171",
                    }}
                  >
                    {draftMins !== null
                      ? `= ${draftMins} minutes`
                      : "Couldn't parse — try \"90 mins\" or \"2 hours\""}
                  </p>
                )}
              </div>

              <div>
                <label className={LABEL}>Priority</label>
                <div className="flex gap-2 flex-wrap">
                  {PRIORITIES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setDraft((d) => ({ ...d, priority: p }))}
                      className={`px-3 py-1 rounded text-[12px] font-medium border transition-colors capitalize ${
                        draft.priority === p
                          ? PRIORITY_PILL_ACTIVE[p]
                          : "bg-[#1a1a1a] border-[#2a2a2a] text-[#555555] hover:border-[#3a3a3a]"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className={LABEL}>Deadline</label>
                <input
                  type="text"
                  className={INPUT}
                  placeholder="e.g. Wednesday, May 29, no deadline"
                  value={draft.deadlineText}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, deadlineText: e.target.value }))
                  }
                />
                <p className="text-[11px] text-[#555555] mt-1">
                  Exact date resolved automatically
                </p>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={addTask}
                  disabled={!draft.title.trim() || draftMins === null}
                  className="h-8 px-4 rounded-md text-[13px] font-medium bg-[#6366f1] text-white hover:bg-[#4f46e5] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Add to list
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowTaskForm(false);
                    setDraft(DEFAULT_DRAFT);
                  }}
                  className="h-8 px-4 rounded-md text-[13px] text-[#888888] border border-[#2a2a2a] hover:border-[#3a3a3a] hover:text-[#f0f0f0] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {!showTaskForm && (
            <button
              type="button"
              onClick={() => setShowTaskForm(true)}
              className="flex items-center gap-1.5 text-[13px] text-[#6366f1] hover:text-[#818cf8] transition-colors"
            >
              <span className="text-[17px] leading-none">+</span>
              Add task
            </button>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/* Step 4 — Review                                             */}
      {/* ════════════════════════════════════════════════════════════ */}
      {step === 4 && (
        <div>
          <h2 className="text-[22px] font-semibold text-[#f0f0f0] mb-1.5">
            Your week at a glance
          </h2>
          <p className="text-[14px] text-[#888888] mb-7">
            Review everything before we build your schedule.
          </p>

          {/* Summary card */}
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg divide-y divide-[#2a2a2a] mb-4">
            {/* Week dates */}
            <div className="flex items-center justify-between px-5 py-3.5">
              <span className="text-[11px] text-[#888888] uppercase tracking-[0.06em]">
                Week
              </span>
              <span className="text-[14px] text-[#f0f0f0]">
                {formatWeekRange(new Date(data.weekStartDate + "T12:00:00"))}
              </span>
            </div>

            {/* Sleep */}
            <div className="flex items-center justify-between px-5 py-3.5">
              <span className="text-[11px] text-[#888888] uppercase tracking-[0.06em]">
                Sleep
              </span>
              <span className="text-[14px] text-[#f0f0f0] tabular-nums">
                {data.preferred_bedtime} → {data.preferred_wake_time}
                <span className="text-[#555555] ml-2">
                  ({data.sleep_target_hours}h)
                </span>
              </span>
            </div>

            {/* Workouts */}
            <div className="flex items-center justify-between px-5 py-3.5">
              <span className="text-[11px] text-[#888888] uppercase tracking-[0.06em]">
                Workouts
              </span>
              <span className="text-[14px] text-[#f0f0f0]">
                {data.gym_days_per_week} gym + {data.muay_thai_days_per_week} Muay Thai
              </span>
            </div>

            {/* Tasks */}
            <div className="px-5 py-3.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] text-[#888888] uppercase tracking-[0.06em]">
                  Tasks
                </span>
                <span className="text-[14px] text-[#f0f0f0]">
                  {data.tasks.length} task{data.tasks.length !== 1 ? "s" : ""}
                  {data.tasks.length > 0 && (
                    <span className="text-[#555555] ml-2">
                      ({formatMinutes(totalTaskMins)} total)
                    </span>
                  )}
                </span>
              </div>
              {data.tasks.length > 0 ? (
                <div className="space-y-1.5 mt-2">
                  {data.tasks.map((task) => (
                    <div key={task.id} className="flex items-center gap-2.5">
                      <div
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: PRIORITY_BORDER[task.priority] }}
                      />
                      <span className="text-[13px] text-[#888888] flex-1 truncate">
                        {task.title}
                      </span>
                      <span className="text-[11px] text-[#555555] tabular-nums shrink-0">
                        {formatMinutes(task.durationMinutes)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[13px] text-[#555555]">
                  No tasks — routine-only week
                </p>
              )}
            </div>
          </div>

          {/* Free time line */}
          {data.tasks.length > 0 && (
            <p className="text-[12px] text-[#555555] mb-3 tabular-nums">
              ~{freeHours}h estimated free time · {taskHours.toFixed(1)}h of tasks
            </p>
          )}

          {/* Overload warning */}
          {isHeavy && (
            <div className="rounded-lg border border-[#d97706]/30 bg-[#78350f]/20 px-4 py-3 text-[13px] text-[#fcd34d] mb-4">
              You have {taskHours.toFixed(1)}h of tasks in a week with ~{freeHours}h
              of free time. Consider reducing or lowering some priorities.
            </div>
          )}

          {/* Error */}
          {errMsg && (
            <div className="rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] px-4 py-3 text-[13px] text-[#f87171] mb-4">
              {errMsg}
            </div>
          )}

          {/* Generate button */}
          <button
            type="button"
            disabled={generating}
            onClick={handleGenerate}
            className={`w-full h-11 rounded-lg text-[14px] font-semibold text-white flex items-center justify-center gap-2 transition-colors ${
              generating
                ? "bg-[#6366f1] opacity-70 animate-pulse cursor-not-allowed"
                : "bg-[#6366f1] hover:bg-[#4f46e5]"
            }`}
          >
            {generating ? LOADING_MESSAGES[loadingMsgIdx] : "Generate My Week →"}
          </button>
        </div>
      )}

      {/* ── Navigation (steps 1–3) ───────────────────────────────── */}
      {step < 4 && (
        <div className="flex items-center justify-between mt-10 pt-6 border-t border-[#2a2a2a]">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="h-9 px-4 rounded-md text-[13px] text-[#888888] border border-[#2a2a2a] hover:border-[#3a3a3a] hover:text-[#f0f0f0] transition-colors"
            >
              ← Back
            </button>
          ) : (
            <div />
          )}

          <button
            type="button"
            onClick={() => {
              if (step === 3 && showTaskForm) {
                setShowTaskForm(false);
                setDraft(DEFAULT_DRAFT);
              }
              setStep((s) => s + 1);
            }}
            className="h-9 px-5 rounded-md text-[13px] font-medium bg-[#6366f1] text-white hover:bg-[#4f46e5] transition-colors"
          >
            {step === 1 ? "Looks good, continue →" : "Continue →"}
          </button>
        </div>
      )}

      {/* Back link on step 4 */}
      {step === 4 && !generating && (
        <div className="mt-5">
          <button
            type="button"
            onClick={() => setStep(3)}
            className="text-[13px] text-[#555555] hover:text-[#888888] transition-colors"
          >
            ← Back to Tasks
          </button>
        </div>
      )}
    </div>
  );
}
