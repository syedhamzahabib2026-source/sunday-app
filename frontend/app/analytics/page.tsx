"use client";

import { useEffect, useState } from "react";
import { getAllTasks, getCompletions, getArchivedSchedules, Task, CompletionRecord, ScheduleRecord } from "@/lib/api";

const USER_ID = 1;

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-xl px-5 py-4 shadow-sm">
      <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">{label}</p>
      <p className="text-[26px] font-semibold text-zinc-900 leading-none">{value}</p>
      {sub && <p className="text-[12px] text-zinc-400 mt-1">{sub}</p>}
    </div>
  );
}

function HBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div className="flex items-center gap-3">
      <span className="text-[13px] text-zinc-500 w-24 shrink-0 capitalize">{label}</span>
      <div className="flex-1 h-5 bg-zinc-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[13px] font-semibold text-zinc-900 w-6 text-right">{value}</span>
    </div>
  );
}

export default function AnalyticsPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completions, setCompletions] = useState<CompletionRecord[]>([]);
  const [schedules, setSchedules] = useState<ScheduleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getAllTasks(USER_ID),
      getCompletions(USER_ID),
      getArchivedSchedules(USER_ID),
    ])
      .then(([t, c, s]) => { setTasks(t); setCompletions(c); setSchedules(s); })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const hasData = tasks.length > 0 || completions.length > 0;

  // Task status counts
  const statusCounts: Record<string, number> = {};
  for (const t of tasks) {
    statusCounts[t.status] = (statusCounts[t.status] ?? 0) + 1;
  }

  // Priority counts
  const priorityCounts: Record<string, number> = {};
  for (const t of tasks) {
    priorityCounts[t.priority] = (priorityCounts[t.priority] ?? 0) + 1;
  }

  // Completion rate
  const completedCount = completions.filter((c) => c.status === "complete").length;
  const completionRate = completions.length === 0 ? 0 : Math.round((completedCount / completions.length) * 100);

  // Streak: consecutive weeks with archived schedules (simplified: just count archived weeks)
  const weeksTracked = schedules.length;

  const maxStatusCount = Math.max(...Object.values(statusCounts), 1);
  const maxPriorityCount = Math.max(...Object.values(priorityCounts), 1);

  const statusColors: Record<string, string> = {
    complete: "#059669", scheduled: "#4f46e5", pending: "#d97706",
    missed: "#dc2626", cancelled: "#a1a1aa", partial: "#7c3aed",
  };
  const priorityColors: Record<string, string> = {
    critical: "#dc2626", high: "#d97706", medium: "#4f46e5",
    low: "#71717a", optional: "#a1a1aa",
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-8 sm:pt-10 pb-16 sm:pb-20">
      <div className="mb-8">
        <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Analytics</p>
        <h1 className="text-[26px] sm:text-[30px] font-semibold text-zinc-900 leading-tight">
          Your productivity, at a glance.
        </h1>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-[13px] text-red-700 mb-6">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-3 py-20 text-zinc-400">
          <div className="w-4 h-4 border-2 border-zinc-200 border-t-indigo-600 rounded-full animate-spin" />
          <span className="text-[14px]">Loading analytics...</span>
        </div>
      )}

      {!loading && !error && !hasData && (
        <div className="py-20 text-center border-2 border-dashed border-zinc-200 rounded-2xl">
          <div className="text-[44px] mb-5">📊</div>
          <p className="text-[17px] font-semibold text-zinc-900 mb-2">No data yet</p>
          <p className="text-[14px] text-zinc-400 mb-7 leading-relaxed max-w-xs mx-auto">
            Analytics populate after you set up Sunday and complete your first week.
          </p>
          <a
            href="/setup"
            className="inline-flex items-center gap-2 bg-indigo-600 text-white text-[14px] font-semibold px-5 py-2.5 rounded-xl hover:bg-indigo-700 transition-colors"
          >
            Set up Sunday →
          </a>
        </div>
      )}

      {!loading && !error && hasData && (
        <div className="space-y-8">
          {/* Stats strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total tasks" value={tasks.length} />
            <StatCard
              label="Completion rate"
              value={`${completionRate}%`}
              sub={`${completedCount} of ${completions.length} logged`}
            />
            <StatCard
              label="Weeks tracked"
              value={weeksTracked}
              sub="archived schedules"
            />
            <StatCard
              label="Streak"
              value={weeksTracked >= 1 ? `${weeksTracked}w` : "—"}
              sub={weeksTracked >= 1 ? "weeks in a row" : "no data yet"}
            />
          </div>

          {/* Task status breakdown */}
          {Object.keys(statusCounts).length > 0 && (
            <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm">
              <h2 className="text-[14px] font-semibold text-zinc-900 mb-5">Task status breakdown</h2>
              <div className="space-y-3">
                {Object.entries(statusCounts)
                  .sort(([, a], [, b]) => b - a)
                  .map(([status, count]) => (
                    <HBar
                      key={status}
                      label={status}
                      value={count}
                      max={maxStatusCount}
                      color={statusColors[status] ?? "#a1a1aa"}
                    />
                  ))}
              </div>
            </div>
          )}

          {/* Priority distribution */}
          {Object.keys(priorityCounts).length > 0 && (
            <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm">
              <h2 className="text-[14px] font-semibold text-zinc-900 mb-5">Priority distribution</h2>
              <div className="space-y-3">
                {(["critical", "high", "medium", "low", "optional"] as const)
                  .filter((p) => priorityCounts[p] > 0)
                  .map((priority) => (
                    <HBar
                      key={priority}
                      label={priority}
                      value={priorityCounts[priority]}
                      max={maxPriorityCount}
                      color={priorityColors[priority]}
                    />
                  ))}
              </div>
            </div>
          )}

          {/* Completion history */}
          {schedules.length > 0 && (
            <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm">
              <h2 className="text-[14px] font-semibold text-zinc-900 mb-1">Weeks completed</h2>
              <p className="text-[13px] text-zinc-400 mb-5">Archived schedule history</p>
              <div className="space-y-2">
                {schedules.slice(0, 8).map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between py-2.5 border-b border-zinc-100 last:border-0"
                  >
                    <span className="text-[14px] text-zinc-700 font-medium">
                      {s.week_label ?? s.week_start_date}
                    </span>
                    <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-zinc-100 text-zinc-500 capitalize">
                      {s.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* More data notice */}
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-5 py-4">
            <p className="text-[13px] font-semibold text-indigo-700 mb-1">Analytics grow over time</p>
            <p className="text-[13px] text-indigo-500 leading-relaxed">
              Completion rates, daily patterns, and streak data become meaningful after a few weeks of consistent use.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
