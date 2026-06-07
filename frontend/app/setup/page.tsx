"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  savePreferences, generateSchedule, createTask, getAllTasks,
  getLatestPreferences, getRecentTasks,
  getSavedLocations, saveLocation,
  type WeeklyPreferences, type Task as ApiTask, type UserLocation,
} from "@/lib/api";
import Toggle from "@/components/Toggle";
import { useAuth } from "@/contexts/AuthContext";

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAYS_FULL  = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

const PRIORITIES = ["critical", "high", "medium", "low", "optional"] as const;

const LOADING_MESSAGES = [
  "Protecting your sleep...",
  "Locking in your routines...",
  "Scheduling workouts...",
  "Blocking commute time...",
  "Building your week...",
];

const DRAFT_KEY = "sunday_setup_draft";

// ─── Types ────────────────────────────────────────────────────────────────────

type Priority    = "critical" | "high" | "medium" | "low" | "optional";
type ShowerPref  = "morning" | "night" | "both";
type WorkoutTime = "morning" | "afternoon" | "evening";
type EnergyPref  = "front_load" | "spread_out";
type Mode        = "ai" | "manual";
type TimingPref  = "ai_decide" | "morning" | "afternoon" | "evening";
type MealTiming  = "Early" | "Normal" | "Late";

interface FixedCommitment {
  id: string; name: string; time: string; duration: number; days: string[];
}

interface WizardTask {
  id: string;
  title: string;
  duration_minutes: number;
  priority: Priority;
  timing_preference: TimingPref;
  preferred_days: string[];
  is_flexible: boolean;
  fixed_start_time?: string;   // "HH:MM" 24h
  fixed_end_time?: string;     // "HH:MM" 24h
  commute_minutes: number;     // one-way, 0 = no travel
  is_recurring?: boolean;
}

interface WizardData {
  preferred_bedtime: string;
  preferred_wake_time: string;
  sleep_target_hours: number;
  morning_routine_mins: number;
  night_routine_mins: number;
  shower_preference: ShowerPref;
  shower_mins: number;
  meals_per_day: number;
  meal_duration_mins: number;
  meal_prep_days: string[];
  gym_days_per_week: number;
  gym_duration_mins: number;
  muay_thai_days_per_week: number;
  muay_thai_duration_mins: number;
  workout_time_preference: WorkoutTime;
  is_remote: boolean;
  work_location_name: string;
  commute_minutes: number;
  work_days_per_week: number;
  weekly_task_capacity_hours: number;
  energy_preference: EnergyPref;
  fixed_commitments: FixedCommitment[];
  tasks: WizardTask[];
  extra_context: string;
  // AI mode quick-prefs
  ai_meals_per_day: number;
  ai_meal_duration_mins: number;
  ai_has_commute: boolean;
  ai_commute_mins: number;
  // Meal timing preferences (shared between AI and manual)
  breakfast_timing: MealTiming;
  lunch_timing:     MealTiming;
  dinner_timing:    MealTiming;
  // Deep work preferences
  deep_work_enabled: boolean;
  deep_work_session_duration: number;
}

interface DraftState {
  savedAt: string;
  mode: Mode;
  step: number;
  data: WizardData;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getCurrentMonday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dow = today.getDay(); // 0=Sun, 1=Mon … 6=Sat
  const diff = dow === 0 ? -6 : 1 - dow; // Sunday → back 6; else → back to Monday
  const d = new Date(today);
  d.setDate(today.getDate() + diff);
  return d;
}

