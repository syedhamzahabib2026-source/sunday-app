"use client";

import { useEffect, useState } from "react";
import DayColumn from "@/components/DayColumn";
import {
  getWeekSchedule, getArchivedSchedules, getArchivedWeekBlocks,
  deleteArchivedSchedule, ScheduleBlock, ScheduleRecord,
} from "@/lib/api";

const USER_ID = 1;
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function toLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getMonday(d: Date): Date {
  const r = new Date(d); r.setHours(0, 0, 0, 0);
  const day = r.getDay();
  r.setDate(r.getDate() - (day === 0 ? 6 : day - 1));
  return r;
}

function addWeeks(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n * 7); return r;
}

function formatWeekRange(monday: Date): string {
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  const s = monday.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const e = sunday.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${s} – ${e}`;
}

function blockMins(b: ScheduleBlock): number {
  const [sh, sm] = b.start_time.split(":").map(Number);
  const [eh, em] = b.end_time.split(":").map(Number);
  // "00:00" end_time means midnight (end of day) = 1440 min, not 0
  const endMins = eh === 0 && em === 0 ? 1440 : eh * 60 + em;
  return endMins - (sh * 60 + sm);
}

export default function WeekPage() {
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()));
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [archivedSchedules, setArchivedSchedules] = useState<ScheduleRecord[]>([]);
  const [viewingArchive, setViewingArchive] = useState<ScheduleRecord | null>(null);
  const [archiveBlocks, setArchiveBlocks] = useState<ScheduleBlock[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const todayStr = toLocalDateString(new Date());

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    getWeekSchedule(USER_ID, toLocalDateString(weekStart))
      .then(d => { if (!cancelled) { setBlocks(d); setLoading(false); } })
      .catch(e => { if (!cancelled) { setError(String(e)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [weekStart]);

  useEffect(() => {
    getArchivedSchedules(USER_ID).then(setArchivedSchedules).catch(() => {});
  }, []);

  function handleViewArchive(rec: ScheduleRecord) {
    setViewingArchive(rec);
    setArchiveLoading(true);
    getArchivedWeekBlocks(USER_ID, rec.week_start_date)
      .then(d => { setArchiveBlocks(d); setArchiveLoading(false); })
      .catch(() => setArchiveLoading(false));
  }

  function handleDeleteArchive(id: number) {
    deleteArchivedSchedule(id).then(() => {
      setArchivedSchedules(p => p.filter(s => s.id !== id));
      if (viewingArchive?.id === id) setViewingArchive(null);
      setConfirmDelete(null);
    }).catch(() => setConfirmDelete(null));
  }

  const blocksByDay: Record<string, ScheduleBlock[]> = {};
  for (const b of blocks) (blocksByDay[b.date] ??= []).push(b);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i); return d;
  });

  const daysWithBlocks = days.filter(d => (blocksByDay[toLocalDateString(d)]?.length ?? 0) > 0).length;
  const taskBlocks = blocks.filter(b => b.block_type === "task");
  const totalHours = Math.round(blocks.reduce((s, b) => s + blockMins(b), 0) / 60 * 10) / 10;

  // Week progress bar (only for current week)
  const isCurrentWeek = toLocalDateString(weekStart) === toLocalDateString(getMonday(new Date()));
  const weekProgressPct = (() => {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun
    const daysFromMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const partial = now.getHours() / 24;
    return Math.min(100, Math.round(((daysFromMon + partial) / 7) * 100));
  })();

  return (
    <div className="px-4 sm:px-6 pt-7 pb-16 max-w-7xl mx-auto page-fade">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Week</p>
          <div className="flex items-center gap-3">
            <h1 className="text-[20px] font-semibold text-zinc-900">{formatWeekRange(weekStart)}</h1>
            {!loading && !error && (
              <span className="text-[11px] font-medium bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full border border-indigo-100">
                {daysWithBlocks} of 7 days
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 bg-zinc-50 border border-zinc-200 rounded-xl p-1 self-start sm:self-auto">
          {[[-1, "← Prev"], [0, "Today"], [1, "Next →"]].map(([offset, label]) => (
            <button
              key={String(label)}
              onClick={() => offset === 0 ? setWeekStart(getMonday(new Date())) : setWeekStart(p => addWeeks(p, offset as number))}
              className="text-[13px] font-medium text-zinc-500 hover:text-zinc-900 hover:bg-white px-3 py-1.5 rounded-lg transition-all"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Week progress bar */}
      {isCurrentWeek && (
        <div className="mb-5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">Week progress</span>
            <span className="text-[11px] font-bold text-indigo-600">{weekProgressPct}%</span>
          </div>
          <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-700"
              style={{ width: `${weekProgressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Summary strip */}
      {!loading && !error && blocks.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: "Total blocks", value: blocks.length, color: "text-zinc-900" },
            { label: "Tasks", value: taskBlocks.length, color: "text-zinc-900" },
            { label: "Hours planned", value: `${totalHours}h`, color: "text-indigo-600" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white border border-zinc-200 rounded-xl px-4 py-3 shadow-sm">
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">{label}</p>
              <p className={`text-[20px] font-semibold ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-3 py-16 text-zinc-400">
          <div className="w-4 h-4 border-2 border-zinc-200 border-t-indigo-600 rounded-full animate-spin" />
          <span className="text-[14px]">Loading week...</span>
        </div>
      )}

      {!loading && error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-[13px] text-red-700">{error}</div>
      )}

      {/* 7-column grid */}
      {!loading && !error && (
        <div className="overflow-x-auto">
          <div className="border border-zinc-200 rounded-2xl overflow-hidden min-w-[700px] shadow-sm">
            <div className="grid grid-cols-7">
              {days.map((d, i) => {
                const dateStr = toLocalDateString(d);
                return (
                  <div key={dateStr} className="border-r border-zinc-200 last:border-r-0">
                    <DayColumn
                      day={`${DAY_LABELS[i]} ${d.getDate()}`}
                      date={dateStr}
                      blocks={blocksByDay[dateStr] ?? []}
                      isToday={dateStr === todayStr}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Archived weeks */}
      {archivedSchedules.length > 0 && (
        <div className="mt-12">
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-4">Past Weeks</p>
          <div className="flex flex-col gap-1.5 mb-5">
            {archivedSchedules.map(rec => (
              <div key={rec.id} className="flex items-center justify-between px-4 py-3 rounded-xl bg-white border border-zinc-200 hover:border-zinc-300 transition-colors">
                <button
                  onClick={() => handleViewArchive(rec)}
                  className={`text-[14px] font-medium transition-colors ${viewingArchive?.id === rec.id ? "text-zinc-900" : "text-zinc-500 hover:text-zinc-900"}`}
                >
                  {rec.week_label ?? rec.week_start_date}
                </button>
                <div className="flex items-center gap-2">
                  {confirmDelete === rec.id ? (
                    <>
                      <span className="text-[12px] text-red-600 font-medium">Delete?</span>
                      <button onClick={() => handleDeleteArchive(rec.id)} className="text-[12px] font-semibold text-red-700 px-2 py-0.5 bg-red-50 rounded border border-red-200">Yes</button>
                      <button onClick={() => setConfirmDelete(null)} className="text-[12px] text-zinc-400">No</button>
                    </>
                  ) : (
                    <button onClick={() => setConfirmDelete(rec.id)} className="text-[12px] text-zinc-300 hover:text-red-600 w-6 h-6 flex items-center justify-center rounded hover:bg-red-50 transition-colors">✕</button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {viewingArchive && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <p className="text-[14px] font-semibold text-zinc-900">{viewingArchive.week_label ?? viewingArchive.week_start_date}</p>
                  <span className="text-[11px] font-medium text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded">read-only</span>
                </div>
                <button onClick={() => setViewingArchive(null)} className="text-[13px] font-medium text-zinc-400 hover:text-zinc-600">Close</button>
              </div>
              {archiveLoading ? (
                <div className="flex items-center gap-3 py-8 text-zinc-400">
                  <div className="w-4 h-4 border-2 border-zinc-200 border-t-indigo-600 rounded-full animate-spin" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <div className="border border-zinc-200 rounded-2xl overflow-hidden min-w-[700px] opacity-60 pointer-events-none select-none">
                    <div className="grid grid-cols-7">
                      {Array.from({ length: 7 }, (_, i) => {
                        const ws = new Date(viewingArchive.week_start_date + "T00:00:00");
                        const d = new Date(ws); d.setDate(ws.getDate() + i);
                        const dateStr = toLocalDateString(d);
                        return (
                          <div key={dateStr} className="border-r border-zinc-200 last:border-r-0">
                            <DayColumn
                              day={`${DAY_LABELS[i]} ${d.getDate()}`}
                              date={dateStr}
                              blocks={archiveBlocks.filter(b => b.date === dateStr)}
                              isToday={false}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
