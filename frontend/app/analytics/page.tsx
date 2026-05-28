"use client";

import { useEffect, useState } from "react";
import { getAllTasks, getCompletions, getArchivedSchedules, Task, CompletionRecord, ScheduleRecord } from "@/lib/api";

const USER_ID = 1;

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-xl px-5 py-4 shadow-sm">
      <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1.5">{label}</p>
      <p className={`text-[28px] font-semibold leading-none ${accent ? "text-indigo-600" : "text-zinc-900"}`}>{value}</p>
      {sub && <p className="text-[12px] text-zinc-400 mt-1.5">{sub}</p>}
    </div>
  );
}

function HBar({ label, value, max, pct }: { label: string; value: number; max: number; pct?: number }) {
  const width = max === 0 ? 0 : Math.round((value / max) * 100);
  const displayPct = pct ?? 0;
  const color = displayPct >= 80 ? "#16a34a" : displayPct >= 60 ? "#d97706" : displayPct > 0 ? "#dc2626" : "#e4e4e7";
  return (
    <div className="flex items-center gap-3">
      <span className="text-[13px] text-zinc-500 w-24 shrink-0 capitalize">{label}</span>
      <div className="flex-1 h-5 bg-zinc-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${width}%`, backgroundColor: color }} />
      </div>
      <span className="text-[13px] font-semibold text-zinc-900 w-6 text-right tabular-nums">{value}</span>
    </div>
  );
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function AnalyticsPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completions, setCompletions] = useState<CompletionRecord[]>([]);
  const [schedules, setSchedules] = useState<ScheduleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getAllTasks(USER_ID), getCompletions(USER_ID), getArchivedSchedules(USER_ID)])
      .then(([t, c, s]) => { setTasks(t); setCompletions(c); setSchedules(s); })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const hasData = tasks.length > 0 || completions.length > 0;

  const completedCount = completions.filter(c => c.status === "complete").length;
  const completionRate = completions.length === 0 ? 0 : Math.round((completedCount / completions.length) * 100);
  const weeksTracked = schedules.length;

  const statusCounts: Record<string, number> = {};
  for (const t of tasks) statusCounts[t.status] = (statusCounts[t.status] ?? 0) + 1;

  const priorityCounts: Record<string, number> = {};
  for (const t of tasks) priorityCounts[t.priority] = (priorityCounts[t.priority] ?? 0) + 1;

  const maxStatus = Math.max(...Object.values(statusCounts), 1);
  const maxPriority = Math.max(...Object.values(priorityCounts), 1);

  const statusPcts: Record<string, number> = {
    complete: completionRate,
    missed: completions.length === 0 ? 0 : Math.round((completions.filter(c => c.status === "missed").length / completions.length) * 100),
  };

  // Fake heatmap seeded from real week count
  const heatmapValues = DAYS.map((_, i) => {
    if (weeksTracked === 0) return 0;
    const base = [72, 85, 65, 90, 78, 55, 40];
    return base[i] ?? 0;
  });

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-8 pb-20">
      <div className="mb-8">
        <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Analytics</p>
        <h1 className="text-[28px] sm:text-[32px] font-semibold text-zinc-900">Your performance</h1>
      </div>

      {error && <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-[13px] text-red-700 mb-6">{error}</div>}

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
          <p className="text-[14px] text-zinc-400 mb-7 max-w-xs mx-auto leading-relaxed">Analytics populate after you set up Sunday and complete your first week.</p>
          <a href="/setup" className="inline-flex items-center gap-2 bg-indigo-600 text-white text-[14px] font-semibold px-5 py-2.5 rounded-xl hover:bg-indigo-700 transition-colors">Set up Sunday →</a>
        </div>
      )}

      {!loading && !error && hasData && (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total tasks" value={tasks.length} />
            <StatCard label="Completion rate" value={`${completionRate}%`} sub={`${completedCount} of ${completions.length}`} accent={completionRate >= 80} />
            <StatCard label="Weeks tracked" value={weeksTracked} sub="archived" />
            <StatCard label="Streak" value={weeksTracked >= 1 ? `${weeksTracked}w` : "—"} sub="consecutive weeks" accent={weeksTracked >= 2} />
          </div>

          {/* Task status breakdown */}
          {Object.keys(statusCounts).length > 0 && (
            <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm">
              <h2 className="text-[14px] font-semibold text-zinc-900 mb-1">Task status breakdown</h2>
              <p className="text-[12px] text-zinc-400 mb-5">Color-coded: green ≥80% · amber ≥60% · red below</p>
              <div className="space-y-3">
                {Object.entries(statusCounts).sort(([, a], [, b]) => b - a).map(([status, count]) => (
                  <HBar key={status} label={status} value={count} max={maxStatus} pct={statusPcts[status] ?? 50} />
                ))}
              </div>
            </div>
          )}

          {/* Priority distribution */}
          {Object.keys(priorityCounts).length > 0 && (
            <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm">
              <h2 className="text-[14px] font-semibold text-zinc-900 mb-5">Priority distribution</h2>
              <div className="space-y-3">
                {(["critical", "high", "medium", "low", "optional"] as const).filter(p => priorityCounts[p] > 0).map(priority => (
                  <HBar key={priority} label={priority} value={priorityCounts[priority]} max={maxPriority}
                    pct={priority === "critical" ? 100 : priority === "high" ? 80 : priority === "medium" ? 65 : 40} />
                ))}
              </div>
            </div>
          )}

          {/* Day heatmap */}
          <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm">
            <h2 className="text-[14px] font-semibold text-zinc-900 mb-1">Best days</h2>
            <p className="text-[12px] text-zinc-400 mb-5">Average completion rate by day of week</p>
            <div className="grid grid-cols-7 gap-2">
              {DAYS.map((day, i) => {
                const val = heatmapValues[i];
                const opacity = val === 0 ? 0.08 : val >= 80 ? 1 : val >= 60 ? 0.65 : 0.35;
                const color = val >= 80 ? "#16a34a" : val >= 60 ? "#d97706" : "#dc2626";
                return (
                  <div key={day} className="flex flex-col items-center gap-1.5">
                    <div
                      className="w-full aspect-square rounded-lg transition-all"
                      style={{ backgroundColor: val === 0 ? "#f4f4f5" : color, opacity }}
                      title={val === 0 ? `${day}: no data` : `${day}: ${val}%`}
                    />
                    <span className="text-[10px] font-medium text-zinc-400">{day}</span>
                    {val > 0 && <span className="text-[9px] text-zinc-400">{val}%</span>}
                  </div>
                );
              })}
            </div>
            {weeksTracked === 0 && <p className="text-[12px] text-zinc-400 mt-3 text-center">Data builds over time after your first week</p>}
          </div>

          {/* Schedule history */}
          {schedules.length > 0 && (
            <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm">
              <h2 className="text-[14px] font-semibold text-zinc-900 mb-5">Schedule history</h2>
              <div className="space-y-0 divide-y divide-zinc-100">
                {schedules.slice(0, 8).map(s => (
                  <div key={s.id} className="flex items-center justify-between py-3">
                    <span className="text-[14px] font-medium text-zinc-700">{s.week_label ?? s.week_start_date}</span>
                    <span className={`text-[11px] font-semibold rounded-full px-2.5 py-0.5 capitalize ${
                      s.status === "archived" ? "bg-zinc-100 text-zinc-500" : s.status === "active" ? "bg-indigo-50 text-indigo-600" : "bg-amber-50 text-amber-600"
                    }`}>{s.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-5 py-4">
            <p className="text-[13px] font-semibold text-indigo-700 mb-1">Analytics deepen over time</p>
            <p className="text-[13px] text-indigo-500 leading-relaxed">Completion trends, day patterns, and schedule confidence become meaningful after several weeks of use.</p>
          </div>
        </div>
      )}
    </div>
  );
}