function timeToMins(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minsToTime(mins: number): string {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function formatWeekRange(monday: Date): string {
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  const s = monday.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const e = sunday.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${s} – ${e}`;
}

function fmt12(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour   = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

function calcSleepHours(bed: string, wake: string): number {
  const b = timeToMins(bed); let w = timeToMins(wake);
  if (w <= b) w += 1440;
  return Math.round((w - b) / 6) / 10;
}

function fmtDuration(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatDraftDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
      month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  } catch {
    return "earlier";
  }
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULTS: WizardData = {
  preferred_bedtime: "23:00",
  preferred_wake_time: "07:00",
  sleep_target_hours: 8,
  morning_routine_mins: 30,
  night_routine_mins: 20,
  shower_preference: "morning",
  shower_mins: 15,
  meals_per_day: 3,
  meal_duration_mins: 20,
  meal_prep_days: [],
  gym_days_per_week: 3,
  gym_duration_mins: 75,
  muay_thai_days_per_week: 2,
  muay_thai_duration_mins: 90,
  workout_time_preference: "morning",
  is_remote: false,
  work_location_name: "",
  commute_minutes: 30,
  work_days_per_week: 5,
  weekly_task_capacity_hours: 40,
  energy_preference: "front_load",
  fixed_commitments: [],
  tasks: [],
  extra_context: "",
  ai_meals_per_day: 3,
  ai_meal_duration_mins: 20,
  ai_has_commute: false,
  ai_commute_mins: 30,
  breakfast_timing: "Normal",
  lunch_timing:     "Normal",
  dinner_timing:    "Normal",
  deep_work_enabled: false,
  deep_work_session_duration: 120,
};

// ─── Last-week helpers ────────────────────────────────────────────────────────

function prefsToWizardData(prefs: WeeklyPreferences): Partial<WizardData> {
  return {
    preferred_bedtime:        prefs.preferred_bedtime,
    preferred_wake_time:      prefs.preferred_wake_time,
    sleep_target_hours:       prefs.sleep_target_hours,
    morning_routine_mins:     prefs.morning_routine_mins,
    night_routine_mins:       prefs.night_routine_mins,
    shower_preference:        prefs.shower_preference as ShowerPref,
    shower_mins:              prefs.shower_mins,
    meals_per_day:            prefs.meals_per_day,
    meal_duration_mins:       prefs.meal_duration_mins,
    meal_prep_days:           prefs.meal_prep_days,
    gym_days_per_week:        prefs.gym_days_per_week,
    gym_duration_mins:        prefs.gym_duration_mins,
    muay_thai_days_per_week:  prefs.muay_thai_days_per_week,
    muay_thai_duration_mins:  prefs.muay_thai_duration_mins,
    workout_time_preference:  prefs.workout_time_preference as WorkoutTime,
    is_remote:                prefs.is_remote,
    work_location_name:       prefs.work_location_name ?? "",
    commute_minutes:          prefs.commute_minutes,
    work_days_per_week:       prefs.work_days_per_week,
    weekly_task_capacity_hours: prefs.weekly_task_capacity_hours,
    energy_preference:        prefs.energy_preference as EnergyPref,
    extra_context:            prefs.extra_context ?? "",
    deep_work_enabled:        prefs.deep_work_enabled,
    deep_work_session_duration: prefs.deep_work_session_duration,
  };
}

function apiTaskToWizardTask(t: ApiTask, idx: number): WizardTask {
  let preferred_days: string[] = [];
  try {
    if (t.preferred_days) preferred_days = JSON.parse(t.preferred_days);
  } catch { /* ignore */ }
  return {
    id: `last-${t.id}-${idx}`,
    title: t.title,
    duration_minutes: t.duration_minutes,
    priority: (t.priority as Priority) ?? "medium",
    timing_preference: (t.timing_preference as TimingPref) ?? "ai_decide",
    preferred_days,
    is_flexible: t.is_flexible,
    fixed_start_time: t.fixed_start_time ?? undefined,
    fixed_end_time:   t.fixed_end_time   ?? undefined,
    commute_minutes:  t.commute_minutes  ?? 0,
    is_recurring:     t.is_recurring,
  };
}

// ─── UI Primitives ────────────────────────────────────────────────────────────

function TimePicker({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-5">
      <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{label}</span>
      <div className="flex items-center gap-5">
        <button type="button" onClick={() => onChange(minsToTime(timeToMins(value) - 15))}
          className="w-11 h-11 rounded-full border border-gray-200 text-gray-500 text-xl flex items-center justify-center hover:bg-gray-50 transition-colors select-none">
          −
        </button>
        <div className="text-[2.6rem] font-light text-gray-900 tabular-nums tracking-tight w-40 text-center leading-none">
          {fmt12(value)}
        </div>
        <button type="button" onClick={() => onChange(minsToTime(timeToMins(value) + 15))}
          className="w-11 h-11 rounded-full border border-gray-200 text-gray-500 text-xl flex items-center justify-center hover:bg-gray-50 transition-colors select-none">
          +
        </button>
      </div>
    </div>
  );
}

function Stepper({ label, value, onChange, min = 0, max = 180, step = 5, unit = "min" }: {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number; unit?: string;
}) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-gray-100 last:border-0">
      <span className="text-[15px] text-gray-700">{label}</span>
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => onChange(Math.max(min, value - step))}
          className="w-9 h-9 rounded-full border border-gray-200 text-gray-600 flex items-center justify-center hover:bg-gray-50 transition-colors select-none text-lg">
          −
        </button>
        <span className="text-[15px] font-medium text-gray-900 w-20 text-center tabular-nums">
          {value} {unit}
        </span>
        <button type="button" onClick={() => onChange(Math.min(max, value + step))}
          className="w-9 h-9 rounded-full border border-gray-200 text-gray-600 flex items-center justify-center hover:bg-gray-50 transition-colors select-none text-lg">
          +
        </button>
      </div>
    </div>
  );
}

// ─── Inline Time Picker (compact, for fixed-time task start/end) ─────────────

function InlineTimePicker({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  const [h, m] = value.split(":").map(Number);
  const isPM = h >= 12;
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;

  function applyHour(newH12: number, newIsPM: boolean) {
    let h24: number;
    if (newIsPM) { h24 = newH12 === 12 ? 12 : newH12 + 12; }
    else         { h24 = newH12 === 12 ? 0  : newH12;      }
    onChange(`${String(h24).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }

  function applyMinute(newM: number) {
    onChange(`${String(h).padStart(2, "0")}:${String(newM).padStart(2, "0")}`);
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">{label}</p>
      <div className="flex items-center gap-1.5">
        <select
          value={hour12}
          onChange={e => applyHour(Number(e.target.value), isPM)}
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-[14px] text-gray-900 bg-white focus:outline-none focus:border-indigo-300 transition-colors"
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map(hr => (
            <option key={hr} value={hr}>{hr}</option>
          ))}
        </select>
        <span className="text-gray-400 font-bold">:</span>
        <select
          value={m}
          onChange={e => applyMinute(Number(e.target.value))}
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-[14px] text-gray-900 bg-white focus:outline-none focus:border-indigo-300 transition-colors"
        >
          {[0, 15, 30, 45].map(min => (
            <option key={min} value={min}>{String(min).padStart(2, "0")}</option>
          ))}
        </select>
        <div className="flex border border-gray-200 rounded-lg overflow-hidden">
          <button type="button" onClick={() => applyHour(hour12, false)}
            className={`px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${!isPM ? "bg-indigo-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
            AM
          </button>
          <button type="button" onClick={() => applyHour(hour12, true)}
            className={`px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${isPM ? "bg-indigo-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
            PM
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Duration Input (hours + minutes) ────────────────────────────────────────

function fmtTaskDuration(totalMins: number): string {
  if (totalMins <= 0) return "—";
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr${h !== 1 ? "s" : ""}`;
  return `${h} hr${h !== 1 ? "s" : ""} ${m} min`;
}

function HrMinInput({ value, onChange }: { value: number; onChange: (mins: number) => void }) {
  const hrs = Math.floor(value / 60);
  const mins = value % 60;

  function setHrs(h: number) {
    const clamped = Math.max(0, Math.min(16, h));
    // Keep at least 15 min when hours drop to 0
    const newMins = clamped === 0 && mins === 0 ? 15 : mins;
    onChange(clamped * 60 + newMins);
  }
  function setMins(m: number) {
    // When hours is 0 and user picks 0 min, snap to 15
    if (hrs === 0 && m === 0) { onChange(15); return; }
    onChange(hrs * 60 + m);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-4">
        {/* Hours counter */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setHrs(hrs - 1)}
            disabled={hrs === 0}
            className="w-8 h-8 rounded-lg border border-gray-200 text-gray-600 flex items-center justify-center hover:bg-gray-50 transition-colors disabled:opacity-30 select-none text-lg leading-none"
          >
            −
          </button>
          <span className="text-[16px] font-semibold text-gray-900 w-5 text-center tabular-nums">{hrs}</span>
          <button
            type="button"
            onClick={() => setHrs(hrs + 1)}
            disabled={hrs >= 16}
            className="w-8 h-8 rounded-lg border border-gray-200 text-gray-600 flex items-center justify-center hover:bg-gray-50 transition-colors disabled:opacity-30 select-none text-lg leading-none"
          >
            +
          </button>
          <span className="text-[13px] text-gray-500 font-medium">hr</span>
        </div>

        <span className="text-gray-200 select-none">·</span>

        {/* Minutes dropdown */}
        <div className="flex items-center gap-2">
          <select
            value={mins}
            onChange={e => setMins(Number(e.target.value))}
            className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-[14px] text-gray-900 bg-white focus:outline-none focus:border-indigo-300 transition-colors"
          >
            {(hrs === 0 ? [15, 30, 45] : [0, 15, 30, 45]).map(m => (
              <option key={m} value={m}>{m} min</option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-[12px] text-indigo-600 font-medium">{fmtTaskDuration(value)}</p>
    </div>
  );
}

// ─── Chip selectors ───────────────────────────────────────────────────────────

function Chips<T extends string>({ options, value, onChange, multi = false }: {
  options: { value: T; label: string }[];
  value: T | T[];
  onChange: (v: T | T[]) => void;
  multi?: boolean;
}) {
  const isActive = (v: T) => multi ? (value as T[]).includes(v) : value === v;
  const toggle = (v: T) => {
    if (!multi) { onChange(v); return; }
    const arr = value as T[];
    onChange(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);
  };
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => (
        <button key={opt.value} type="button" onClick={() => toggle(opt.value)}
          className={`px-4 py-2 rounded-full text-[14px] font-medium border transition-all ${
            isActive(opt.value) ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
          }`}>
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function NumberChips({ options, value, onChange }: {
  options: number[]; value: number; onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(n => (
        <button key={n} type="button" onClick={() => onChange(n)}
          className={`w-10 h-10 rounded-full text-[14px] font-medium border transition-all ${
            value === n ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
          }`}>
          {n}
        </button>
      ))}
    </div>
  );
}

// ─── Step shell ───────────────────────────────────────────────────────────────

function StepShell({ headline, subtext, children }: {
  headline: string; subtext: string; children: React.ReactNode;
}) {
  return (
    <div className="w-full max-w-lg mx-auto">
      <h1 className="text-[2rem] font-semibold text-gray-900 leading-tight mb-3 tracking-tight">
        {headline}
      </h1>
      <p className="text-[16px] text-gray-500 mb-10 leading-relaxed">{subtext}</p>
      {children}
    </div>
  );
}

// ─── MODE SCREEN ──────────────────────────────────────────────────────────────

function ModeScreen({ onSelect, weekTarget, setWeekTarget, lastWeekPrefs, lastWeekTasks, onUseLastWeekAsTemplate, onSameAsLastWeek }: {
  onSelect: (m: Mode) => void;
  weekTarget: "current" | "next";
  setWeekTarget: (t: "current" | "next") => void;
  lastWeekPrefs?: WeeklyPreferences | null;
  lastWeekTasks?: ApiTask[] | null;
  onUseLastWeekAsTemplate?: () => void;
  onSameAsLastWeek?: () => void;
}) {
  return (
    <div className="w-full max-w-lg mx-auto fade-in">
      {/* Last week summary card */}
      {lastWeekPrefs && (
        <div className="mb-6 bg-indigo-50 border border-indigo-100 rounded-2xl p-5">
          <p className="text-[12px] font-semibold text-indigo-500 uppercase tracking-widest mb-3">From last week</p>
          <div className="grid grid-cols-2 gap-2 mb-4 text-[13px] text-gray-700">
            <span>Sleep: {lastWeekPrefs.preferred_wake_time} – {lastWeekPrefs.preferred_bedtime}</span>
            <span>Meals: {lastWeekPrefs.meals_per_day}/day</span>
            <span>Gym: {lastWeekPrefs.gym_days_per_week}× / MT: {lastWeekPrefs.muay_thai_days_per_week}×</span>
            {lastWeekTasks && <span>Tasks: {lastWeekTasks.length}</span>}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onUseLastWeekAsTemplate}
              className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
            >
              Use last week as template
            </button>
            <button
              type="button"
              onClick={() => onSelect("manual")}
              className="flex-1 py-2.5 rounded-xl text-[13px] font-medium border border-indigo-200 text-indigo-600 hover:bg-indigo-100 transition-colors"
            >
              Start fresh
            </button>
          </div>
        </div>
      )}

      {/* Week selector */}
      <div className="mb-8">
        <p className="text-[13px] font-semibold text-gray-400 uppercase tracking-widest mb-3 text-center">
          Which week are you planning?
        </p>
        <div className="flex bg-gray-100 rounded-full p-1 gap-1 max-w-xs mx-auto">
          {(["current", "next"] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setWeekTarget(t)}
              className={`flex-1 py-2 rounded-full text-[14px] font-semibold transition-all ${
                weekTarget === t
                  ? "bg-white text-indigo-600 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t === "current" ? "This week" : "Next week"}
            </button>
          ))}
        </div>
        {weekTarget === "next" && (
          <div className="mt-3 flex items-center gap-2 justify-center text-[13px] text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-2.5 max-w-xs mx-auto">
            <span>✦</span>
            <span>Goes live automatically on Sunday at midnight</span>
          </div>
        )}
      </div>

      <h1 className="text-[2rem] font-semibold text-gray-900 leading-tight mb-3 tracking-tight">
        How do you want to plan?
      </h1>
      <p className="text-[16px] text-gray-500 mb-10 leading-relaxed">Sunday works two ways.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {([
          {
            mode: "ai" as Mode,
            emoji: "🤖",
            label: "AI Mode",
            desc: "Sunday decides your sleep time, wake time, meals and workouts. Just follow the schedule.",
          },
          {
            mode: "manual" as Mode,
            emoji: "✏️",
            label: "Manual Mode",
            desc: "Tell Sunday your preferences and it builds around them.",
          },
        ]).map(opt => (
          <button key={opt.mode} type="button" onClick={() => onSelect(opt.mode)}
            className="p-6 rounded-2xl border-2 border-gray-200 bg-white text-left hover:border-indigo-600 hover:bg-indigo-50 transition-all group">
            <div className="text-3xl mb-4">{opt.emoji}</div>
            <div className="text-[17px] font-semibold text-gray-900 mb-2 group-hover:text-gray-900">{opt.label}
            </div>
            <div className="text-[14px] text-gray-500 leading-relaxed">{opt.desc}</div>
          </button>
        ))}
      </div>

      {/* Same as last week */}
      {lastWeekPrefs && onSameAsLastWeek && (
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={onSameAsLastWeek}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border-2 border-gray-200 text-[14px] font-semibold text-gray-700 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
          >
            <span>⚡</span>
            <span>Same as last week</span>
          </button>
          <p className="text-[12px] text-gray-400 mt-2">Copies settings and recurring tasks, generates immediately.</p>
        </div>
      )}
    </div>
  );
}

// ─── Step 1 — Sleep ───────────────────────────────────────────────────────────

function Step1({ data, set }: { data: WizardData; set: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void }) {
  const sleepHours = calcSleepHours(data.preferred_bedtime, data.preferred_wake_time);
  return (
    <StepShell headline="When do you sleep?" subtext="Let's protect your sleep first. Sunday will block this time automatically, every single night.">
      <div className="flex flex-col sm:flex-row items-center justify-center gap-10 mb-10">
        <TimePicker label="Bedtime" value={data.preferred_bedtime}
          onChange={v => { set("preferred_bedtime", v); set("sleep_target_hours", calcSleepHours(v, data.preferred_wake_time)); }} />
        <div className="hidden sm:block w-px h-24 bg-gray-100" />
        <TimePicker label="Wake up" value={data.preferred_wake_time}
          onChange={v => { set("preferred_wake_time", v); set("sleep_target_hours", calcSleepHours(data.preferred_bedtime, v)); }} />
      </div>
      <div className="text-center">
        <div className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[15px] font-medium ${
          sleepHours >= 7 ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
        }`}>
          <span className={`w-2 h-2 rounded-full ${sleepHours >= 7 ? "bg-green-500" : "bg-amber-500"}`} />
          {sleepHours} hours of sleep
        </div>
      </div>
      <div className="mt-6">
        <p className="text-[13px] font-semibold text-zinc-400 uppercase tracking-widest mb-3 text-center">Sleep goal</p>
        <div className="flex justify-center gap-3">
          {[6, 7, 8, 9].map(h => (
            <button key={h} type="button"
              onClick={() => set("sleep_target_hours", h)}
              className={`w-12 h-12 rounded-xl text-[15px] font-semibold border-2 transition-all ${
                data.sleep_target_hours === h
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-zinc-600 border-zinc-200 hover:border-indigo-300"
              }`}>
              {h}h
            </button>
          ))}
        </div>
      </div>
      {/* Sleep-as-constraint reinforcement */}
      <p className="text-center text-[13px] text-gray-400 mt-6 leading-relaxed max-w-sm mx-auto">
        Sunday will always block this time off. You never need to add sleep as a task.
      </p>
    </StepShell>
  );
}

// ─── Step 2 — Daily Rhythm ────────────────────────────────────────────────────

function Step2({ data, set }: { data: WizardData; set: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void }) {
  const toggleMealPrepDay = (full: string) => {
    set("meal_prep_days", data.meal_prep_days.includes(full)
      ? data.meal_prep_days.filter(d => d !== full)
      : [...data.meal_prep_days, full]);
  };
  return (
    <StepShell headline="What does your day actually look like?" subtext="These blocks are reserved automatically — every day.">
      <div className="space-y-0 bg-white rounded-2xl border border-gray-100 divide-y divide-gray-100 mb-8">
        <Stepper label="Morning routine" value={data.morning_routine_mins} onChange={v => set("morning_routine_mins", v)} min={10} max={120} />
        <Stepper label="Night routine"   value={data.night_routine_mins}   onChange={v => set("night_routine_mins", v)}   min={5}  max={60}  />
        <Stepper label="Shower duration" value={data.shower_mins}          onChange={v => set("shower_mins", v)}          min={5}  max={30}  />
      </div>
      <div className="mb-8">
        <p className="text-[13px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Shower time</p>
        <Chips options={[
          {value: "morning" as ShowerPref, label: "Morning"},
          {value: "night"   as ShowerPref, label: "Night"},
          {value: "both"    as ShowerPref, label: "Both"},
        ]} value={data.shower_preference} onChange={v => set("shower_preference", v as ShowerPref)} />
      </div>
      <div className="mb-8">
        <p className="text-[13px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Meals per day</p>
        <NumberChips options={[1,2,3,4]} value={data.meals_per_day} onChange={v => set("meals_per_day", v)} />
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-100 mb-8">
        <Stepper label="Average meal duration" value={data.meal_duration_mins} onChange={v => set("meal_duration_mins", v)} min={10} max={60} />
      </div>
      <div className="space-y-5 mb-8">
        <MealTimingRow meal="Breakfast" value={data.breakfast_timing}
          onChange={v => set("breakfast_timing", v)} />
        {data.meals_per_day >= 3 && (
          <MealTimingRow meal="Lunch" value={data.lunch_timing}
            onChange={v => set("lunch_timing", v)} />
        )}
        {data.meals_per_day >= 2 && (
          <MealTimingRow meal="Dinner" value={data.dinner_timing}
            onChange={v => set("dinner_timing", v)} />
        )}
      </div>
      <div>
        <p className="text-[13px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Meal prep days</p>
        <p className="text-[14px] text-gray-500 mb-3">Leave empty if you don&apos;t meal prep.</p>
        <div className="flex flex-wrap gap-2">
          {DAYS_SHORT.map((short, i) => {
            const full = DAYS_FULL[i];
            const active = data.meal_prep_days.includes(full);
            return (
              <button key={full} type="button" onClick={() => toggleMealPrepDay(full)}
                className={`px-4 py-2 rounded-full text-[14px] font-medium border transition-all ${
                  active ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                }`}>
                {short}
              </button>
            );
          })}
        </div>
        {data.meal_prep_days.length > 0 && (
          <p className="text-[13px] text-gray-400 mt-3">
            {data.meal_prep_days.length} day{data.meal_prep_days.length !== 1 ? "s" : ""} of meal prep blocked per week.
          </p>
        )}
      </div>
    </StepShell>
  );
}

// ─── Step 3 — Movement ────────────────────────────────────────────────────────

function Step3({ data, set }: { data: WizardData; set: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void }) {
  return (
    <StepShell headline="How do you train?" subtext="Sunday schedules your workouts before filling in everything else.">
      <div className="space-y-8">
        <div>
          <p className="text-[13px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Gym days per week</p>
          <NumberChips options={[0,1,2,3,4,5,6,7]} value={data.gym_days_per_week} onChange={v => set("gym_days_per_week", v)} />
          {data.gym_days_per_week > 0 && (
            <div className="mt-4 bg-white rounded-2xl border border-gray-100">
              <Stepper label="Session duration" value={data.gym_duration_mins} onChange={v => set("gym_duration_mins", v)} min={30} max={180} step={15} />
            </div>
          )}
        </div>
        <div>
          <p className="text-[13px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Muay Thai days per week</p>
          <p className="text-[14px] text-gray-400 mb-3">Set to 0 if you don&apos;t train.</p>
          <NumberChips options={[0,1,2,3,4,5,6,7]} value={data.muay_thai_days_per_week} onChange={v => set("muay_thai_days_per_week", v)} />
          {data.muay_thai_days_per_week > 0 && (
            <div className="mt-4 bg-white rounded-2xl border border-gray-100">
              <Stepper label="Session duration" value={data.muay_thai_duration_mins} onChange={v => set("muay_thai_duration_mins", v)} min={45} max={180} step={15} />
            </div>
          )}
        </div>
        {(data.gym_days_per_week > 0 || data.muay_thai_days_per_week > 0) && (
          <div>
            <p className="text-[13px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Preferred workout time</p>
            <Chips options={[
              {value: "morning"   as WorkoutTime, label: "Morning"},
              {value: "afternoon" as WorkoutTime, label: "Afternoon"},
              {value: "evening"   as WorkoutTime, label: "Evening"},
            ]} value={data.workout_time_preference} onChange={v => set("workout_time_preference", v as WorkoutTime)} />
          </div>
        )}
      </div>
    </StepShell>
  );
}

// ─── Step 4 — Location ────────────────────────────────────────────────────────

function Step4({ data, set }: { data: WizardData; set: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void }) {
  return (
    <StepShell headline="Where does life take you?" subtext="Commute time is blocked automatically on the right days.">
      <div className="mb-8">
        <p className="text-[13px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Work arrangement</p>
        <div className="grid grid-cols-2 gap-3">
          {([
            {val: false, label: "In person", desc: "You commute to a location regularly"},
            {val: true,  label: "Remote",    desc: "You work from home — no commute needed"},
          ] as const).map(opt => (
            <button key={String(opt.val)} type="button" onClick={() => set("is_remote", opt.val)}
              className={`p-5 rounded-2xl border-2 text-left transition-all ${
                data.is_remote === opt.val ? "border-indigo-600 bg-indigo-50" : "border-gray-200 bg-white hover:border-gray-300"
              }`}>
              <div className={`text-[15px] font-semibold mb-1 ${data.is_remote === opt.val ? "text-gray-900" : "text-gray-700"}`}>{opt.label}</div>
              <div className="text-[13px] text-gray-500 leading-snug">{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>
      {!data.is_remote && (
        <div className="space-y-6 fade-in">
          <div>
            <label className="text-[13px] font-semibold text-gray-400 uppercase tracking-widest block mb-2">Location name</label>
            <input type="text" placeholder="e.g. Office, University, Studio"
              value={data.work_location_name} onChange={e => set("work_location_name", e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-[15px] text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400 transition-colors bg-white" />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Commute each way</p>
            <div className="bg-white rounded-2xl border border-gray-100">
              <Stepper label="Duration" value={data.commute_minutes} onChange={v => set("commute_minutes", v)} min={5} max={180} step={5} />
            </div>
          </div>
          <div>
            <p className="text-[13px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Days per week on-site</p>
            <NumberChips options={[1,2,3,4,5,6,7]} value={data.work_days_per_week} onChange={v => set("work_days_per_week", v)} />
            <p className="text-[13px] text-gray-400 mt-3">
              {data.commute_minutes * 2 * data.work_days_per_week} min commute blocked per week
            </p>
          </div>
        </div>
      )}
    </StepShell>
  );
}

// ─── Step 5 — Capacity ────────────────────────────────────────────────────────

function CommitmentForm({ onAdd }: { onAdd: (c: FixedCommitment) => void }) {
  const [name, setName]    = useState("");
  const [time, setTime]    = useState("09:00");
  const [dur,  setDur]     = useState(30);
  const [days, setDays]    = useState<string[]>([]);

  const canAdd = name.trim() && days.length > 0;
  const toggleDay = (full: string) => setDays(d => d.includes(full) ? d.filter(x => x !== full) : [...d, full]);
  const handleAdd = () => {
    if (!canAdd) return;
    onAdd({ id: `${Date.now()}`, name: name.trim(), time, duration: dur, days });
    setName(""); setTime("09:00"); setDur(30); setDays([]);
  };

  return (
    <div className="bg-gray-50 rounded-2xl p-5 space-y-4 border border-gray-100">
      <input type="text" placeholder="Commitment name (e.g. Team standup)" value={name} onChange={e => setName(e.target.value)}
        className="w-full px-4 py-3 rounded-xl border border-gray-200 text-[15px] text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400 bg-white" />
      <div className="flex gap-3">
        <div className="flex-1">
          <p className="text-[12px] text-gray-400 mb-1.5 uppercase tracking-wider font-semibold">Time</p>
          <input type="time" value={time} onChange={e => setTime(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-[15px] text-gray-900 bg-white focus:outline-none focus:border-gray-400" />
        </div>
        <div className="flex-1">
          <p className="text-[12px] text-gray-400 mb-1.5 uppercase tracking-wider font-semibold">Duration</p>
          <select value={dur} onChange={e => setDur(Number(e.target.value))}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-[15px] text-gray-900 bg-white focus:outline-none focus:border-gray-400">
            {[15,30,45,60,90,120].map(m => <option key={m} value={m}>{m} min</option>)}
          </select>
        </div>
      </div>
      <div>
        <p className="text-[12px] text-gray-400 mb-2 uppercase tracking-wider font-semibold">Which days</p>
        <div className="flex flex-wrap gap-2">
          {DAYS_SHORT.map((short, i) => {
            const full = DAYS_FULL[i];
            const active = days.includes(full);
            return (
              <button key={full} type="button" onClick={() => toggleDay(full)}
                className={`px-3 py-1.5 rounded-full text-[13px] font-medium border transition-all ${
                  active ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                }`}>
                {short}
              </button>
            );
          })}
        </div>
      </div>
      <button type="button" onClick={handleAdd} disabled={!canAdd}
        className="w-full py-3 rounded-xl text-[14px] font-semibold bg-indigo-600 text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-indigo-700 transition-colors">
        Add commitment
      </button>
    </div>
  );
}

function Step5({ data, set }: { data: WizardData; set: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void }) {
  const [showForm, setShowForm] = useState(false);
  const capacityPct = Math.min(100, (data.weekly_task_capacity_hours / 60) * 100);

  return (
    <StepShell headline="How much can you realistically take on?" subtext="Sunday will never schedule more than this.">
      <div className="space-y-8">
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[13px] font-semibold text-gray-400 uppercase tracking-widest">Weekly task capacity</p>
            <span className="text-[15px] font-semibold text-gray-900 tabular-nums">{data.weekly_task_capacity_hours} hrs / week</span>
          </div>
          <input type="range" min={5} max={60} step={5} value={data.weekly_task_capacity_hours}
            onChange={e => set("weekly_task_capacity_hours", Number(e.target.value))}
            className="wizard-range w-full h-2 rounded-full cursor-pointer"
            style={{ background: `linear-gradient(to right, #4f46e5 ${capacityPct}%, #e5e7eb ${capacityPct}%)` }} />
          <div className="flex justify-between mt-1.5">
            <span className="text-[12px] text-gray-400">Light week</span>
            <span className="text-[12px] text-gray-400">Full capacity</span>
          </div>
        </div>

        <div>
          <p className="text-[13px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Energy scheduling</p>
          <div className="grid grid-cols-2 gap-3">
            {([
              {val: "front_load" as EnergyPref, label: "Front-load", desc: "Hard work Mon–Wed, easier tasks later in the week"},
              {val: "spread_out" as EnergyPref, label: "Spread evenly", desc: "Tasks distributed evenly across all days"},
            ]).map(opt => (
              <button key={opt.val} type="button" onClick={() => set("energy_preference", opt.val)}
                className={`p-5 rounded-2xl border-2 text-left transition-all ${
                  data.energy_preference === opt.val ? "border-indigo-600 bg-indigo-50" : "border-gray-200 bg-white hover:border-gray-300"
                }`}>
                <div className={`text-[15px] font-semibold mb-1 ${data.energy_preference === opt.val ? "text-gray-900" : "text-gray-700"}`}>{opt.label}</div>
                <div className="text-[13px] text-gray-500 leading-snug">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[13px] font-semibold text-gray-400 uppercase tracking-widest">Fixed commitments</p>
            {!showForm && (
              <button type="button" onClick={() => setShowForm(true)}
                className="text-[13px] font-medium text-gray-900 hover:text-gray-600 transition-colors">+ Add</button>
            )}
          </div>
          {data.fixed_commitments.length > 0 && (
            <div className="space-y-2 mb-4">
              {data.fixed_commitments.map(c => (
                <div key={c.id} className="flex items-center justify-between bg-white rounded-xl border border-gray-100 px-4 py-3">
                  <div>
                    <span className="text-[14px] font-medium text-gray-900">{c.name}</span>
                    <span className="text-[13px] text-gray-400 ml-3">
                      {fmt12(c.time)} · {c.duration} min · {c.days.map(d => d.slice(0,3)).join(", ")}
                    </span>
                  </div>
                  <button type="button"
                    onClick={() => set("fixed_commitments", data.fixed_commitments.filter(x => x.id !== c.id))}
                    className="text-gray-300 hover:text-gray-600 transition-colors text-xl leading-none ml-3">×</button>
                </div>
              ))}
            </div>
          )}
          {!showForm && data.fixed_commitments.length === 0 && (
            <p className="text-[14px] text-gray-400">No fixed commitments — skip if none.</p>
          )}
          {showForm && (
            <div className="fade-in">
              <CommitmentForm onAdd={c => { set("fixed_commitments", [...data.fixed_commitments, c]); setShowForm(false); }} />
              <button type="button" onClick={() => setShowForm(false)}
                className="mt-3 text-[13px] text-gray-400 hover:text-gray-600 transition-colors">Cancel</button>
            </div>
          )}
        </div>
      </div>
    </StepShell>
  );
}

// ─── TASKS STEP ───────────────────────────────────────────────────────────────

function DraftTaskForm({ onAdd, onUpdate, onCancel, mode, initialTask, savedLocations }: {
  onAdd: (t: WizardTask) => void;
  onUpdate?: (t: WizardTask) => void;
  onCancel: () => void;
  mode?: Mode | null;
  initialTask?: WizardTask;
  savedLocations?: UserLocation[];
}) {
  const isEditMode = Boolean(initialTask && onUpdate);

  // Derive initial timingMode from initialTask
  const initTimingMode: "ai" | "manual" | "fixed" = initialTask
    ? (!initialTask.is_flexible && initialTask.fixed_start_time ? "fixed"
      : initialTask.timing_preference && initialTask.timing_preference !== "ai_decide" ? "manual"
      : "ai")
    : "ai";
  const initTimeOfDay: "" | "morning" | "afternoon" | "evening" =
    (initialTask?.timing_preference && ["morning","afternoon","evening"].includes(initialTask.timing_preference)
      ? initialTask.timing_preference as "morning" | "afternoon" | "evening"
      : "");

  const [title,        setTitle]       = useState(initialTask?.title ?? "");
  const [duration,     setDuration]    = useState(initialTask?.duration_minutes ?? 30);
  const [priority,     setPriority]    = useState<Priority>(initialTask?.priority ?? "medium");
  const [timingMode,   setTimingMode]  = useState<"ai" | "manual" | "fixed">(initTimingMode);
  const [timeOfDay,    setTimeOfDay]   = useState<"" | "morning" | "afternoon" | "evening">(initTimeOfDay);
  const [prefDays,     setPrefDays]    = useState<string[]>(initialTask?.preferred_days ?? []);
  const [fixedStart,   setFixedStart]  = useState(initialTask?.fixed_start_time ?? "09:00");
  const [fixedEnd,     setFixedEnd]    = useState(initialTask?.fixed_end_time   ?? "17:00");
  const [hasCommute,   setHasCommute]  = useState((initialTask?.commute_minutes ?? 0) > 0);
  const [commuteMins,  setCommuteMins] = useState(initialTask?.commute_minutes && initialTask.commute_minutes > 0 ? initialTask.commute_minutes : 30);
  const [locationName, setLocationName] = useState("");

  const togglePrefDay = (full: string) =>
    setPrefDays(d => d.includes(full) ? d.filter(x => x !== full) : [...d, full]);

  // Auto-calculate duration from fixed start→end
  const fixedDurationMins = (() => {
    const [sh, sm] = fixedStart.split(":").map(Number);
    const [eh, em] = fixedEnd.split(":").map(Number);
    const diff = (eh * 60 + em) - (sh * 60 + sm);
    return diff > 0 ? diff : diff + 24 * 60;
  })();

  const SLEEP_KEYWORDS = ["sleep", "sleeping", "bed", "bedtime", "nap", "napping"];
  const isSleepWord = SLEEP_KEYWORDS.some(k => title.trim().toLowerCase().includes(k));

  const canAdd =
    title.trim().length > 0 &&
    !isSleepWord &&
    (timingMode === "fixed"
      ? fixedDurationMins > 0 && prefDays.length > 0
      : duration >= 15);

  const handleAdd = () => {
    if (!canAdd) return;
    let task: WizardTask;
    if (timingMode === "fixed") {
      task = {
        id: initialTask?.id ?? `${Date.now()}-${Math.random()}`,
        title: title.trim(),
        duration_minutes: fixedDurationMins,
        priority,
        timing_preference: "ai_decide",
        preferred_days: prefDays,
        is_flexible: false,
        fixed_start_time: fixedStart,
        fixed_end_time: fixedEnd,
        commute_minutes: hasCommute ? commuteMins : 0,
        is_recurring: initialTask?.is_recurring ?? false,
      };
    } else {
      const timingPref: TimingPref =
        timingMode === "ai" ? "ai_decide" : (timeOfDay || "ai_decide") as TimingPref;
      task = {
        id: initialTask?.id ?? `${Date.now()}-${Math.random()}`,
        title: title.trim(),
        duration_minutes: duration,
        priority,
        timing_preference: timingPref,
        preferred_days: timingMode === "manual" ? prefDays : [],
        is_flexible: true,
        commute_minutes: hasCommute ? commuteMins : 0,
        is_recurring: initialTask?.is_recurring ?? false,
      };
    }
    if (isEditMode && onUpdate) {
      onUpdate(task);
    } else {
      onAdd(task);
    }
  };

  return (
    <div className="bg-gray-50 rounded-2xl p-5 space-y-5 border border-gray-100">
      {/* Title */}
      <input type="text" autoFocus placeholder="Task name"
        value={title} onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && canAdd) handleAdd(); }}
        className="w-full px-4 py-3 rounded-xl border border-gray-200 text-[15px] text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400 bg-white" />

      {/* Sleep keyword warning — context-aware by mode */}
      {isSleepWord && title.trim().length > 0 && (
        <div className="rounded-xl bg-indigo-50 border border-indigo-100 px-4 py-3 fade-in">
          <p className="text-[13px] font-semibold text-indigo-800 mb-0.5">Sleep is already protected</p>
          {mode === "ai" ? (
            <p className="text-[13px] text-indigo-600 leading-relaxed">
              In AI mode, Sunday automatically protects your sleep every night. No setup needed.
            </p>
          ) : (
            <p className="text-[13px] text-indigo-600 leading-relaxed">
              Sunday automatically blocks your sleep window every night.{" "}
              <a href="/setup?step=1" className="underline hover:no-underline font-medium">
                {mode === "manual"
                  ? "Set your sleep window in Setup Step 1"
                  : "Adjust it in your Setup preferences"}
              </a>{" "}
              — you never need to add it as a task.
            </p>
          )}
        </div>
      )}

      {/* Duration (hours + minutes) — hidden when fixed time is selected */}
      {!isSleepWord && timingMode !== "fixed" && (
        <div className="bg-white rounded-xl border border-gray-100 px-4 py-3">
          <p className="text-[12px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Duration</p>
          <HrMinInput value={duration} onChange={setDuration} />
        </div>
      )}

      {/* Priority */}
      <div>
        <p className="text-[12px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Priority</p>
        <div className="flex flex-wrap gap-2">
          {PRIORITIES.map(p => (
            <button key={p} type="button" onClick={() => setPriority(p)}
              className={`px-3 py-1.5 rounded-full text-[13px] font-medium border capitalize transition-all ${
                priority === p ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              }`}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Timing */}
      <div>
        <p className="text-[12px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Timing</p>
        <div className="grid grid-cols-3 gap-2">
          {([
            { id: "ai"     as const, emoji: "🤖", label: "AI picks the time" },
            { id: "manual" as const, emoji: "🕐", label: "I have a preference" },
            { id: "fixed"  as const, emoji: "📌", label: "Fixed time" },
          ]).map(opt => (
            <button key={opt.id} type="button" onClick={() => setTimingMode(opt.id)}
              className={`p-3 rounded-xl border-2 text-left transition-all ${
                timingMode === opt.id ? "border-indigo-600 bg-indigo-50" : "border-gray-200 bg-white hover:border-gray-300"
              }`}>
              <span className="text-lg">{opt.emoji}</span>
              <div className={`text-[12px] font-medium mt-1 ${timingMode === opt.id ? "text-indigo-700" : "text-gray-600"}`}>
                {opt.label}
              </div>
            </button>
          ))}
        </div>

        {/* Manual mode extras */}
        {timingMode === "manual" && (
          <div className="mt-4 space-y-4 fade-in">
            <div>
              <p className="text-[12px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Day preference <span className="normal-case font-normal">(optional)</span></p>
              <div className="flex flex-wrap gap-2">
                {DAYS_SHORT.map((short, i) => {
                  const full = DAYS_FULL[i];
                  const active = prefDays.includes(full);
                  return (
                    <button key={full} type="button" onClick={() => togglePrefDay(full)}
                      className={`px-3 py-1.5 rounded-full text-[13px] font-medium border transition-all ${
                        active ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                      }`}>
                      {short}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <p className="text-[12px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Time of day <span className="normal-case font-normal">(optional)</span></p>
              <div className="flex flex-wrap gap-2">
                {(["morning", "afternoon", "evening"] as const).map(tod => (
                  <button key={tod} type="button"
                    onClick={() => setTimeOfDay(prev => prev === tod ? "" : tod)}
                    className={`px-4 py-2 rounded-full text-[14px] font-medium border capitalize transition-all ${
                      timeOfDay === tod ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                    }`}>
                    {tod}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Fixed time mode extras */}
        {timingMode === "fixed" && (
          <div className="mt-4 space-y-4 fade-in bg-white rounded-xl border border-gray-100 p-4">
            {/* Start + End time pickers */}
            <div className="grid grid-cols-2 gap-4">
              <InlineTimePicker label="Start time" value={fixedStart} onChange={setFixedStart} />
              <InlineTimePicker label="End time"   value={fixedEnd}   onChange={setFixedEnd}   />
            </div>
            {/* Auto-calculated duration */}
            <p className="text-[12px] text-indigo-600 font-medium">
              {fmtTaskDuration(fixedDurationMins)}{" "}
              <span className="text-gray-400">({fmt12(fixedStart)} – {fmt12(fixedEnd)})</span>
            </p>
            {/* Day selector — required */}
            <div>
              <p className="text-[12px] font-semibold text-gray-400 uppercase tracking-widest mb-2">
                Day <span className="text-red-400 normal-case font-normal">* required</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {DAYS_SHORT.map((short, i) => {
                  const full = DAYS_FULL[i];
                  const active = prefDays.includes(full);
                  return (
                    <button key={full} type="button" onClick={() => togglePrefDay(full)}
                      className={`px-3 py-1.5 rounded-full text-[13px] font-medium border transition-all ${
                        active ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                      }`}>
                      {short}
                    </button>
                  );
                })}
              </div>
              {prefDays.length === 0 && (
                <p className="text-[11px] text-red-400 mt-1.5">Select at least one day</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Commute toggle */}
      {!isSleepWord && (
        <div className="border-t border-gray-100 pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[15px]">🚗</span>
              <p className="text-[14px] font-medium text-gray-700">Does this require travel?</p>
            </div>
            <Toggle checked={hasCommute} onChange={setHasCommute} />
          </div>
          {hasCommute && (
            <div className="mt-3 fade-in space-y-3">
              {savedLocations && savedLocations.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Saved locations</p>
                  <div className="flex flex-wrap gap-2">
                    {savedLocations.map(loc => (
                      <button
                        key={loc.id}
                        type="button"
                        onClick={() => { setCommuteMins(loc.commute_minutes); setLocationName(loc.name); }}
                        className={`px-3 py-1.5 rounded-full text-[12px] font-medium border transition-all ${
                          locationName === loc.name
                            ? "bg-indigo-600 text-white border-indigo-600"
                            : "bg-white text-gray-600 border-gray-200 hover:border-indigo-400"
                        }`}
                      >
                        {loc.name} · {loc.commute_minutes}m
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p className="text-[12px] font-semibold text-gray-400 uppercase tracking-widest mb-2">
                  Commute each way
                </p>
                <HrMinInput value={commuteMins} onChange={setCommuteMins} />
                <p className="text-[12px] text-gray-400 mt-1.5">
                  Sunday adds {fmtTaskDuration(commuteMins * 2)} total travel time around this task
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Location name <span className="normal-case font-normal">(optional)</span></p>
                <input
                  type="text"
                  placeholder="e.g. Gym, Office"
                  value={locationName}
                  onChange={e => setLocationName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-[13px] text-gray-900 bg-white focus:outline-none focus:border-indigo-300"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={handleAdd} disabled={!canAdd}
          className="flex-1 py-3 rounded-xl text-[14px] font-semibold bg-indigo-600 text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-indigo-700 transition-colors">
          {isEditMode ? "Update task" : "Add task"}
        </button>
        <button type="button" onClick={onCancel}
          className="px-5 py-3 rounded-xl text-[14px] text-gray-500 border border-gray-200 hover:border-gray-400 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Suggestion Card ──────────────────────────────────────────────────────────

function SuggestionCard({ task, onAdd, onEdit, onDismiss }: {
  task: WizardTask;
  onAdd: () => void;
  onEdit: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-medium text-gray-900 truncate">{task.title}</div>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className="text-[12px] text-gray-500">{fmtDuration(task.duration_minutes)}</span>
          <span className="text-[12px] text-gray-300">·</span>
          <span className="text-[12px] text-gray-500 capitalize">{task.priority}</span>
          {task.commute_minutes > 0 && (
            <>
              <span className="text-[12px] text-gray-300">·</span>
              <span className="text-[12px] text-gray-500">🚗 +{fmtDuration(task.commute_minutes * 2)}</span>
            </>
          )}
          {!task.is_flexible && task.fixed_start_time && (
            <>
              <span className="text-[12px] text-gray-300">·</span>
              <span className="text-[12px] text-gray-500">📌 {fmt12(task.fixed_start_time)}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button type="button" onClick={onAdd}
          className="px-2.5 py-1.5 rounded-lg text-[12px] font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">
          + Add
        </button>
        <button type="button" onClick={onEdit}
          className="px-2.5 py-1.5 rounded-lg text-[12px] font-medium border border-gray-200 text-gray-600 hover:border-gray-400 bg-white transition-colors">
          Edit
        </button>
        <button type="button" onClick={onDismiss}
          className="text-gray-300 hover:text-gray-600 transition-colors text-xl leading-none ml-1">
          ×
        </button>
      </div>
    </div>
  );
}

// ─── Meal timing row (reused in AI and Manual modes) ─────────────────────────

function MealTimingRow({ meal, value, onChange }: {
  meal: string;
  value: MealTiming;
  onChange: (v: MealTiming) => void;
}) {
  return (
    <div>
      <p className="text-[14px] font-medium text-gray-700 mb-2">
        When do you usually eat {meal.toLowerCase()}?
      </p>
      <div className="flex bg-gray-100 rounded-full p-1 gap-1 max-w-xs">
        {(["Early", "Normal", "Late"] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => onChange(t)}
            className={`flex-1 py-1.5 rounded-full text-[13px] font-semibold transition-all ${
              value === t
                ? "bg-white text-indigo-600 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── AI QUICK PREFS ───────────────────────────────────────────────────────────

function AIQuickPrefs({ data, set }: {
  data: WizardData;
  set: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void;
}) {
  return (
    <div className="mb-8 bg-indigo-50/40 border border-indigo-100 rounded-2xl p-5 space-y-5">
      <p className="text-[13px] font-semibold text-indigo-700 uppercase tracking-widest">Quick preferences</p>

      {/* Meals per day */}
      <div>
        <p className="text-[14px] font-medium text-gray-700 mb-2">How many meals do you eat per day?</p>
        <div className="flex gap-2">
          {[2, 3, 4].map(n => (
            <button
              key={n}
              type="button"
              onClick={() => set("ai_meals_per_day", n)}
              className={`px-4 py-2 rounded-full text-[14px] font-medium border transition-all ${
                data.ai_meals_per_day === n
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              }`}
            >
              {n === 4 ? "4+" : n} meals
            </button>
          ))}
        </div>
      </div>

      {/* Meal duration */}
      <div>
        <p className="text-[14px] font-medium text-gray-700 mb-2">How long does each meal take?</p>
        <div className="flex gap-2 flex-wrap">
          {[15, 20, 30, 45].map(m => (
            <button
              key={m}
              type="button"
              onClick={() => set("ai_meal_duration_mins", m)}
              className={`px-4 py-2 rounded-full text-[14px] font-medium border transition-all ${
                data.ai_meal_duration_mins === m
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              }`}
            >
              {m} min
            </button>
          ))}
        </div>
      </div>

      {/* Meal timing */}
      <MealTimingRow meal="Breakfast" value={data.breakfast_timing}
        onChange={v => set("breakfast_timing", v)} />
      {data.ai_meals_per_day >= 3 && (
        <MealTimingRow meal="Lunch" value={data.lunch_timing}
          onChange={v => set("lunch_timing", v)} />
      )}
      {data.ai_meals_per_day >= 2 && (
        <MealTimingRow meal="Dinner" value={data.dinner_timing}
          onChange={v => set("dinner_timing", v)} />
      )}

      {/* Commute */}
      <div>
        <div className="flex items-center justify-between">
          <p className="text-[14px] font-medium text-gray-700">Do you have a commute?</p>
          <Toggle checked={data.ai_has_commute} onChange={v => set("ai_has_commute", v)} />
        </div>
        {data.ai_has_commute && (
          <div className="mt-3 fade-in">
            <p className="text-[13px] font-semibold text-gray-400 uppercase tracking-widest mb-2">One-way duration</p>
            <div className="flex gap-2">
              {[15, 30, 45, 60].map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => set("ai_commute_mins", m)}
                  className={`px-4 py-2 rounded-full text-[14px] font-medium border transition-all ${
                    data.ai_commute_mins === m
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                  }`}
                >
                  {m} min
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TASKS STEP ───────────────────────────────────────────────────────────────

function TasksStep({ data, set, mode, suggestions, dismissedSuggestions, onDismissSuggestion, onEditSuggestion, onEditTask, savedLocations, preFilledBanner }: {
  data: WizardData;
  set: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void;
  mode?: Mode | null;
  suggestions?: WizardTask[];
  dismissedSuggestions?: Set<string>;
  onDismissSuggestion?: (id: string) => void;
  onEditSuggestion?: (t: WizardTask) => void;
  onEditTask?: (t: WizardTask) => void;
  savedLocations?: UserLocation[];
  preFilledBanner?: boolean;
}) {
  const [showForm, setShowForm] = useState(false);

  const addTask = (t: WizardTask) => {
    set("tasks", [...data.tasks, t]);
    setShowForm(false);
  };

  const removeTask = (id: string) => {
    set("tasks", data.tasks.filter(t => t.id !== id));
  };

  const toggleRecurring = (id: string) => {
    set("tasks", data.tasks.map(t =>
      t.id === id ? { ...t, is_recurring: !t.is_recurring } : t
    ));
  };

  // Filter suggestions: exclude optional, tasks with deadline, dismissed, and already in list
  const existingTitles = new Set(data.tasks.map(t => t.title.toLowerCase()));
  const visibleSuggestions = (suggestions ?? []).filter(s =>
    s.priority !== "optional" &&
    !dismissedSuggestions?.has(s.id) &&
    !existingTitles.has(s.title.toLowerCase())
  );

  return (
    <StepShell
      headline="What needs to get done?"
      subtext="Add everything on your plate. Sunday will fit it into your schedule."
    >
      {/* Pre-filled banner */}
      {preFilledBanner && (
        <div className="mb-5 flex items-center gap-2 px-4 py-2.5 bg-green-50 border border-green-100 rounded-xl text-[13px] text-green-700 font-medium fade-in">
          <span>✓</span>
          <span>Pre-filled from last week — adjust anything below</span>
        </div>
      )}

      {/* AI mode quick preferences */}
      {mode === "ai" && <AIQuickPrefs data={data} set={set} />}

      {/* Suggestions from last week */}
      {visibleSuggestions.length > 0 && (
        <div className="mb-5">
          <p className="text-[12px] font-semibold text-gray-400 uppercase tracking-widest mb-2">From last week</p>
          <div className="space-y-2">
            {visibleSuggestions.map(s => (
              <SuggestionCard
                key={s.id}
                task={s}
                onAdd={() => {
                  set("tasks", [...data.tasks, { ...s, id: `added-${Date.now()}-${Math.random()}` }]);
                }}
                onEdit={() => onEditSuggestion?.(s)}
                onDismiss={() => onDismissSuggestion?.(s.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Task list */}
      {data.tasks.length > 0 && (
        <div className="space-y-2 mb-5">
          {data.tasks.map(task => (
            <div key={task.id} className="flex items-center gap-2 bg-white rounded-xl border border-gray-100 px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-medium text-gray-900 truncate">{task.title}</div>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className="text-[12px] text-gray-400">{fmtDuration(task.duration_minutes)}</span>
                  {task.commute_minutes > 0 && (
                    <span className="text-[12px] text-gray-400">🚗 +{fmtDuration(task.commute_minutes * 2)}</span>
                  )}
                  <span className="text-[12px] text-gray-300">·</span>
                  <span className="text-[12px] text-gray-400 capitalize">{task.priority}</span>
                  <span className="text-[12px] text-gray-300">·</span>
                  <span className="text-[12px] text-gray-400">
                    {!task.is_flexible && task.fixed_start_time
                      ? `📌 Fixed · ${fmt12(task.fixed_start_time)}–${fmt12(task.fixed_end_time ?? "")} · ${task.preferred_days.map(d => d.slice(0,3)).join(", ")}`
                      : task.timing_preference === "ai_decide"
                        ? "AI scheduled"
                        : `${task.timing_preference}${task.preferred_days.length > 0 ? ` · ${task.preferred_days.map(d => d.slice(0,3)).join(", ")}` : ""}`
                    }
                  </span>
                </div>
              </div>
              {/* Recurring toggle */}
              <button
                type="button"
                onClick={() => toggleRecurring(task.id)}
                title={task.is_recurring ? "Recurring — click to disable" : "Click to make recurring"}
                className={`text-sm leading-none transition-colors shrink-0 ${task.is_recurring ? "text-indigo-500" : "text-gray-300 hover:text-gray-500"}`}
              >
                ↻
              </button>
              {/* Edit button */}
              <button type="button" onClick={() => onEditTask?.(task)}
                className="text-gray-300 hover:text-gray-600 transition-colors text-sm leading-none shrink-0">
                ✏
              </button>
              <button type="button" onClick={() => removeTask(task.id)}
                className="text-gray-300 hover:text-gray-600 transition-colors text-xl leading-none shrink-0">
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {data.tasks.length === 0 && !showForm && visibleSuggestions.length === 0 && (
        <div className="py-12 text-center border-2 border-dashed border-gray-100 rounded-2xl mb-5">
          <p className="text-[15px] text-gray-400 mb-1">No tasks yet</p>
          <p className="text-[13px] text-gray-300">Add at least one to continue</p>
        </div>
      )}

      {/* Draft form */}
      {showForm && (
        <div className="mb-4 fade-in">
          <DraftTaskForm onAdd={addTask} onCancel={() => setShowForm(false)} mode={mode} savedLocations={savedLocations} />
        </div>
      )}

      {/* Add button */}
      {!showForm && (
        <div className="mt-3">
          <button type="button" onClick={() => setShowForm(true)}
            className="flex items-center gap-2 w-full px-4 py-3 rounded-xl border border-dashed border-zinc-300 text-[14px] text-zinc-400 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all">
            <span className="text-lg font-light">+</span>
            <span>Add a task</span>
          </button>
        </div>
      )}
    </StepShell>
  );
}

// ─── FREE TEXT STEP ───────────────────────────────────────────────────────────

function FreeTextStep({ data, set }: { data: WizardData; set: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void }) {
  return (
    <StepShell
      headline="Anything else Sunday should know?"
      subtext="Optional. This context shapes how Sunday makes decisions for the week."
    >
      <textarea
        value={data.extra_context}
        onChange={e => set("extra_context", e.target.value)}
        placeholder={"e.g. Low energy Wednesday, dentist Thursday 2pm, trying to avoid screens after 9pm..."}
        rows={6}
        className="w-full px-4 py-4 rounded-2xl border border-gray-200 text-[15px] text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400 transition-colors resize-none bg-white leading-relaxed"
      />
      {data.extra_context.length === 0 && (
        <p className="text-[13px] text-gray-400 mt-3">You can skip this — it&apos;s entirely optional.</p>
      )}
    </StepShell>
  );
}

// ─── REVIEW STEP ─────────────────────────────────────────────────────────────

function ReviewStep({ data, set, mode, weekTarget }: {
  data: WizardData;
  set: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void;
  mode: Mode;
  weekTarget: "current" | "next";
}) {
  const sleepHoursPerWeek = data.sleep_target_hours * 7;
  const routineMinsPerWeek = (data.morning_routine_mins + data.night_routine_mins + data.shower_mins) * 7;
  const mealMinsPerWeek = data.meals_per_day * data.meal_duration_mins * 7;
  const gymMinsPerWeek = data.gym_days_per_week * data.gym_duration_mins;
  const muayThaiMinsPerWeek = data.muay_thai_days_per_week * data.muay_thai_duration_mins;
  const commuteMinsPerWeek = data.is_remote ? 0 : data.work_days_per_week * data.commute_minutes * 2;
  const fixedHours = sleepHoursPerWeek + (routineMinsPerWeek + mealMinsPerWeek + gymMinsPerWeek + muayThaiMinsPerWeek + commuteMinsPerWeek) / 60;
  const freeHours = Math.max(0, Math.round((168 - fixedHours) * 10) / 10);

  const summaryItems = [
    { label: "Sleep", value: `${data.sleep_target_hours}h / night` },
    { label: "Gym", value: `${data.gym_days_per_week}×/week` },
    { label: "Muay Thai", value: `${data.muay_thai_days_per_week}×/week` },
    { label: "Meals/day", value: String(data.meals_per_day) },
    { label: "Commute", value: data.is_remote ? "Remote" : `${data.commute_minutes}m × ${data.work_days_per_week}d` },
    { label: "Tasks added", value: String(data.tasks.length) },
  ];

  return (
    <StepShell
      headline="Your week, by the numbers."
      subtext={`${mode === "ai" ? "Review your tasks" : "Review all your settings"} before Sunday builds your schedule.`}
    >
      {/* Deep work toggle */}
      <div className="mb-7 bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-xl">🧠</span>
          <div className="flex-1">
            <p className="text-[15px] font-semibold text-gray-900">Fill free time with deep work</p>
            <p className="text-[13px] text-gray-500">Sunday fills your free slots automatically.</p>
          </div>
          <Toggle
            checked={data.deep_work_enabled}
            onChange={v => set("deep_work_enabled", v)}
          />
        </div>
        {data.deep_work_enabled && (
          <div className="mt-4 fade-in">
            <p className="text-[12px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Session duration</p>
            <div className="flex gap-2 flex-wrap">
              {[60, 90, 120, 180].map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => set("deep_work_session_duration", m)}
                  className={`px-4 py-2 rounded-full text-[13px] font-medium border transition-all ${
                    data.deep_work_session_duration === m
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                  }`}
                >
                  {m < 60 ? `${m} min` : `${m / 60}h`}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {weekTarget === "next" && (
        <div className="mb-5 flex items-center gap-2 px-4 py-2.5 bg-indigo-50 border border-indigo-100 rounded-xl text-[13px] text-indigo-600 font-medium">
          <span>✦</span>
          <span>{formatWeekRange(getFollowingMonday())} · Goes live Sunday at midnight</span>
        </div>
      )}

      {mode === "manual" && (
        <div className="grid grid-cols-2 gap-3 mb-7">
          {summaryItems.map(({ label, value }) => (
            <div key={label} className="bg-zinc-50 rounded-xl border border-zinc-200 p-4">
              <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-1">{label}</p>
              <p className="text-[17px] font-semibold text-zinc-900">{value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5 mb-7">
        <p className="text-[11px] font-bold text-indigo-500 uppercase tracking-widest mb-2">Estimated free time</p>
        <p className="text-[36px] font-semibold text-zinc-900 leading-none">{freeHours}h</p>
        <p className="text-[13px] text-zinc-500 mt-1.5">per week available for tasks and rest</p>
      </div>

      <div className="mb-7">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[13px] font-semibold text-zinc-400 uppercase tracking-widest">Task capacity</p>
          <span className="text-[15px] font-semibold text-zinc-900 tabular-nums">{data.weekly_task_capacity_hours} hrs/week</span>
        </div>
        <input
          type="range" min={5} max={60} step={5}
          value={data.weekly_task_capacity_hours}
          onChange={(e) => set("weekly_task_capacity_hours", Number(e.target.value))}
          className="wizard-range w-full h-2 rounded-full cursor-pointer"
          style={{ background: `linear-gradient(to right, #4f46e5 ${(data.weekly_task_capacity_hours / 60) * 100}%, #e4e4e7 ${(data.weekly_task_capacity_hours / 60) * 100}%)` }}
        />
        <div className="flex justify-between mt-1.5">
          <span className="text-[12px] text-zinc-400">Light week</span>
          <span className="text-[12px] text-zinc-400">Full capacity</span>
        </div>
      </div>

      <div>
        <p className="text-[13px] font-semibold text-zinc-400 uppercase tracking-widest mb-2">
          Scheduling preferences <span className="normal-case font-normal text-zinc-400">(optional)</span>
        </p>
        <textarea
          value={data.extra_context}
          onChange={(e) => set("extra_context", e.target.value)}
          placeholder={"e.g. 'Prioritize deep work in the mornings' or 'I need buffer time between tasks' or 'Keep Friday afternoons free if possible'"}
          rows={3}
          className="w-full px-4 py-3 rounded-xl border border-zinc-200 text-[14px] text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-indigo-300 transition-colors resize-none bg-white leading-relaxed"
        />
        <p className="text-[12px] text-indigo-500 mt-2 flex items-center gap-1.5">
          <span>✦</span>
          <span>Sunday&apos;s AI reads this when building your schedule.</span>
        </p>
      </div>
    </StepShell>
  );
}

// ─── DONE SCREEN ──────────────────────────────────────────────────────────────

function DoneScreen({ weekTarget }: { weekTarget: "current" | "next" }) {
  const router = useRouter();
  const isNext = weekTarget === "next";
  return (
    <div className="w-full max-w-lg mx-auto text-center fade-in">
      <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-8">
        <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h1 className="text-[2rem] font-semibold text-gray-900 leading-tight mb-4 tracking-tight">
        {isNext ? "Next week is locked in." : "Your week is protected."}
      </h1>
      <p className="text-[16px] text-gray-500 mb-12 leading-relaxed">
        {isNext
          ? "Goes live automatically on Sunday at 12:00 AM."
          : "Sunday generates your first schedule on Sunday."}
      </p>
      <button
        type="button"
        onClick={() => router.push(isNext ? "/week?preview=next" : "/week")}
        className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-indigo-600 text-white text-[16px] font-semibold hover:bg-indigo-700 transition-colors"
      >
        {isNext ? "Preview next week →" : "View this week →"}
      </button>
    </div>
  );
}

// ─── DRAFT PROMPT ─────────────────────────────────────────────────────────────

function DraftPrompt({ draft, onResume, onDiscard }: {
  draft: DraftState;
  onResume: () => void;
  onDiscard: () => void;
}) {
  const taskCount = draft.data.tasks.length;
  return (
    <div className="w-full max-w-lg mx-auto fade-in">
      <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center mb-6 text-2xl">
        📋
      </div>
      <h1 className="text-[2rem] font-semibold text-gray-900 leading-tight mb-3 tracking-tight">
        You have a saved draft
      </h1>
      <p className="text-[16px] text-gray-500 mb-2 leading-relaxed">
        From {formatDraftDate(draft.savedAt)}
      </p>
      <p className="text-[14px] text-gray-400 mb-10">
        {taskCount > 0
          ? `${taskCount} task${taskCount !== 1 ? "s" : ""} added · ${draft.mode} mode · step ${draft.step}`
          : `${draft.mode} mode · step ${draft.step}`}
      </p>

      <div className="space-y-3">
        <button
          type="button"
          onClick={onResume}
          className="w-full py-4 rounded-2xl bg-indigo-600 text-white text-[15px] font-semibold hover:bg-indigo-700 transition-colors"
        >
          Continue where I left off →
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="w-full py-4 rounded-2xl border-2 border-gray-200 text-gray-600 text-[15px] font-medium hover:border-gray-300 hover:bg-gray-50 transition-colors"
        >
          Start fresh
        </button>
      </div>

      <p className="text-[12px] text-gray-400 text-center mt-4">
        Starting fresh will clear your saved progress.
      </p>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

function getFollowingMonday(): Date {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dow = today.getDay();
  const daysToNextMon = dow === 0 ? 1 : 8 - dow;
  const d = new Date(today); d.setDate(today.getDate() + daysToNextMon);
  return d;
}

export default function SetupPage() {
  const { user, isLoading: authLoading } = useAuth();
  const authRouter = useRouter();

  useEffect(() => {
    if (!authLoading && !user) authRouter.replace("/login");
  }, [user, authLoading, authRouter]);

  const [mode,          setMode]          = useState<Mode | null>(null);
  const [step,          setStep]          = useState(1);
  const [direction,     setDirection]     = useState<1 | -1>(1);
  const [data,          setData]          = useState<WizardData>(DEFAULTS);
  const [weekTarget,    setWeekTarget]    = useState<"current" | "next">("current");
  const [generating,    setGenerating]    = useState(false);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [errMsg,        setErrMsg]        = useState<string | null>(null);
  const [done,          setDone]          = useState(false);
  const [draft,         setDraft]         = useState<DraftState | null>(null);
  const [draftChecked,  setDraftChecked]  = useState(false);

  // Last-week data
  const [lastWeekPrefs,      setLastWeekPrefs]      = useState<WeeklyPreferences | null>(null);
  const [lastWeekTasks,      setLastWeekTasks]      = useState<ApiTask[] | null>(null);
  const [preFilledFromLastWeek, setPreFilledFromLastWeek] = useState(false);

  // Suggestion / edit state
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());
  const [editingTask,    setEditingTask]    = useState<WizardTask | null>(null);
  const [editingSuggestion, setEditingSuggestion] = useState<WizardTask | null>(null);

  // Locations
  const [savedLocations, setSavedLocations] = useState<UserLocation[]>([]);

  // One-tap generation
  const [generatingDirectly, setGeneratingDirectly] = useState(false);

  // On mount: check for saved draft, then fall back to ?step= / ?week= query params
  // Also load last-week data and saved locations
  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);

    // Apply ?week=next regardless of draft state
    if (params.get("week") === "next") {
      setWeekTarget("next");
    }

    // Load last-week prefs and tasks in parallel (non-blocking)
    Promise.all([
      getLatestPreferences().catch(() => null),
      getRecentTasks().catch(() => null),
      getSavedLocations().catch(() => [] as UserLocation[]),
    ]).then(([prefs, tasks, locs]) => {
      if (prefs) setLastWeekPrefs(prefs);
      if (tasks) setLastWeekTasks(tasks);
      if (locs) setSavedLocations(locs as UserLocation[]);
    });

    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed: DraftState = JSON.parse(raw);
        if (parsed.mode && parsed.data && parsed.step) {
          setDraft(parsed);
          setDraftChecked(true);
          return; // draft takes priority over step query param
        }
      }
    } catch {
      // ignore corrupt storage
    }

    // No draft — check ?step= query param
    const stepParam = params.get("step");
    if (stepParam === "1") {
      setMode("manual");
      setStep(1);
    }

    setDraftChecked(true);
  }, [user]);

  // Debounced draft save — triggers on any data/mode/step change
  useEffect(() => {
    if (!draftChecked || mode === null || done) return;
    const timer = setTimeout(() => {
      try {
        const toSave: DraftState = {
          savedAt: new Date().toISOString(),
          mode,
          step,
          data,
        };
        localStorage.setItem(DRAFT_KEY, JSON.stringify(toSave));
      } catch {
        // ignore storage quota errors
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [data, mode, step, draftChecked, done]);

  function resumeDraft() {
    if (!draft) return;
    setMode(draft.mode);
    setStep(draft.step);
    setData(draft.data);
    setDraft(null);
  }

  function discardDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    setDraft(null);
  }

  useEffect(() => {
    if (!generating) return;
    const id = setInterval(() => setLoadingMsgIdx(i => (i + 1) % LOADING_MESSAGES.length), 1600);
    return () => clearInterval(id);
  }, [generating]);

  function set<K extends keyof WizardData>(key: K, value: WizardData[K]) {
    setData(prev => ({ ...prev, [key]: value }));
  }

  function selectMode(m: Mode) {
    setMode(m);
    setStep(1);
    setDirection(1);
  }

  function handleUseLastWeekAsTemplate() {
    if (!lastWeekPrefs) return;
    const prefill = prefsToWizardData(lastWeekPrefs);
    const tasks: WizardTask[] = (lastWeekTasks ?? [])
      .filter(t => t.priority !== "optional" && !t.deadline)
      .map((t, i) => apiTaskToWizardTask(t, i));
    setData(prev => ({ ...prev, ...prefill, tasks }));
    setPreFilledFromLastWeek(true);
    setMode("manual");
    setStep(4);
    setDirection(1);
  }

  async function handleSameAsLastWeek() {
    if (!lastWeekPrefs) return;
    const prefill = prefsToWizardData(lastWeekPrefs);
    const tasks: WizardTask[] = (lastWeekTasks ?? [])
      .filter(t => t.is_recurring)
      .map((t, i) => apiTaskToWizardTask(t, i));
    const genData = { ...DEFAULTS, ...prefill, tasks };
    setData(genData);
    setMode("manual");
    setGeneratingDirectly(true);
    setErrMsg(null);
    setLoadingMsgIdx(0);
    try {
      const taskErrors = await runGenerate(genData, "manual");
      setGeneratingDirectly(false);
      if (taskErrors.length > 0) {
        setErrMsg(`⚠ ${taskErrors.length} task(s) couldn't be created (duplicates or errors). Schedule built with the rest.`);
      }
      setDone(true);
    } catch (e) {
      console.error("[Sunday] Same-as-last-week generation failed:", e);
      setErrMsg("Could not reach Sunday's server. Please try again.");
      setGeneratingDirectly(false);
    }
  }

  function goNext() {
    setDirection(1);
    setStep(s => s + 1);
  }

  function goBack() {
    setDirection(-1);
    if (step === 1) {
      setMode(null);
    } else {
      setStep(s => s - 1);
    }
  }

  // Step routing
  const TOTAL        = mode === "ai" ? 2 : 5;
  const tasksStepNum = mode === "ai" ? 1 : 4;
  const isLastStep   = step === TOTAL;
  const canContinue  = step !== tasksStepNum || data.tasks.length > 0;

  // Compute suggestions from lastWeekTasks
  const suggestions: WizardTask[] = (lastWeekTasks ?? [])
    .filter(t =>
      t.priority !== "optional" &&
      !t.deadline &&
      t.status !== "missed"
    )
    .map((t, i) => apiTaskToWizardTask(t, i))
    .sort((a, b) => {
      const fixed = (t: WizardTask) => (!t.is_flexible && t.fixed_start_time ? 0 : 1);
      const prio = (t: WizardTask) => ({ critical: 0, high: 1, medium: 2, low: 3, optional: 4 }[t.priority] ?? 5);
      return fixed(a) - fixed(b) || prio(a) - prio(b);
    });

  function renderStep() {
    const props = { data, set };
    const tasksStepProps = {
      ...props,
      mode,
      suggestions,
      dismissedSuggestions,
      onDismissSuggestion: (id: string) =>
        setDismissedSuggestions(prev => new Set(Array.from(prev).concat(id))),
      onEditSuggestion: (t: WizardTask) => setEditingSuggestion(t),
      onEditTask: (t: WizardTask) => setEditingTask(t),
      savedLocations,
      preFilledBanner: preFilledFromLastWeek,
    };

    if (mode === "manual") {
      if (step === 1) return <Step1 {...props} />;
      if (step === 2) return <Step2 {...props} />;
      if (step === 3) return <Step3 {...props} />;
      if (step === 4) return <TasksStep {...tasksStepProps} />;
      if (step === 5) return <ReviewStep data={data} set={set} mode={mode} weekTarget={weekTarget} />;
    }
    if (mode === "ai") {
      if (step === 1) return <TasksStep {...tasksStepProps} />;
      if (step === 2) return <ReviewStep data={data} set={set} mode={mode} weekTarget={weekTarget} />;
    }
    return null;
  }

  const BREAKFAST_TIMES: Record<MealTiming, string> = { Early: "06:30", Normal: "07:30", Late: "09:00" };
  const LUNCH_TIMES:     Record<MealTiming, string> = { Early: "11:30", Normal: "12:30", Late: "14:00" };
  const DINNER_TIMES:    Record<MealTiming, string> = { Early: "17:30", Normal: "19:00", Late: "20:30" };

  async function runGenerate(genData: WizardData, genMode: Mode) {
    const generationTimestamp = new Date().toISOString();
    const weekStart = toLocalDateString(
      weekTarget === "next" ? getFollowingMonday() : getCurrentMonday()
    );
    const serializedCommitments = genData.fixed_commitments.map(c =>
      JSON.stringify({ name: c.name, time: c.time, duration: c.duration, days: c.days })
    );
    const effectiveMealsPerDay = genMode === "ai" ? genData.ai_meals_per_day : genData.meals_per_day;

    await savePreferences({
      week_start_date: weekStart,
      sleep_target_hours: genData.sleep_target_hours,
      preferred_bedtime: genData.preferred_bedtime,
      preferred_wake_time: genData.preferred_wake_time,
      morning_routine_mins: genData.morning_routine_mins,
      night_routine_mins: genData.night_routine_mins,
      shower_mins: genData.shower_mins,
      shower_preference: genData.shower_preference,
      meals_per_day: genMode === "ai" ? genData.ai_meals_per_day : genData.meals_per_day,
      meal_duration_mins: genMode === "ai" ? genData.ai_meal_duration_mins : genData.meal_duration_mins,
      meal_prep_days: genData.meal_prep_days,
      gym_days_per_week: genData.gym_days_per_week,
      gym_duration_mins: genData.gym_duration_mins,
      muay_thai_days_per_week: genData.muay_thai_days_per_week,
      muay_thai_duration_mins: genData.muay_thai_duration_mins,
      workout_time_preference: genData.workout_time_preference,
      commute_minutes: genMode === "ai"
        ? (genData.ai_has_commute ? genData.ai_commute_mins : 0)
        : (genData.is_remote ? 0 : genData.commute_minutes),
      is_remote: genMode === "ai" ? !genData.ai_has_commute : genData.is_remote,
      work_days_per_week: genMode === "ai" ? (genData.ai_has_commute ? 5 : 0) : genData.work_days_per_week,
      work_location_name: genData.work_location_name || null,
      weekly_task_capacity_hours: genData.weekly_task_capacity_hours,
      energy_preference: genData.energy_preference,
      fixed_commitments: serializedCommitments,
      notes: null,
      mode: genMode,
      extra_context: genData.extra_context || null,
      scheduling_notes: genData.extra_context || null,
      meal_breakfast_time: BREAKFAST_TIMES[genData.breakfast_timing],
      meal_lunch_time:     effectiveMealsPerDay >= 3 ? LUNCH_TIMES[genData.lunch_timing]  : null,
      meal_dinner_time:    effectiveMealsPerDay >= 2 ? DINNER_TIMES[genData.dinner_timing] : null,
      deep_work_enabled: genData.deep_work_enabled,
      deep_work_session_duration: genData.deep_work_session_duration,
    });

    // FIX 12: fetch existing tasks to skip duplicates; wrap each creation in error handling
    let existingTitles = new Set<string>();
    try {
      const existingTasks = await getAllTasks();
      existingTasks
        .filter(t => t.status === "pending" || t.status === "scheduled")
        .forEach(t => existingTitles.add(t.title.toLowerCase().trim()));
    } catch {
      // Proceed without dedup if fetch fails
    }

    const taskErrors: string[] = [];
    for (const task of genData.tasks) {
      if (existingTitles.has(task.title.toLowerCase().trim())) {
        console.warn("[Sunday] Skipping duplicate task:", task.title);
        continue;
      }
      try {
        await createTask({
          title: task.title,
          duration_minutes: task.duration_minutes,
          deadline: null,
          priority: task.priority,
          energy_level: "medium",
          is_flexible: task.is_flexible ?? true,
          timing_preference: task.timing_preference,
          preferred_days: task.preferred_days.length > 0
            ? JSON.stringify(task.preferred_days)
            : null,
          fixed_start_time: task.fixed_start_time ?? null,
          fixed_end_time:   task.fixed_end_time   ?? null,
          commute_minutes:  task.commute_minutes   ?? 0,
          is_recurring:     task.is_recurring      ?? false,
        });
        existingTitles.add(task.title.toLowerCase().trim());
      } catch (e) {
        console.error("[Sunday] Task creation failed:", task.title, e);
        taskErrors.push(task.title);
      }
    }

    // FIX 7: store is_overloaded in localStorage so today page can read it on load
    const genResult = await generateSchedule(weekStart, generationTimestamp, weekTarget);
    try {
      localStorage.setItem(`sunday_overloaded_${weekStart}`, genResult.is_overloaded ? "1" : "0");
    } catch { /* ignore */ }
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    return taskErrors;
  }

  async function handleGenerate() {
    if (!mode) return;
    setGenerating(true);
    setErrMsg(null);
    setLoadingMsgIdx(0);
    try {
      const taskErrors = await runGenerate(data, mode);
      setGenerating(false);
      if (taskErrors.length > 0) {
        setErrMsg(`⚠ ${taskErrors.length} task(s) couldn't be created (duplicates or errors). Schedule built with the rest.`);
      }
      setDone(true);
    } catch (e) {
      console.error("[Sunday] Schedule generation failed:", e);
      setErrMsg("Could not reach Sunday's server. Please try again.");
      setGenerating(false);
    }
  }

  const animClass = direction === 1 ? "slide-enter-right" : "slide-enter-left";

  if (authLoading || !user) return null;

  return (
    <div
      className="fixed inset-0 z-[60] bg-white overflow-y-auto"
      style={{ fontFamily: "var(--font-dm-sans, DM Sans, system-ui, sans-serif)" }}
    >
      {/* Dot progress indicator */}
      {mode !== null && !done && (
        <div className="fixed top-6 left-0 right-0 z-[70] flex justify-center">
          <div className="flex items-center gap-2">
            {Array.from({ length: TOTAL }, (_, i) => (
              <div
                key={i}
                className={`rounded-full transition-all duration-300 ${
                  i < step
                    ? "w-2 h-2 bg-indigo-600"
                    : i === step - 1
                    ? "w-3 h-3 bg-indigo-600"
                    : "w-2 h-2 bg-zinc-200"
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-24">
        {done ? (
          <DoneScreen weekTarget={weekTarget} />
        ) : draft !== null && draftChecked ? (
          <DraftPrompt draft={draft} onResume={resumeDraft} onDiscard={discardDraft} />
        ) : mode === null ? (
          <ModeScreen
            onSelect={selectMode}
            weekTarget={weekTarget}
            setWeekTarget={setWeekTarget}
            lastWeekPrefs={lastWeekPrefs}
            lastWeekTasks={lastWeekTasks}
            onUseLastWeekAsTemplate={handleUseLastWeekAsTemplate}
            onSameAsLastWeek={handleSameAsLastWeek}
          />
        ) : (
          <div key={`${mode}-${step}`} className={`w-full ${animClass}`}>
            {renderStep()}
          </div>
        )}
      </div>

      {/* Navigation bar — only when mode is set and not done */}
      {mode !== null && !done && (
        <div className="fixed bottom-0 left-0 right-0 px-6 pb-8 pt-4 bg-white border-t border-gray-100">
          <div className="max-w-lg mx-auto flex items-center justify-between gap-4">
            <button type="button" onClick={goBack} disabled={generating}
              className="px-5 py-3 rounded-xl text-[15px] font-medium text-gray-500 border border-gray-200 hover:border-gray-400 hover:text-gray-700 transition-all disabled:opacity-30">
              ← Back
            </button>

            {isLastStep ? (
              <button type="button" onClick={handleGenerate} disabled={generating}
                className="flex-1 sm:flex-none sm:min-w-[200px] px-6 py-3 rounded-xl text-[15px] font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {generating ? LOADING_MESSAGES[loadingMsgIdx] : "Generate my week →"}
              </button>
            ) : (
              <button type="button" onClick={goNext} disabled={!canContinue}
                className="flex-1 sm:flex-none sm:min-w-[160px] px-6 py-3 rounded-xl text-[15px] font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                Continue →
              </button>
            )}
          </div>

          {errMsg && (
            <div className="max-w-lg mx-auto mt-3 px-4 py-2.5 rounded-xl bg-red-50 border border-red-100 text-[13px] text-red-600">
              {errMsg}
            </div>
          )}
        </div>
      )}

      {/* Fullscreen overlay when generating directly (same-as-last-week) */}
      {generatingDirectly && (
        <div className="fixed inset-0 z-[80] bg-white flex flex-col items-center justify-center gap-5">
          <div className="w-12 h-12 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin" />
          <p className="text-[16px] font-medium text-gray-700">{LOADING_MESSAGES[loadingMsgIdx]}</p>
        </div>
      )}

      {/* Edit existing task modal */}
      {editingTask && (
        <div className="fixed inset-0 z-[80] bg-black/30 flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="p-5">
              <p className="text-[13px] font-semibold text-gray-400 uppercase tracking-widest mb-4">Edit task</p>
              <DraftTaskForm
                key={editingTask.id}
                initialTask={editingTask}
                onAdd={() => {}}
                onUpdate={(updated) => {
                  set("tasks", data.tasks.map(t => t.id === updated.id ? updated : t));
                  setEditingTask(null);
                }}
                onCancel={() => setEditingTask(null)}
                mode={mode}
                savedLocations={savedLocations}
              />
            </div>
          </div>
        </div>
      )}

      {/* Edit suggestion modal */}
      {editingSuggestion && (
        <div className="fixed inset-0 z-[80] bg-black/30 flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="p-5">
              <p className="text-[13px] font-semibold text-gray-400 uppercase tracking-widest mb-4">Edit before adding</p>
              <DraftTaskForm
                key={`suggestion-${editingSuggestion.id}`}
                initialTask={editingSuggestion}
                onAdd={(t) => {
                  set("tasks", [...data.tasks, t]);
                  setDismissedSuggestions(prev => new Set(Array.from(prev).concat(editingSuggestion.id)));
                  setEditingSuggestion(null);
                }}
                onUpdate={() => {}}
                onCancel={() => setEditingSuggestion(null)}
                mode={mode}
                savedLocations={savedLocations}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
