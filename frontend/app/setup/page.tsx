"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { savePreferences, generateSchedule, createTask } from "@/lib/api";

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = 1;

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

// ─── Types ────────────────────────────────────────────────────────────────────

type Priority    = "critical" | "high" | "medium" | "low" | "optional";
type ShowerPref  = "morning" | "night" | "both";
type WorkoutTime = "morning" | "afternoon" | "evening";
type EnergyPref  = "front_load" | "spread_out";
type Mode        = "ai" | "manual";
type TimingPref  = "ai_decide" | "morning" | "afternoon" | "evening";

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
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getNextMonday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dow = today.getDay();
  if (dow === 1) return today;
  const diff = dow === 0 ? 1 : 8 - dow;
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
};

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
            isActive(opt.value) ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
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
            value === n ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
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

function ModeScreen({ onSelect }: { onSelect: (m: Mode) => void }) {
  return (
    <div className="w-full max-w-lg mx-auto fade-in">
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
            className="p-6 rounded-2xl border-2 border-gray-200 bg-white text-left hover:border-gray-900 hover:bg-gray-50 transition-all group">
            <div className="text-3xl mb-4">{opt.emoji}</div>
            <div className="text-[17px] font-semibold text-gray-900 mb-2 group-hover:text-gray-900">
              {opt.label}
            </div>
            <div className="text-[14px] text-gray-500 leading-relaxed">{opt.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Step 1 — Sleep ───────────────────────────────────────────────────────────

function Step1({ data, set }: { data: WizardData; set: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void }) {
  const sleepHours = calcSleepHours(data.preferred_bedtime, data.preferred_wake_time);
  return (
    <StepShell headline="When do you sleep?" subtext="Sunday will protect this time every single night.">
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
                  active ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
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
                data.is_remote === opt.val ? "border-gray-900 bg-gray-50" : "border-gray-200 bg-white hover:border-gray-300"
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
                  active ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                }`}>
                {short}
              </button>
            );
          })}
        </div>
      </div>
      <button type="button" onClick={handleAdd} disabled={!canAdd}
        className="w-full py-3 rounded-xl text-[14px] font-semibold bg-gray-900 text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-800 transition-colors">
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
            style={{ background: `linear-gradient(to right, #111111 ${capacityPct}%, #e5e7eb ${capacityPct}%)` }} />
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
                  data.energy_preference === opt.val ? "border-gray-900 bg-gray-50" : "border-gray-200 bg-white hover:border-gray-300"
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

function DraftTaskForm({ onAdd, onCancel }: {
  onAdd: (t: WizardTask) => void;
  onCancel: () => void;
}) {
  const [title,        setTitle]       = useState("");
  const [duration,     setDuration]    = useState(30);
  const [priority,     setPriority]    = useState<Priority>("medium");
  const [timingMode,   setTimingMode]  = useState<"ai" | "manual">("ai");
  const [timeOfDay,    setTimeOfDay]   = useState<"" | "morning" | "afternoon" | "evening">("");
  const [prefDays,     setPrefDays]    = useState<string[]>([]);

  const togglePrefDay = (full: string) =>
    setPrefDays(d => d.includes(full) ? d.filter(x => x !== full) : [...d, full]);

  const canAdd = title.trim().length > 0;

  const handleAdd = () => {
    if (!canAdd) return;
    const timingPref: TimingPref =
      timingMode === "ai" ? "ai_decide" : (timeOfDay || "ai_decide") as TimingPref;
    onAdd({
      id: `${Date.now()}-${Math.random()}`,
      title: title.trim(),
      duration_minutes: duration,
      priority,
      timing_preference: timingPref,
      preferred_days: timingMode === "manual" ? prefDays : [],
    });
  };

  return (
    <div className="bg-gray-50 rounded-2xl p-5 space-y-5 border border-gray-100">
      {/* Title */}
      <input type="text" autoFocus placeholder="Task name"
        value={title} onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && canAdd) handleAdd(); }}
        className="w-full px-4 py-3 rounded-xl border border-gray-200 text-[15px] text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400 bg-white" />

      {/* Duration */}
      <div className="bg-white rounded-xl border border-gray-100">
        <Stepper label="Duration" value={duration} onChange={setDuration} min={15} max={240} step={15} />
      </div>

      {/* Priority */}
      <div>
        <p className="text-[12px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Priority</p>
        <div className="flex flex-wrap gap-2">
          {PRIORITIES.map(p => (
            <button key={p} type="button" onClick={() => setPriority(p)}
              className={`px-3 py-1.5 rounded-full text-[13px] font-medium border capitalize transition-all ${
                priority === p ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              }`}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Timing */}
      <div>
        <p className="text-[12px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Timing</p>
        <div className="grid grid-cols-2 gap-2">
          {([
            {id: "ai"     as const, emoji: "🤖", label: "AI picks the best time"},
            {id: "manual" as const, emoji: "🕐", label: "I have a preference"},
          ]).map(opt => (
            <button key={opt.id} type="button" onClick={() => setTimingMode(opt.id)}
              className={`p-3 rounded-xl border-2 text-left transition-all ${
                timingMode === opt.id ? "border-gray-900 bg-white" : "border-gray-200 bg-white hover:border-gray-300"
              }`}>
              <span className="text-lg">{opt.emoji}</span>
              <div className={`text-[13px] font-medium mt-1 ${timingMode === opt.id ? "text-gray-900" : "text-gray-600"}`}>
                {opt.label}
              </div>
            </button>
          ))}
        </div>

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
                        active ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
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
                      timeOfDay === tod ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                    }`}>
                    {tod}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={handleAdd} disabled={!canAdd}
          className="flex-1 py-3 rounded-xl text-[14px] font-semibold bg-gray-900 text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-800 transition-colors">
          Add task
        </button>
        <button type="button" onClick={onCancel}
          className="px-5 py-3 rounded-xl text-[14px] text-gray-500 border border-gray-200 hover:border-gray-400 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

function TasksStep({ data, set }: { data: WizardData; set: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void }) {
  const [showForm, setShowForm] = useState(false);

  const addTask = (t: WizardTask) => {
    set("tasks", [...data.tasks, t]);
    setShowForm(false);
  };

  const removeTask = (id: string) => {
    set("tasks", data.tasks.filter(t => t.id !== id));
  };

  return (
    <StepShell
      headline="What needs to get done?"
      subtext="Add everything on your plate. Sunday will fit it into your schedule."
    >
      {/* Task list */}
      {data.tasks.length > 0 && (
        <div className="space-y-2 mb-5">
          {data.tasks.map(task => (
            <div key={task.id} className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-medium text-gray-900 truncate">{task.title}</div>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className="text-[12px] text-gray-400">{fmtDuration(task.duration_minutes)}</span>
                  <span className="text-[12px] text-gray-300">·</span>
                  <span className="text-[12px] text-gray-400 capitalize">{task.priority}</span>
                  <span className="text-[12px] text-gray-300">·</span>
                  <span className="text-[12px] text-gray-400">
                    {task.timing_preference === "ai_decide"
                      ? "AI scheduled"
                      : `${task.timing_preference}${task.preferred_days.length > 0 ? ` · ${task.preferred_days.map(d => d.slice(0,3)).join(", ")}` : ""}`
                    }
                  </span>
                </div>
              </div>
              <button type="button" onClick={() => removeTask(task.id)}
                className="text-gray-300 hover:text-gray-600 transition-colors text-xl leading-none shrink-0">
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {data.tasks.length === 0 && !showForm && (
        <div className="py-12 text-center border-2 border-dashed border-gray-100 rounded-2xl mb-5">
          <p className="text-[15px] text-gray-400 mb-1">No tasks yet</p>
          <p className="text-[13px] text-gray-300">Add at least one to continue</p>
        </div>
      )}

      {/* Draft form */}
      {showForm && (
        <div className="mb-4 fade-in">
          <DraftTaskForm onAdd={addTask} onCancel={() => setShowForm(false)} />
        </div>
      )}

      {/* Add button */}
      {!showForm && (
        <button type="button" onClick={() => setShowForm(true)}
          className="flex items-center gap-2 text-[14px] font-medium text-gray-700 hover:text-gray-900 transition-colors">
          <span className="text-xl leading-none font-light">+</span> Add task
        </button>
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

// ─── DONE SCREEN ──────────────────────────────────────────────────────────────

function DoneScreen() {
  const router = useRouter();
  return (
    <div className="w-full max-w-lg mx-auto text-center fade-in">
      <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-8">
        <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h1 className="text-[2rem] font-semibold text-gray-900 leading-tight mb-4 tracking-tight">
        Your week is protected.
      </h1>
      <p className="text-[16px] text-gray-500 mb-12 leading-relaxed">
        Sunday generates your first schedule on Sunday.
      </p>
      <button type="button" onClick={() => router.push("/week")}
        className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-gray-900 text-white text-[16px] font-semibold hover:bg-gray-800 transition-colors">
        View this week →
      </button>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function SetupPage() {
  const [mode,          setMode]          = useState<Mode | null>(null);
  const [step,          setStep]          = useState(1);
  const [direction,     setDirection]     = useState<1 | -1>(1);
  const [data,          setData]          = useState<WizardData>(DEFAULTS);
  const [generating,    setGenerating]    = useState(false);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [errMsg,        setErrMsg]        = useState<string | null>(null);
  const [done,          setDone]          = useState(false);

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
  const TOTAL        = mode === "ai" ? 2 : 7;
  const tasksStepNum = mode === "ai" ? 1 : 6;
  const isLastStep   = step === TOTAL;
  const canContinue  = step !== tasksStepNum || data.tasks.length > 0;

  function renderStep() {
    const props = { data, set };
    if (mode === "manual") {
      if (step === 1) return <Step1 {...props} />;
      if (step === 2) return <Step2 {...props} />;
      if (step === 3) return <Step3 {...props} />;
      if (step === 4) return <Step4 {...props} />;
      if (step === 5) return <Step5 {...props} />;
      if (step === 6) return <TasksStep {...props} />;
      if (step === 7) return <FreeTextStep {...props} />;
    }
    if (mode === "ai") {
      if (step === 1) return <TasksStep {...props} />;
      if (step === 2) return <FreeTextStep {...props} />;
    }
    return null;
  }

  async function handleGenerate() {
    setGenerating(true);
    setErrMsg(null);
    setLoadingMsgIdx(0);
    try {
      const weekStart = toLocalDateString(getNextMonday());
      const serializedCommitments = data.fixed_commitments.map(c =>
        JSON.stringify({ name: c.name, time: c.time, duration: c.duration, days: c.days })
      );

      await savePreferences({
        user_id: USER_ID,
        week_start_date: weekStart,
        sleep_target_hours: data.sleep_target_hours,
        preferred_bedtime: data.preferred_bedtime,
        preferred_wake_time: data.preferred_wake_time,
        morning_routine_mins: data.morning_routine_mins,
        night_routine_mins: data.night_routine_mins,
        shower_mins: data.shower_mins,
        shower_preference: data.shower_preference,
        meals_per_day: data.meals_per_day,
        meal_duration_mins: data.meal_duration_mins,
        meal_prep_days: data.meal_prep_days,
        gym_days_per_week: data.gym_days_per_week,
        gym_duration_mins: data.gym_duration_mins,
        muay_thai_days_per_week: data.muay_thai_days_per_week,
        muay_thai_duration_mins: data.muay_thai_duration_mins,
        workout_time_preference: data.workout_time_preference,
        commute_minutes: data.is_remote ? 0 : data.commute_minutes,
        is_remote: data.is_remote,
        work_days_per_week: data.work_days_per_week,
        work_location_name: data.work_location_name || null,
        weekly_task_capacity_hours: data.weekly_task_capacity_hours,
        energy_preference: data.energy_preference,
        fixed_commitments: serializedCommitments,
        notes: null,
        mode: mode ?? "manual",
        extra_context: data.extra_context || null,
      });

      for (const task of data.tasks) {
        await createTask({
          user_id: USER_ID,
          title: task.title,
          duration_minutes: task.duration_minutes,
          deadline: null,
          priority: task.priority,
          energy_level: "medium",
          is_flexible: true,
          timing_preference: task.timing_preference,
          preferred_days: task.preferred_days.length > 0
            ? JSON.stringify(task.preferred_days)
            : null,
        });
      }

      await generateSchedule(USER_ID, weekStart);
      setGenerating(false);
      setDone(true);
    } catch (e) {
      setErrMsg(String(e));
      setGenerating(false);
    }
  }

  const animClass = direction === 1 ? "slide-enter-right" : "slide-enter-left";
  const progress  = done ? 100 : mode === null ? 0 : (step / TOTAL) * 100;

  return (
    <div
      className="fixed inset-0 z-[60] bg-white overflow-y-auto"
      style={{ fontFamily: "var(--font-dm-sans, DM Sans, system-ui, sans-serif)" }}
    >
      {/* Progress bar */}
      <div className="fixed top-0 left-0 right-0 h-[3px] bg-gray-100 z-[70]">
        <div className="h-full bg-gray-900 transition-all duration-500 ease-out" style={{ width: `${progress}%` }} />
      </div>

      {/* Step counter */}
      {mode !== null && !done && (
        <div className="fixed top-6 right-6 z-[70]">
          <span className="text-[13px] text-gray-400 font-medium tabular-nums">{step} / {TOTAL}</span>
        </div>
      )}

      {/* Content */}
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-24">
        {done ? (
          <DoneScreen />
        ) : mode === null ? (
          <ModeScreen onSelect={selectMode} />
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
                className="flex-1 sm:flex-none sm:min-w-[200px] px-6 py-3 rounded-xl text-[15px] font-semibold bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {generating ? LOADING_MESSAGES[loadingMsgIdx] : "Generate my week →"}
              </button>
            ) : (
              <button type="button" onClick={goNext} disabled={!canContinue}
                className="flex-1 sm:flex-none sm:min-w-[160px] px-6 py-3 rounded-xl text-[15px] font-semibold bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
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
    </div>
  );
}
