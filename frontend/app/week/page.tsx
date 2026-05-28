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
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getMonday(d: Date): Date {
  const result = new Date(d);
  result.setHours(0, 0, 0, 0);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + diff);
  return result;
}

function addWeeks(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n * 7);
  return result;
}

function formatWeekRange(monday: Date): string {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const start = monday.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const end = sunday.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${start} – ${end}`;
}

function blockDurationMin(b: ScheduleBlock): number {
  const [sh, sm] = b.start_time.split(":").map(Number);
  const [eh, em] = b.end_time.split(":").map(Number);
  return eh * 60 + em - (sh * 60 + sm);
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
    setLoading(true);
    setError(null);
    getWeekSchedule(USER_ID, toLocalDateString(weekStart))
      .then((data) => { if (!cancelled) { setBlocks(data); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(String(e)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [weekStart]);

  useEffect(() => {
    getArchivedSchedules(USER_ID).then(setArchivedSchedules).catch(() => {});
  }, []);

  function handleViewArchive(rec: ScheduleRecord) {
    setViewingArchive(rec);
    setArchiveLoading(true);
    getArchivedWeekBlocks(USER_ID, rec.week_start_date)
      .then((data) => { setArchiveBlocks(data); setArchiveLoading(false); })
      .catch(() => setArchiveLoading(false));
  }

  function handleDeleteArchive(scheduleId: number) {
    deleteArchivedSchedule(scheduleId).then(() => {
      setArchivedSchedules((prev) => prev.filter((s) => s.id !== scheduleId));
      if (viewingArchive?.id === scheduleId) setViewingArchive(null);
      setConfirmDelete(null);
    }).catch(() => setConfirmDelete(null));
  }

  const blocksByDay: Record<string, ScheduleBlock[]> = {};
  for (const b of blocks) {
    (blocksByDay[b.date] ??= []).push(b);
  }

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  // Weekly summary stats
  const taskBlocks = blocks.filter((b) => b.block_type === "task");
  const totalHours = Math.round(blocks.reduce((s, b) => s + blockDurationMin(b), 0) / 60 * 10) / 10;

  return (
    <div className="px-4 sm:px-6 pt-7 pb-16 max-w-7xl mx-auto">
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Week</p>
          <h1 className="text-[20px] font-semibold text-zinc-900">{formatWeekRange(weekStart)}</h1>
        </div>
        <div className="flex items-center gap-1 bg-zinc-50 border border-zinc-200 rounded-xl p-1 self-start sm:self-auto">
          <button
            onClick={() => setWeekStart((p) => addWeeks(p, -1))}
            className="text-[13px] font-medium text-zinc-500 hover:text-zinc-900 hover:bg-white px-3 py-1.5 rounded-lg transition-all"
          >
            ← Prev
          </button>
          <button
            onClick={() => setWeekStart(getMonday(new Date()))}
            className="text-[13px] font-medium text-zinc-500 hover:text-zinc-900 hover:bg-white px-3 py-1.5 rounded-lg transition-all"
          >
            Today
          </button>
          <button
            onClick={() => setWeekStart((p) => addWeeks(p, 1))}
            className="text-[13px] font-medium text-zinc-500 hover:text-zinc-900 hover:bg-white px-3 py-1.5 rounded-lg transition-all"
          >
            Next →
          </button>
        </div>
      </div>

      {/* Weekly summary strip */}
      {!loading && !error && blocks.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-white border border-zinc-200 rounded-xl px-4 py-3 shadow-sm">
            <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wide mb-1">Total blocks</p>
            <p className="text-[20px] font-semibold text-zinc-900">{blocks.length}</p>
          </div>
          <div className="bg-white border border-zinc-200 rounded-xl px-4 py-3 shadow-sm">
            <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wide mb-1">Tasks scheduled</p>
            <p className="text-[20px] font-semibold text-zinc-900">{taskBlocks.length}</p>
          </div>
          <div className="bg-white border border-zinc-200 rounded-xl px-4 py-3 shadow-sm">
            <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wide mb-1">Hours planned</p>
            <p className="text-[20px] font-semibold text-indigo-600">{totalHours}h</p>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-3 py-16 text-zinc-400">
          <div className="w-4 h-4 border-2 border-zinc-200 border-t-indigo-600 rounded-full animate-spin" />
          <span className="text-[14px]">Loading week...</span>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-[13px] text-red-700">
          {error}
        </div>
      )}

      {/* 7-column grid */}
      {!loading && !error && (
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
      )}

      {/* ── Archived weeks ── */}
      {archivedSchedules.length > 0 && (
        <div className="mt-12">
          <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-4">Past Weeks</p>

          <div className="flex flex-col gap-1.5 mb-5">
            {archivedSchedules.map((rec) => (
              <div
                key={rec.id}
                className="flex items-center justify-between px-4 py-3 rounded-xl bg-white border border-zinc-200 hover:border-zinc-300 transition-colors"
              >
                <button
                  onClick={() => handleViewArchive(rec)}
                  className={`text-[14px] font-medium transition-colors ${
                    viewingArchive?.id === rec.id ? "text-zinc-900" : "text-zinc-500 hover:text-zinc-900"
                  }`}
                >
                  {rec.week_label ?? rec.week_start_date}
                </button>
                <div className="flex items-center gap-2">
                  {confirmDelete === rec.id ? (
                    <>
                      <span className="text-[12px] text-red-600 font-medium">Delete?</span>
                      <button
                        onClick={() => handleDeleteArchive(rec.id)}
                        className="text-[12px] font-semibold text-red-700 hover:text-red-900 px-2 py-0.5 bg-red-50 rounded-md border border-red-200 transition-colors"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="text-[12px] font-medium text-zinc-400 hover:text-zinc-600 transition-colors"
                      >
                        No
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(rec.id)}
                      className="text-[12px] text-zinc-300 hover:text-red-600 w-6 h-6 flex items-center justify-center rounded hover:bg-red-50 transition-colors"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {viewingArchive && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <p className="text-[14px] font-semibold text-zinc-900">
                    {viewingArchive.week_label ?? viewingArchive.week_start_date}
                  </p>
                  <span className="text-[11px] font-medium text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded">
                    read-only
                  </span>
                </div>
                <button
                  onClick={() => setViewingArchive(null)}
                  className="text-[13px] font-medium text-zinc-400 hover:text-zinc-600 transition-colors"
                >
                  Close
                </button>
              </div>

              {archiveLoading ? (
                <div className="flex items-center gap-3 py-8 text-zinc-400">
                  <div className="w-4 h-4 border-2 border-zinc-200 border-t-indigo-600 rounded-full animate-spin" />
                  <span className="text-[13px]">Loading archive...</span>
                </div>
              ) : (
                <div className="border border-zinc-200 rounded-2xl overflow-hidden min-w-[700px] opacity-60 pointer-events-none select-none">
                  <div className="grid grid-cols-7">
                    {Array.from({ length: 7 }, (_, i) => {
                      const ws = new Date(viewingArchive.week_start_date + "T00:00:00");
                      const d = new Date(ws);
                      d.setDate(ws.getDate() + i);
                      const dateStr = toLocalDateString(d);
                      return (
                        <div key={dateStr} className="border-r border-zinc-200 last:border-r-0">
                          <DayColumn
                            day={`${DAY_LABELS[i]} ${d.getDate()}`}
                            date={dateStr}
                            blocks={archiveBlocks.filter((b) => b.date === dateStr)}
                            isToday={false}
                          />
                        </div>
                      );
                    })}
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
