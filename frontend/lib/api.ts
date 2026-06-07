import { getToken } from "@/lib/auth";

const BASE = `${process.env.NEXT_PUBLIC_API_URL ?? "https://sunday-app-production-d774.up.railway.app"}/api/v1`;

export type BlockType =
  | "task"
  | "sleep"
  | "meal"
  | "commute"
  | "gym"
  | "muay_thai"
  | "routine"
  | "buffer"
  | "event"
  | "deep_work";

export interface ScheduleBlock {
  id: number;
  user_id: number;
  task_id: number | null;
  block_type: BlockType;
  title: string;
  start_time: string; // "HH:MM"
  end_time: string;   // "HH:MM"
  date: string;       // "YYYY-MM-DD"
  is_locked: boolean;
  priority: string | null;
  status: string | null;
  is_rescheduled: boolean;
  created_at: string;
}

export interface Task {
  id: number;
  user_id: number;
  title: string;
  duration_minutes: number;
  deadline: string | null;
  priority: string;
  location: string | null;
  energy_level: string;
  is_flexible: boolean;
  status: string;
  timing_preference: string | null;
  preferred_days: string | null;
  fixed_start_time: string | null;
  fixed_end_time: string | null;
  commute_minutes: number | null;
  is_recurring: boolean;
  created_at: string;
  updated_at: string;
}

export interface WeeklyPreferences {
  id: number;
  user_id: number;
  week_start_date: string;
  sleep_target_hours: number;
  preferred_bedtime: string;
  preferred_wake_time: string;
  morning_routine_mins: number;
  night_routine_mins: number;
  shower_mins: number;
  shower_preference: string;
  meals_per_day: number;
  meal_duration_mins: number;
  meal_prep_days: string[];
  gym_days_per_week: number;
  gym_duration_mins: number;
  muay_thai_days_per_week: number;
  muay_thai_duration_mins: number;
  workout_time_preference: string;
  commute_minutes: number;
  is_remote: boolean;
  work_days_per_week: number;
  work_location_name: string | null;
  weekly_task_capacity_hours: number;
  energy_preference: string;
  fixed_commitments: string[];
  notes: string | null;
  mode: string;
  extra_context: string | null;
  scheduling_notes: string | null;
  meal_breakfast_time: string | null;
  meal_lunch_time:     string | null;
  meal_dinner_time:    string | null;
  deep_work_enabled: boolean;
  deep_work_session_duration: number;
  created_at: string;
}

export interface UserLocation {
  id: number;
  user_id: number;
  name: string;
  commute_minutes: number;
  created_at: string;
}

export interface ReorganizeResult {
  blocks_cleared: number;
  blocks_created: number;
  tasks_rescheduled: Task[];
  tasks_dropped: Task[];
  deadline_at_risk: Task[];
  is_overloaded: boolean;
  reorganization_log_id: number;
}

export interface RescheduleResult {
  rescheduled: boolean;
  reason?: string;
  task_title?: string;
  new_date?: string;
  new_start_time?: string;
  new_end_time?: string;
  block_id?: number;
}

export interface GenerateResult {
  week_start: string;
  block_count: number;
  is_overloaded: boolean;
  unscheduled_tasks: Task[];
  blocks_by_day: Record<string, ScheduleBlock[]>;
}

export interface ScheduleRecord {
  id: number;
  user_id: number;
  week_start_date: string;
  status: string;
  week_label: string | null;
  archived_at: string | null;
  created_at: string;
}

export interface CompletionRecord {
  id: number;
  user_id: number;
  schedule_block_id: number;
  task_id: number | null;
  status: string;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
}

// ── Core fetch ────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const url   = `${BASE}${path}`;
  console.log("[API] →", url);
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
  });
  console.log("[API] ←", res.status, url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ── Schedule blocks ───────────────────────────────────────────────────────────

export function getTodaySchedule(date: string): Promise<ScheduleBlock[]> {
  return apiFetch(`/schedule/day/${date}`);
}

export function getWeekSchedule(weekStart: string): Promise<ScheduleBlock[]> {
  return apiFetch(`/schedule/week/${weekStart}`);
}

export function updateBlockStatus(blockId: number, status: string): Promise<ScheduleBlock> {
  return apiFetch(`/schedule/block/${blockId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function reorganize(reason = "manual"): Promise<ReorganizeResult> {
  return apiFetch("/schedule/reorganize", {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function reorganizeMissed(missedBlockId: number): Promise<RescheduleResult> {
  return apiFetch("/schedule/reorganize", {
    method: "POST",
    body: JSON.stringify({ missed_block_id: missedBlockId, reason: "missed" }),
  });
}

export function generateSchedule(
  weekStart: string,
  generationTimestamp?: string,
  weekTarget: "current" | "next" = "current",
): Promise<GenerateResult> {
  return apiFetch("/schedule/generate", {
    method: "POST",
    body: JSON.stringify({
      week_start_date: weekStart,
      ...(generationTimestamp ? { generation_timestamp: generationTimestamp } : {}),
      week_target: weekTarget,
    }),
  });
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export function updateTaskStatus(taskId: number, status: string): Promise<Task> {
  return apiFetch(`/tasks/${taskId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function getRecentTasks(): Promise<Task[]> {
  return apiFetch("/tasks/recent");
}

export function getAllTasks(): Promise<Task[]> {
  return apiFetch("/tasks/");
}

export interface TaskCreatePayload {
  title: string;
  duration_minutes: number;
  deadline: string | null;
  priority: string;
  energy_level: string;
  is_flexible: boolean;
  timing_preference?: string;
  preferred_days?: string | null;
  fixed_start_time?: string | null;
  fixed_end_time?: string | null;
  commute_minutes?: number;
  is_recurring?: boolean;
}

export function createTask(data: TaskCreatePayload): Promise<Task> {
  return apiFetch("/tasks/", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ── Preferences ───────────────────────────────────────────────────────────────

export function savePreferences(
  data: Omit<WeeklyPreferences, "id" | "user_id" | "created_at">
): Promise<WeeklyPreferences> {
  return apiFetch("/preferences/", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function getPreferences(): Promise<WeeklyPreferences> {
  return apiFetch("/preferences/current");
}

export function getLatestPreferences(): Promise<WeeklyPreferences> {
  return apiFetch("/preferences/latest");
}

// ── Locations ─────────────────────────────────────────────────────────────────

export function getSavedLocations(): Promise<UserLocation[]> {
  return apiFetch("/locations/");
}

export function saveLocation(data: { name: string; commute_minutes: number }): Promise<UserLocation> {
  return apiFetch("/locations/", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ── Schedules (archive / lifecycle) ──────────────────────────────────────────

export function getArchivedSchedules(): Promise<ScheduleRecord[]> {
  return apiFetch("/schedules/archived");
}

export function getArchivedWeekBlocks(weekStart: string): Promise<ScheduleBlock[]> {
  return apiFetch(`/schedules/week/${weekStart}`);
}

export function deleteArchivedSchedule(scheduleId: number): Promise<void> {
  return apiFetch(`/schedules/${scheduleId}`, { method: "DELETE" });
}

export function getAllSchedules(): Promise<ScheduleRecord[]> {
  return apiFetch("/schedules/all");
}

// ── Completions ───────────────────────────────────────────────────────────────

export function getCompletions(): Promise<CompletionRecord[]> {
  return apiFetch("/completions/");
}
