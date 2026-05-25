const BASE = "http://localhost:8000/api/v1";

export type BlockType =
  | "task"
  | "sleep"
  | "meal"
  | "commute"
  | "gym"
  | "muay_thai"
  | "routine"
  | "buffer";

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
  meals_per_day: number;
  meal_prep_days: string[];
  gym_days_per_week: number;
  muay_thai_days_per_week: number;
  commute_minutes: number;
  is_remote: boolean;
  fixed_commitments: string[];
  notes: string | null;
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

export interface GenerateResult {
  week_start: string;
  block_count: number;
  is_overloaded: boolean;
  unscheduled_tasks: Task[];
  blocks_by_day: Record<string, ScheduleBlock[]>;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE}${path}`;
  console.log("[API] →", url);
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  console.log("[API] ←", res.status, url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export function getTodaySchedule(userId: number, date: string): Promise<ScheduleBlock[]> {
  return apiFetch(`/schedule/${userId}/day/${date}`);
}

export function getWeekSchedule(userId: number, weekStart: string): Promise<ScheduleBlock[]> {
  return apiFetch(`/schedule/${userId}/week/${weekStart}`);
}

export function updateTaskStatus(taskId: number, status: string): Promise<Task> {
  return apiFetch(`/tasks/${taskId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function reorganize(userId: number, reason = "manual"): Promise<ReorganizeResult> {
  return apiFetch("/schedule/reorganize", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, reason }),
  });
}

export function savePreferences(
  data: Omit<WeeklyPreferences, "id" | "created_at">
): Promise<WeeklyPreferences> {
  return apiFetch("/preferences/", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function generateSchedule(userId: number, weekStart: string): Promise<GenerateResult> {
  return apiFetch("/schedule/generate", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, week_start_date: weekStart }),
  });
}

export function getPreferences(userId: number): Promise<WeeklyPreferences> {
  return apiFetch(`/preferences/${userId}/current`);
}

export interface TaskCreatePayload {
  user_id: number;
  title: string;
  duration_minutes: number;
  deadline: null;
  priority: string;
  energy_level: string;
  is_flexible: boolean;
}

export function createTask(data: TaskCreatePayload): Promise<Task> {
  return apiFetch("/tasks/", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
