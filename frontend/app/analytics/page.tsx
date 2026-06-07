"use client";

import { useEffect, useState } from "react";
import { TrendingUp, CheckCircle2, Calendar, Zap } from "lucide-react";
import { getAllTasks, getCompletions, getArchivedSchedules, Task, CompletionRecord, ScheduleRecord } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";

function StatCard({
  label, value, sub, iconBg, iconColor, Icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  iconBg: string;
  iconColor: string;
  Icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="bg-white border border-zinc-200 rounded-xl px-5 py-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{label}</p>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconBg}`}>
          <Icon className={`w-4 h-4 ${iconColor}`} />
        </div>
      </div>
      <p className="text-3xl font-bold text-zinc-900 leading-none">{value}</p>
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
      <div className="flex-1 h-2.5 bg-zinc-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${width}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[13px] font-semibold text-zinc-900 w-6 text-right tabular-nums">{value}</span>
    </div>
  );
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function AnalyticsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [user, authLoading, router]);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [completions, setCompletions] = useState<CompletionRecord[]>([]);
  const [schedules, setSchedules] = useState<ScheduleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([getAllTasks(), getCompletions(), getArchivedSchedules()])
      .then(([t, c, s]) => { setTasks(t); setCompletions(c); setSchedules(s); })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [user]);

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

  // FIX 5: real consecutive-week streak from archived schedule dates
  const sortedSchedules = [...schedules]
    .filter(s => s.week_start_date)
    .sort((a, b) => new Date(b.week_start_date).getTime() - new Date(a.week_start_date).getTime());
  let consecutiveWeeks = sortedSchedules.length === 0 ? 0 : 1;
  for (let i = 0; i < sortedSchedules.length - 1; i++) {
    const curr = new Date(sortedSchedules[i].week_start_date + "T00:00:00");
    const prev = new Date(sortedSchedules[i + 1].week_start_date + "T00:00:00");
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / 86400000);
    if (diffDays === 7) consecutiveWeeks++;
    else break;
  }

  // FIX 4: real heatmap from completion records grouped by day of week
  const dayCompleted = [0, 0, 0, 0, 0, 0, 0];
  const dayTotal = [0, 0, 0, 0, 0, 0, 0];
  for (const c of completions) {
    const dateStr = c.completed_at ?? c.created_at;
    if (!dateStr) continue;
    const dow = (new Date(dateStr).getDay() + 6) % 7; // Mon=0 … Sun=6
    dayTotal[dow]++;
    if (c.status === "complete") dayCompleted[dow]++;
  }
  const heatmapValues = DAYS.map((_, i) => {
    if (dayTotal[i] === 0) return 0;
    return Math.round((dayCompleted[i] / dayTotal[i]) * 100);
  });

  if (authLoading || !user) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-8 pb-20 page-fade">
      <div className="mb-8">
        <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Analytics</p>
        <h1 className="text-[28px] sm:text-[32px] font-semibold text-zinc-900 mb-1">Your performance</h1>
        <p className="text-[14px] text-zinc-500">Track how well you stick to your schedule</p>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-[13px] text-red-700 mb-6 flex items-center gap-2">
          <span>⚠</span> {error}
        </div>
      )}

      {loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-24 rounded-xl" />)}
          </div>
          <div className="skeleton h-48 rounded-xl" />
          <div className="skeleton h-48 rounded-xl" />
        </div>
      )}

      {!loading && !error && !hasData && (
        <div className="py-20 text-center border-2 border-dashed border-zinc-200 rounded-2xl">
          <div className="text-[44px] mb-5">📊</div>
          <p className="text-[17px] font-semibold text-zinc-900 mb-2">No data yet</p>
          <p className="text-[14px] text-zinc-400 mb-7 max-w-xs mx-auto leading-relaxed">
            Analytics populate after you set up Sunday and complete your first week.
          </p>
          <a href="/setup" className="inline-flex items-center gap-2 bg-indigo-600 text-white text-[14px] font-semibold px-5 py-2.5 rounded-xl hover:bg-indigo-700 transition-colors">
            Set up Sunday →
          </a>
        </div>
      )}

      {!loading && !error && hasData && (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total tasks" value={tasks.length} Icon={CheckCircle2} iconBg="bg-indigo-50" iconColor="text-indigo-600" sub="across all weeks" />
            <StatCard
              label="Completion" value={`${completionRate}%`}
              Icon={TrendingUp} iconBg="bg-green-50" iconColor="text-green-600"
              sub={`${completedCount} of ${completions.length} logged`}
            />
            <StatCard label="Weeks tracked" value={weeksTracked} Icon={Calendar} iconBg="bg-purple-50" iconColor="text-purple-600" sub="archived schedules" />
            <StatCard
              label="Streak" value={consecutiveWeeks >= 1 ? `${consecutiveWeeks}w` : "—"}
              Icon={Zap} iconBg="bg-amber-50" iconColor="text-amber-600"
              sub={consecutiveWeeks >= 1 ? "consecutive weeks" : "start your first week"}
            />
          </div>

          {/* Best week callout */}
          {weeksTracked > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4 flex items-start gap-4">
              <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
                <TrendingUp className="w-4 h-4 text-green-700" />
              </div>
              <div>
                <p className="text-[14px] font-semibold text-green-900 mb-0.5">
                  {weeksTracked === 1 ? "First week tracked!" : `${weeksTracked} weeks and counting`}
                </p>
                <p className="text-[13px] text-green-700 leading-relaxed">
                  {weeksTracked >= 3
                    ? "You're building a real habit. Your completion data is getting meaningful."
                    : "Keep going — patterns become visible after 3+ weeks of data."}
                </p>
              </div>
            </div>
          )}

          {/* Task status breakdown */}
          {Object.keys(statusCounts).length > 0 && (
            <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm">
              <h2 className="text-[14px] font-semibold text-zinc-900 mb-1">Task status breakdown</h2>
              <p className="text-[12px] text-zinc-400 mb-5">Color: green ≥80% · amber ≥60% · red below</p>
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
                {(["critical", "high", "medium", "low", "optional"] as const)
                  .filter(p => priorityCounts[p] > 0)
                  .map(priority => (
                    <HBar
                      key={priority} label={priority}
                      value={priorityCounts[priority]} max={maxPriority}
                      pct={priority === "critical" ? 100 : priority === "high" ? 80 : priority === "medium" ? 65 : 40}
                    />
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
                const bgColor = val === 0 ? "#f4f4f5" : val >= 80 ? "#16a34a" : val >= 60 ? "#d97706" : "#dc2626";
                const opacity = val === 0 ? 1 : val >= 80 ? 0.9 : val >= 60 ? 0.75 : 0.5;
                const textColor = val === 0 ? "#a1a1aa" : "white";
                return (
                  <div key={day} className="flex flex-col items-center gap-1.5">
                    <div
                      className="w-full aspect-square rounded-lg flex items-center justify-center transition-all hover:brightness-95 cursor-default"
                      style={{ backgroundColor: bgColor, opacity }}
                      title={val === 0 ? `${day}: no data` : `${day}: ${val}% completion`}
                    >
                      {val > 0 && (
                        <span className="text-[11px] font-bold" style={{ color: textColor }}>
                          {val}%
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-semibold text-zinc-400">{day}</span>
                  </div>
                );
              })}
            </div>
            {weeksTracked === 0 && (
              <p className="text-[12px] text-zinc-400 mt-4 text-center">
                Data builds over time after your first week
              </p>
            )}
          </div>

          {/* Schedule history */}
          {schedules.length > 0 && (
            <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-sm">
              <h2 className="text-[14px] font-semibold text-zinc-900 mb-5">Schedule history</h2>
              <div className="divide-y divide-zinc-100">
                {schedules.slice(0, 8).map(s => (
                  <div key={s.id} className="flex items-center justify-between py-3 hover:bg-zinc-50 -mx-2 px-2 rounded-lg transition-colors">
                    <span className="text-[14px] font-medium text-zinc-700">{s.week_label ?? s.week_start_date}</span>
                    <span className={`text-[11px] font-semibold rounded-full px-2.5 py-0.5 capitalize ${
                      s.status === "archived" ? "bg-zinc-100 text-zinc-500"
                      : s.status === "active" ? "bg-indigo-50 text-indigo-600"
                      : "bg-amber-50 text-amber-600"
                    }`}>{s.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-5 py-4">
            <p className="text-[13px] font-semibold text-indigo-700 mb-1">Analytics deepen over time</p>
            <p className="text-[13px] text-indigo-500 leading-relaxed">
              Completion trends, day patterns, and schedule confidence become meaningful after several weeks of consistent use.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
