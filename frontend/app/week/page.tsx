"use client";

import { useEffect, useRef, useState } from "react";
import DayColumn from "@/components/DayColumn";
import BlockCard from "@/components/BlockCard";
import {
  getWeekSchedule, getArchivedSchedules, getArchivedWeekBlocks,
  deleteArchivedSchedule, getTodaySchedule,
  updateBlockStatus, updateTaskStatus, reorganize, reorganizeMissed,
  ScheduleBlock, ScheduleRecord,
} from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface ToastMsg { id: number; message: string; type: "success" | "error"; }

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
  const raw = (eh * 60 + em) - (sh * 60 + sm);
  return Math.max(0, raw < 0 ? raw + 1440 : raw);
}

function fmtDayFull(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function getNextMonday(): Date {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dow = today.getDay();
  const d = new Date(today); d.setDate(today.getDate() + (dow === 0 ? 1 : 8 - dow));
  return d;
}

export default function WeekPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [user, authLoading, router]);

  // Read ?preview=next from URL to auto-select next week view
  const [viewingNext, setViewingNext] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("preview") === "next";
    }
    return false;
  });

  // FIX 15: read ?date= param to allow navigating here from analytics history
  const [weekStart, setWeekStart] = useState<Date>(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search).get("date");
      if (p && /^\d{4}-\d{2}-\d{2}$/.test(p)) return getMonday(new Date(p + "T00:00:00"));
    }
    return getMonday(new Date());
  });
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [archivedSchedules, setArchivedSchedules] = useState<ScheduleRecord[]>([]);
  const [viewingArchive, setViewingArchive] = useState<ScheduleRecord | null>(null);
  const [archiveBlocks, setArchiveBlocks] = useState<ScheduleBlock[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  // FIX 9: mobile day scroll refs and active index
  const mobileScrollRef = useRef<HTMLDivElement>(null);
  const dayColRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [activeDayIdx, setActiveDayIdx] = useState<number>(() => {
    const today = new Date();
    const mon = getMonday(today);
    return Math.max(0, Math.min(6, Math.round((today.getTime() - mon.getTime()) / 86400000)));
  });

  // Day drawer
  const [drawerDate, setDrawerDate] = useState<string | null>(null);
  const [drawerBlocks, setDrawerBlocks] = useState<ScheduleBlock[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerCompletedIds, setDrawerCompletedIds] = useState<Set<number>>(new Set());
  const [drawerMissedIds,    setDrawerMissedIds]    = useState<Set<number>>(new Set());
  const [drawerExpandedId,   setDrawerExpandedId]   = useState<number | null>(null);
  const [toasts,             setToasts]             = useState<ToastMsg[]>([]);

  function showToast(message: string, type: "success" | "error" = "success") {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }

  function handleMobileScroll(e: React.UIEvent<HTMLDivElement>) {
    const container = e.currentTarget;
    const colWidth = container.scrollWidth / 7;
    if (colWidth > 0) {
      setActiveDayIdx(Math.max(0, Math.min(6, Math.round(container.scrollLeft / colWidth))));
    }
  }

  function scrollToDay(idx: number) {
    const col = dayColRefs.current[idx];
    if (col && mobileScrollRef.current) {
      mobileScrollRef.current.scrollTo({ left: col.offsetLeft, behavior: "smooth" });
    }
    setActiveDayIdx(idx);
  }

  const todayStr = toLocalDateString(new Date());

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true); setError(null);
    const ws = viewingNext ? getNextMonday() : weekStart;
    getWeekSchedule(toLocalDateString(ws))
      .then(d => { if (!cancelled) { setBlocks(d); setLoading(false); } })
      .catch(e => { if (!cancelled) { setError(String(e)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [weekStart, viewingNext, user]);

  useEffect(() => {
    if (!user) return;
    getArchivedSchedules().then(setArchivedSchedules).catch(() => {});
  }, [user]);

  function handleViewArchive(rec: ScheduleRecord) {
    setViewingArchive(rec);
    setArchiveLoading(true);
    getArchivedWeekBlocks(rec.week_start_date)
      .then(d => { setArchiveBlocks(d); setArchiveLoading(false); })
      .catch(() => { setArchiveLoading(false); showToast("Failed to load archive", "error"); });
  }

  function handleDeleteArchive(id: number) {
    deleteArchivedSchedule(id).then(() => {
      setArchivedSchedules(p => p.filter(s => s.id !== id));
      if (viewingArchive?.id === id) setViewingArchive(null);
      setConfirmDelete(null);
    }).catch(() => { setConfirmDelete(null); showToast("Failed to delete archive", "error"); });
  }

  function openDrawer(dateStr: string) {
    setDrawerDate(dateStr);
    setDrawerExpandedId(null);
    setDrawerLoading(true);
    getTodaySchedule(dateStr).then(data => {
      setDrawerBlocks(data);
      const completed = new Set<number>();
      const missed    = new Set<number>();
      for (const b of data) {
        if (b.status === "complete" || b.status === "skipped") completed.add(b.id);
        else if (b.status === "missed") missed.add(b.id);
      }
      setDrawerCompletedIds(completed);
      setDrawerMissedIds(missed);
      setDrawerLoading(false);
    }).catch(() => setDrawerLoading(false));
  }

  async function handleDrawerAction(blockId: number, taskId: number | null, action: "done" | "skip" | "miss") {
    setDrawerExpandedId(null);
    const blockStatus = action === "done" ? "complete" : action === "miss" ? "missed" : "skipped";
    updateBlockStatus(blockId, blockStatus).catch(() => {});

    if (taskId === null) {
      if (action === "done" || action === "skip") setDrawerCompletedIds(p => new Set(p).add(blockId));
      else setDrawerMissedIds(p => new Set(p).add(blockId));
      return;
    }
    if (action === "done") {
      await updateTaskStatus(taskId, "complete");
      setDrawerCompletedIds(p => new Set(p).add(blockId));
      await reorganize("task_complete");
    } else if (action === "skip") {
      await updateTaskStatus(taskId, "cancelled");
    } else if (action === "miss") {
      setDrawerMissedIds(p => new Set(p).add(blockId));
      await updateTaskStatus(taskId, "missed");
      // FIX 10: show toast with reschedule outcome
      try {
        const result = await reorganizeMissed(blockId);
        if (result.rescheduled && result.new_date) {
          showToast(`Task rescheduled to ${result.new_date}`);
        } else {
          showToast(`Task couldn't be rescheduled — no slot found this week`, "error");
        }
      } catch {
        showToast("Reschedule failed", "error");
      }
    }
    // Reload drawer + week
    if (drawerDate) openDrawer(drawerDate);
    const ws = toLocalDateString(weekStart);
    getWeekSchedule(toLocalDateString(weekStart)).then(setBlocks).catch(() => {});
  }

  const displayWeekStart = viewingNext ? getNextMonday() : weekStart;

  const blocksByDay: Record<string, ScheduleBlock[]> = {};
  for (const b of blocks) (blocksByDay[b.date] ??= []).push(b);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(displayWeekStart); d.setDate(d.getDate() + i); return d;
  });

  const daysWithBlocks = days.filter(d => (blocksByDay[toLocalDateString(d)]?.length ?? 0) > 0).length;
  const taskBlocks = blocks.filter(b => b.block_type === "task");
  const totalHours = Math.round(blocks.reduce((s, b) => s + blockMins(b), 0) / 60 * 10) / 10;

  // Week progress bar (only for current week, not draft view)
  const isCurrentWeek = !viewingNext && toLocalDateString(weekStart) === toLocalDateString(getMonday(new Date()));
  const weekProgressPct = (() => {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun
    const daysFromMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const partial = now.getHours() / 24;
    return Math.min(100, Math.round(((daysFromMon + partial) / 7) * 100));
  })();

  if (authLoading || !user) return null;

  return (
    <>
      {/* Draft banner — full-width, above the page container */}
      {viewingNext && (
        <div className="w-full bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-center">
          <span className="text-[13px] font-medium text-amber-600">
            Draft — goes live Sunday at midnight
          </span>
        </div>
      )}

    <div className="px-4 sm:px-6 pt-7 pb-16 max-w-7xl mx-auto page-fade">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Week</p>
          <div className="flex items-center gap-3">
            <h1 className="text-[20px] font-semibold text-zinc-900">{formatWeekRange(displayWeekStart)}</h1>
            {!loading && !error && (
              <span className="text-[11px] font-medium bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full border border-indigo-100">
                {daysWithBlocks} of 7 days
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 bg-zinc-50 border border-zinc-200 rounded-xl p-1 self-start sm:self-auto">
          {viewingNext ? (
            <button
              onClick={() => setViewingNext(false)}
              className="text-[13px] font-medium text-zinc-500 hover:text-zinc-900 hover:bg-white px-3 py-1.5 rounded-lg transition-all"
            >
              ← This Week
            </button>
          ) : (
            [[-1, "← Prev"], [0, "Today"], [1, "Next →"]].map(([offset, label]) => (
              <button
                key={String(label)}
                onClick={() => offset === 0 ? setWeekStart(getMonday(new Date())) : setWeekStart(p => addWeeks(p, offset as number))}
                className="text-[13px] font-medium text-zinc-500 hover:text-zinc-900 hover:bg-white px-3 py-1.5 rounded-lg transition-all"
              >
                {label}
              </button>
            ))
          )}
        </div>
      </div>

      {/* This week / Next week toggle */}
      <div className="flex items-center bg-zinc-100 rounded-xl p-1 gap-1 self-start mb-5 w-fit">
        <button
          onClick={() => setViewingNext(false)}
          className={`px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all ${!viewingNext ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}
        >
          This week
        </button>
        <button
          onClick={() => setViewingNext(true)}
          className={`px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all ${viewingNext ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}
        >
          Next week (draft)
        </button>
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

      {/* Empty state for next week with no schedule yet */}
      {viewingNext && !loading && !error && blocks.length === 0 && (
        <div className="py-20 text-center">
          <p className="text-[16px] font-medium text-zinc-500 mb-2">No schedule planned for next week yet</p>
          <p className="text-[13px] text-zinc-400 mb-6">Build your next week in advance and it goes live Sunday at midnight.</p>
          <a
            href="/setup?week=next"
            className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl text-[14px] font-semibold hover:bg-indigo-700 transition-colors"
          >
            Plan next week →
          </a>
        </div>
      )}

      {/* FIX 11: Empty state for current week with no blocks */}
      {!viewingNext && !loading && !error && blocks.length === 0 && (
        <div className="py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-zinc-100 flex items-center justify-center text-3xl mx-auto mb-5">📅</div>
          <p className="text-[16px] font-medium text-zinc-500 mb-2">No schedule for this week</p>
          <p className="text-[13px] text-zinc-400 mb-6">
            Go to{" "}
            <a href="/setup" className="text-indigo-600 hover:underline font-semibold">
              Setup
            </a>{" "}
            to build your week.
          </p>
        </div>
      )}

      {/* 7-column grid */}
      {!loading && !error && (
        <>
          {/* Mobile: day tab bar + horizontal snap scroll (FIX 9) */}
          <div className="sm:hidden">
            <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
              {days.map((d, i) => {
                const dateStr = toLocalDateString(d);
                const isToday = dateStr === todayStr;
                return (
                  <button
                    key={i}
                    onClick={() => scrollToDay(i)}
                    className={`shrink-0 flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors ${
                      activeDayIdx === i
                        ? "bg-indigo-600 text-white"
                        : isToday
                        ? "bg-indigo-50 text-indigo-600 border border-indigo-200"
                        : "bg-zinc-100 text-zinc-500"
                    }`}
                  >
                    <span className="text-[9px] font-bold uppercase tracking-widest">{DAY_LABELS[i]}</span>
                    <span className="text-[14px] font-semibold leading-none">{d.getDate()}</span>
                  </button>
                );
              })}
            </div>
            <div
              ref={mobileScrollRef}
              className="flex overflow-x-auto snap-x snap-mandatory gap-3 pb-3"
              style={{ scrollbarWidth: "none" }}
              onScroll={handleMobileScroll}
            >
              {days.map((d, i) => {
                const dateStr = toLocalDateString(d);
                return (
                  <div
                    key={dateStr}
                    ref={el => { dayColRefs.current[i] = el; }}
                    className="snap-start shrink-0 w-[85vw] border border-zinc-200 rounded-xl overflow-hidden"
                  >
                    <DayColumn
                      day={`${DAY_LABELS[i]} ${d.getDate()}`}
                      date={dateStr}
                      blocks={blocksByDay[dateStr] ?? []}
                      isToday={dateStr === todayStr}
                      onClick={() => openDrawer(dateStr)}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Desktop: 7-column grid */}
          <div className="hidden sm:block overflow-x-auto">
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
                        onClick={() => openDrawer(dateStr)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Day drawer */}
      {drawerDate !== null && (
        <>
          <div
            className="fixed inset-0 z-30 bg-black/20 backdrop-blur-[1px]"
            onClick={() => setDrawerDate(null)}
          />
          <div className="fixed right-0 top-0 bottom-0 z-40 w-full sm:w-[380px] bg-white border-l border-zinc-200 shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 shrink-0">
              <div>
                <p className="text-[15px] font-semibold text-zinc-900">{fmtDayFull(drawerDate)}</p>
                <p className="text-[11px] text-zinc-400 mt-0.5">{drawerBlocks.length} blocks</p>
              </div>
              <button
                onClick={() => setDrawerDate(null)}
                className="w-11 h-11 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors text-xl"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
              {drawerLoading ? (
                <div className="flex items-center gap-2 py-12 justify-center text-zinc-400 text-[13px]">
                  <div className="w-4 h-4 border-2 border-zinc-200 border-t-indigo-600 rounded-full animate-spin" />
                  Loading...
                </div>
              ) : drawerBlocks.length === 0 ? (
                <p className="text-center text-[13px] text-zinc-400 py-12">No blocks scheduled</p>
              ) : (
                drawerBlocks.map(block => (
                  <BlockCard
                    key={block.id}
                    block={block}
                    isExpanded={drawerExpandedId === block.id}
                    onToggle={() => setDrawerExpandedId(p => p === block.id ? null : block.id)}
                    onAction={handleDrawerAction}
                    completed={drawerCompletedIds.has(block.id)}
                    missed={drawerMissedIds.has(block.id)}
                    rescheduled={block.is_rescheduled === true}
                  />
                ))
              )}
            </div>
          </div>
        </>
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
                  <div className="border border-zinc-200 rounded-2xl overflow-hidden min-w-[700px] opacity-80 shadow-sm">
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

      {/* Toast notifications */}
      {toasts.length > 0 && (
        <div className="fixed bottom-6 right-4 sm:right-6 z-50 flex flex-col gap-2 max-w-xs w-full pointer-events-none">
          {toasts.map(toast => (
            <div
              key={toast.id}
              className={`px-4 py-3 rounded-xl shadow-xl text-white text-[13px] font-medium pointer-events-auto ${
                toast.type === "success" ? "bg-indigo-600" : "bg-red-600"
              }`}
            >
              {toast.message}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
