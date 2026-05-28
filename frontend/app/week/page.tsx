"use client";

import { useEffect, useState } from "react";
import DayColumn from "@/components/DayColumn";
import {
  getWeekSchedule,
  getArchivedSchedules,
  getArchivedWeekBlocks,
  deleteArchivedSchedule,
  ScheduleBlock,
  ScheduleRecord,
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

function formatWeekLabel(monday: Date): string {
  return monday.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
}

export default function WeekPage() {
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()));
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Archived weeks
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
    getArchivedSchedules(USER_ID)
      .then(setArchivedSchedules)
      .catch(() => {});
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

  return (
    <div className="pt-6">
      {/* Navigation row */}
      <div className="flex items-center justify-center gap-3 mb-1">
        <button
          onClick={() => setWeekStart((prev) => addWeeks(prev, -1))}
          className="text-[13px] text-[#888888] hover:text-[#f0f0f0] transition-colors px-2 py-1"
        >
          ← Prev
        </button>
        <button
          onClick={() => setWeekStart(getMonday(new Date()))}
          className="text-[13px] text-[#888888] hover:text-[#f0f0f0] transition-colors px-2 py-1"
        >
          Today
        </button>
        <button
          onClick={() => setWeekStart((prev) => addWeeks(prev, 1))}
          className="text-[13px] text-[#888888] hover:text-[#f0f0f0] transition-colors px-2 py-1"
        >
          Next →
        </button>
      </div>

      {/* Week label */}
      <p className="text-center text-[13px] text-[#555555] mb-4">
        Week of {formatWeekLabel(weekStart)}
      </p>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center gap-2 py-16 text-[#555555]">
          <div className="w-3.5 h-3.5 border-2 border-[#2a2a2a] border-t-[#555555] rounded-full animate-spin" />
          <span className="text-[13px]">Loading week...</span>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] px-4 py-3 text-[13px] text-[#f87171]">
          {error}
        </div>
      )}

      {/* 7-column grid */}
      {!loading && !error && (
        <div className="grid grid-cols-7 gap-px bg-[#2a2a2a] rounded-lg overflow-hidden min-w-[700px]">
          {days.map((d, i) => {
            const dateStr = toLocalDateString(d);
            const dayBlocks = blocksByDay[dateStr] ?? [];
            const label = `${DAY_LABELS[i]} ${d.getDate()}`;
            return (
              <div key={dateStr} className="bg-[#0f0f0f]">
                <DayColumn
                  day={label}
                  date={dateStr}
                  blocks={dayBlocks}
                  isToday={dateStr === todayStr}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* ── Archived weeks ── */}
      {archivedSchedules.length > 0 && (
        <div className="mt-10">
          <p className="text-[12px] text-[#555555] uppercase tracking-widest mb-3">
            Past Weeks
          </p>

          {/* Archive list */}
          <div className="flex flex-col gap-1 mb-4">
            {archivedSchedules.map((rec) => (
              <div
                key={rec.id}
                className="flex items-center justify-between px-3 py-2 rounded-md bg-[#1a1a1a] border border-[#2a2a2a]"
              >
                <button
                  onClick={() => handleViewArchive(rec)}
                  className={`text-[13px] hover:text-[#f0f0f0] transition-colors ${
                    viewingArchive?.id === rec.id ? "text-[#f0f0f0]" : "text-[#888888]"
                  }`}
                >
                  {rec.week_label ?? rec.week_start_date}
                </button>
                <div className="flex items-center gap-2">
                  {confirmDelete === rec.id ? (
                    <>
                      <span className="text-[11px] text-[#f87171]">Delete?</span>
                      <button
                        onClick={() => handleDeleteArchive(rec.id)}
                        className="text-[11px] text-[#f87171] hover:text-white transition-colors px-2"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="text-[11px] text-[#555555] hover:text-[#888888] transition-colors"
                      >
                        No
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(rec.id)}
                      className="text-[11px] text-[#3a3a3a] hover:text-[#f87171] transition-colors px-1"
                      title="Delete archived week"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Archive week viewer (read-only) */}
          {viewingArchive && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[13px] text-[#555555]">
                  {viewingArchive.week_label ?? viewingArchive.week_start_date}
                  <span className="ml-2 text-[11px] text-[#3a3a3a]">read-only</span>
                </p>
                <button
                  onClick={() => setViewingArchive(null)}
                  className="text-[12px] text-[#555555] hover:text-[#888888] transition-colors"
                >
                  Close
                </button>
              </div>

              {archiveLoading ? (
                <div className="flex items-center gap-2 py-8 text-[#555555]">
                  <div className="w-3 h-3 border-2 border-[#2a2a2a] border-t-[#555555] rounded-full animate-spin" />
                  <span className="text-[12px]">Loading archive...</span>
                </div>
              ) : (
                <div className="grid grid-cols-7 gap-px bg-[#2a2a2a] rounded-lg overflow-hidden min-w-[700px] opacity-70 pointer-events-none select-none">
                  {Array.from({ length: 7 }, (_, i) => {
                    const ws = new Date(viewingArchive.week_start_date + "T00:00:00");
                    const d = new Date(ws);
                    d.setDate(ws.getDate() + i);
                    const dateStr = toLocalDateString(d);
                    const dayBlocks = archiveBlocks.filter((b) => b.date === dateStr);
                    const label = `${DAY_LABELS[i]} ${d.getDate()}`;
                    return (
                      <div key={dateStr} className="bg-[#0f0f0f]">
                        <DayColumn
                          day={label}
                          date={dateStr}
                          blocks={dayBlocks}
                          isToday={false}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
