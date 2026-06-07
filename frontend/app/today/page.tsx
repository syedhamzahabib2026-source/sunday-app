"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock, TrendingUp, Zap, Sun, Moon } from "lucide-react";
import BlockCard from "@/components/BlockCard";
import { getTodaySchedule, updateTaskStatus, updateBlockStatus, reorganize, reorganizeMissed, ScheduleBlock } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";

function toLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateLong(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function formatWeekRange(d: Date): string {
  const monday = new Date(d);
  const day = monday.getDay();
  monday.setDate(monday.getDate() - (day === 0 ? 6 : day - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${monday.toLocaleDateString("en-US", opts)} – ${sunday.toLocaleDateString("en-US", opts)}`;
}

function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function getWeekMondayStr(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// FIX 8: guard against null/undefined or missing ":" in time strings
function blockMins(b: ScheduleBlock): number {
  if (!b.start_time?.includes(":") || !b.end_time?.includes(":")) return 0;
  const [sh, sm] = b.start_time.split(":").map(Number);
  const [eh, em] = b.end_time.split(":").map(Number);
  const raw = (eh * 60 + em) - (sh * 60 + sm);
  return Math.max(0, raw < 0 ? raw + 1440 : raw);
}

function fmt12(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const p = h >= 12 ? "PM" : "AM";
  const hr = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hr}:${String(m).padStart(2, "0")} ${p}`;
}

function getNextBlock(blocks: ScheduleBlock[]): { block: ScheduleBlock; minutesUntil: number } | null {
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  for (const b of blocks) {
    const [h, m] = b.start_time.split(":").map(Number);
    if (h * 60 + m > cur) return { block: b, minutesUntil: h * 60 + m - cur };
  }
  return null;
}

type TimeGroup = "morning" | "afternoon" | "evening";

function getGroup(t: string): TimeGroup {
  const [h] = t.split(":").map(Number);
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

function gapMins(prev: ScheduleBlock, next: ScheduleBlock): number {
  const [ph, pm] = prev.end_time.split(":").map(Number);
  const [nh, nm] = next.start_time.split(":").map(Number);
  let endM = ph * 60 + pm;
  if (endM === 0) endM = 1440;
  return Math.max(0, nh * 60 + nm - endM);
}

function NowLine() {
  return (
    <div className="flex items-center gap-2 my-1 px-0.5">
      <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
      <div className="flex-1 h-px bg-red-300" />
      <span className="text-[10px] font-bold text-red-500 uppercase tracking-wider">Now</span>
      <div className="flex-1 h-px bg-red-300" />
    </div>
  );
}

interface ToastMsg { id: number; message: string; type: "success" | "error"; }

function rescheduleDay(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  return d.toLocaleDateString("en-US", { weekday: "long" });
}

const GROUP_META: Record<TimeGroup, { label: string; range: string; Icon: React.ComponentType<{ className?: string }>; iconClass: string }> = {
  morning:   { label: "Morning",   range: "before noon",  Icon: Sun,  iconClass: "text-amber-500" },
  afternoon: { label: "Afternoon", range: "12 – 5 PM",    Icon: Sun,  iconClass: "text-orange-400" },
  evening:   { label: "Evening",   range: "after 5 PM",   Icon: Moon, iconClass: "text-indigo-500" },
};

const actualTodayStr = toLocalDateString(new Date());

function getDayLabel(viewing: string, actual: string): string {
  const diff = Math.round(
    (new Date(viewing + "T12:00:00").getTime() - new Date(actual + "T12:00:00").getTime()) / 86400000
  );
  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  if (diff === 1) return "Tomorrow";
  return new Date(viewing + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

export default function TodayPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [user, authLoading, router]);

  // Read date from URL ?date= param if present, else show today
  const [viewingDateStr, setViewingDateStr] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search).get("date");
      if (p && /^\d{4}-\d{2}-\d{2}$/.test(p)) return p;
    }
    return actualTodayStr;
  });

  const isViewingToday = viewingDateStr === actualTodayStr;

  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [completedIds, setCompletedIds] = useState<Set<number>>(new Set());
  const [skippedIds,   setSkippedIds]   = useState<Set<number>>(new Set());
  const [missedIds,    setMissedIds]    = useState<Set<number>>(new Set());
  const [expandedId,   setExpandedId]   = useState<number | null>(null);
  const [toasts,       setToasts]       = useState<ToastMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overloaded, setOverloaded] = useState(false);
  const [showStickyBar, setShowStickyBar] = useState(false);
  // FIX 4: reactive nowMins — updated by interval so NowLine and current-block highlight stay accurate
  const [nowMins, setNowMins] = useState(() => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); });
  const statsRef = useRef<HTMLDivElement>(null);
  // FIX 8: ref to scroll to NowLine on load
  const nowLineRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTodaySchedule(viewingDateStr);
      setBlocks(data);
      const completed = new Set<number>();
      const skipped   = new Set<number>();
      const missed    = new Set<number>();
      for (const b of data) {
        if (b.status === "complete") completed.add(b.id);
        else if (b.status === "skipped") { completed.add(b.id); skipped.add(b.id); }
        else if (b.status === "missed") missed.add(b.id);
      }
      setCompletedIds(completed);
      setSkippedIds(skipped);
      setMissedIds(missed);
      // FIX 7: restore overload banner from localStorage (set by setup wizard after generation)
      const monday = getWeekMondayStr(viewingDateStr);
      setOverloaded(localStorage.getItem(`sunday_overloaded_${monday}`) === "1");
    } catch (e) {
      console.error("[Sunday] Failed to load schedule:", e);
      setError(String(e));
    }
    finally { setLoading(false); }
  }, [viewingDateStr]);

  function navigate(direction: -1 | 1) {
    const d = new Date(viewingDateStr + "T12:00:00");
    d.setDate(d.getDate() + direction);
    const newDate = toLocalDateString(d);
    setViewingDateStr(newDate);
    window.history.pushState({}, "", newDate === actualTodayStr ? "/today" : `/today?date=${newDate}`);
  }

  function goToToday() {
    setViewingDateStr(actualTodayStr);
    window.history.pushState({}, "", "/today");
  }

  useEffect(() => { if (user) load(); }, [load, user]);

  useEffect(() => {
    const el = statsRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setShowStickyBar(!entry.isIntersecting),
      { threshold: 0, rootMargin: "-56px 0px 0px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loading]);

  useEffect(() => {
    if (!isViewingToday) return;
    const interval = setInterval(() => {
      const n = new Date();
      setNowMins(n.getHours() * 60 + n.getMinutes());
    }, 60000);
    return () => clearInterval(interval);
  }, [isViewingToday]);

  useEffect(() => {
    if (loading || !isViewingToday || blocks.length === 0) return;
    const t = setTimeout(() => {
      nowLineRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 200);
    return () => clearTimeout(t);
  }, [loading, isViewingToday, blocks.length]);

  function showToast(message: string, type: "success" | "error" = "success") {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }

  function toggleExpanded(blockId: number) {
    setExpandedId(prev => prev === blockId ? null : blockId);
  }

  async function handleAction(
    blockId: number,
    taskId: number | null,
    action: "done" | "skip" | "miss",
  ) {
    setExpandedId(null);

    if (taskId === null) {
      // Non-task block — persist status on the block, update local state
      const blockStatus = action === "done" ? "complete" : action === "miss" ? "missed" : "skipped";
      updateBlockStatus(blockId, blockStatus).catch(e =>
        console.error("[Sunday] Block status update failed:", e)
      );
      if (action === "done" || action === "skip") setCompletedIds(prev => new Set(prev).add(blockId));
      if (action === "skip") setSkippedIds(prev => new Set(prev).add(blockId));
      if (action === "miss") setMissedIds(prev => new Set(prev).add(blockId));
      return;
    }

    // Task block — persist status on block AND task
    if (action === "done") {
      updateBlockStatus(blockId, "complete").catch(e =>
        console.error("[Sunday] Block status update failed:", e)
      );
      await updateTaskStatus(taskId, "complete");
      setCompletedIds(prev => new Set(prev).add(blockId));
      const r = await reorganize("task_complete");
      setOverloaded(r.is_overloaded);
      if (r.tasks_rescheduled.length > 0) {
        const n = r.tasks_rescheduled.length;
        showToast(`Schedule updated — ${n} task${n !== 1 ? "s" : ""} adjusted`);
      } else {
        showToast("Marked complete ✓");
      }
    } else if (action === "skip") {
      updateBlockStatus(blockId, "skipped").catch(e =>
        console.error("[Sunday] Block status update failed:", e)
      );
      await updateTaskStatus(taskId, "cancelled");
      await load();
    } else if (action === "miss") {
      setMissedIds(prev => new Set(prev).add(blockId));
      updateBlockStatus(blockId, "missed").catch(e =>
        console.error("[Sunday] Block status update failed:", e)
      );
      await updateTaskStatus(taskId, "missed");
      try {
        const result = await reorganizeMissed(blockId);
        if (result.rescheduled && result.new_date && result.new_start_time) {
          showToast(
            `${result.task_title} rescheduled to ${rescheduleDay(result.new_date)} at ${fmt12(result.new_start_time)}`
          );
        } else {
          showToast(
            `${result.task_title ?? "Task"} couldn't be rescheduled — no slot found this week`,
            "error",
          );
        }
      } catch {
        showToast("Reschedule failed", "error");
      }
      await load();
    }
  }

  const taskBlocks = blocks.filter(b => b.block_type === "task");
  // FIX 2: only count truly completed tasks (not skipped) in the done stat
  const completedCount = taskBlocks.filter(b => completedIds.has(b.id) && !skippedIds.has(b.id)).length;
  const totalMins = blocks.reduce((s, b) => s + blockMins(b), 0);
  const hoursScheduled = Math.round(totalMins / 60 * 10) / 10;
  const completionRate = taskBlocks.length === 0 ? 0 : Math.round((completedCount / taskBlocks.length) * 100);
  const nextBlock = isViewingToday ? getNextBlock(blocks) : null;
  const weekNum = getWeekNumber(new Date(viewingDateStr + "T12:00:00"));

  const grouped = blocks.reduce<Record<TimeGroup, ScheduleBlock[]>>(
    (acc, b) => { acc[getGroup(b.start_time)].push(b); return acc; },
    { morning: [], afternoon: [], evening: [] }
  );

  // NOW indicator — only relevant when viewing today (nowMins is reactive state, see FIX 4)
  const nowIndicatorBeforeId = isViewingToday ? (() => {
    for (const b of blocks) {
      const [h, m] = b.start_time.split(":").map(Number);
      if (h * 60 + m > nowMins) return b.id;
    }
    return null;
  })() : null;

  function isCurrentBlock(b: ScheduleBlock): boolean {
    if (!isViewingToday) return false;
    const [sh, sm] = b.start_time.split(":").map(Number);
    const [eh, em] = b.end_time.split(":").map(Number);
    const startM = sh * 60 + sm;
    const endM = (eh === 0 && em === 0) ? 1440 : eh * 60 + em;
    return nowMins >= startM && nowMins < endM;
  }

  if (authLoading || !user) return (
    <div className="fixed inset-0 bg-zinc-950 flex items-center justify-center">
      <div className="w-10 h-10 rounded-full border-4 border-zinc-700 border-t-indigo-500 animate-spin" />
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-8 pb-20 page-fade">
      {/* Sticky mini summary bar */}
      {showStickyBar && blocks.length > 0 && (
        <div className="fixed top-14 left-0 right-0 z-40 bg-white/95 backdrop-blur-sm border-b border-zinc-100 shadow-sm">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 py-2 flex items-center gap-4 text-[12px]">
            <span className="font-semibold text-zinc-900">{completedCount}/{taskBlocks.length} done</span>
            <span className="text-zinc-200">|</span>
            <span className="text-zinc-500">{hoursScheduled}h scheduled</span>
            <span className="text-zinc-200">|</span>
            <span className={`font-semibold ${completionRate >= 80 ? "text-green-600" : completionRate >= 60 ? "text-amber-600" : "text-zinc-600"}`}>
              {completionRate}% complete
            </span>
            {nextBlock && (
              <>
                <span className="text-zinc-200">|</span>
                <span className="text-indigo-600 font-medium">Next: {nextBlock.block.title} in {nextBlock.minutesUntil}m</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-7">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">
              {getDayLabel(viewingDateStr, actualTodayStr)}
            </p>
            <span className="bg-zinc-100 text-zinc-500 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
              Week {weekNum}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {!isViewingToday && (
              <button
                onClick={goToToday}
                className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-full px-3 py-1 hover:bg-indigo-100 transition-colors"
              >
                Back to today
              </button>
            )}
            <button
              onClick={() => navigate(-1)}
              className="w-11 h-11 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors text-[16px]"
            >
              ←
            </button>
            <button
              onClick={() => navigate(1)}
              className="w-11 h-11 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors text-[16px]"
            >
              →
            </button>
          </div>
        </div>
        <h1 className="text-[28px] sm:text-[32px] font-semibold text-zinc-900 leading-tight mb-0.5">
          {formatDateLong(new Date(viewingDateStr + "T12:00:00"))}
        </h1>
        <p className="text-[14px] text-zinc-400">{formatWeekRange(new Date(viewingDateStr + "T12:00:00"))}</p>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-[13px] text-red-700 mb-5 flex items-center gap-2">
          <span>⚠</span> {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-7">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="skeleton h-20 rounded-xl" />
            ))}
          </div>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="skeleton h-16 rounded-xl" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && blocks.length === 0 && (
        <div className="py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-zinc-100 flex items-center justify-center text-3xl mx-auto mb-5">📅</div>
          <p className="text-[17px] font-semibold text-zinc-900 mb-2">No schedule for {getDayLabel(viewingDateStr, actualTodayStr).toLowerCase()}</p>
          <p className="text-[14px] text-zinc-400 mb-7">Run your Sunday setup to generate this week.</p>
          <a href="/setup" className="inline-flex items-center gap-2 bg-indigo-600 text-white text-[14px] font-semibold px-5 py-2.5 rounded-xl hover:bg-indigo-700 transition-colors">
            Run Sunday setup →
          </a>
        </div>
      )}

      {!loading && !error && blocks.length > 0 && (
        <>
          {/* Stats strip */}
          <div ref={statsRef} className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-7">
            {/* Blocks done */}
            <div className="bg-white border border-zinc-200 rounded-xl px-4 py-3.5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Done</p>
                <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center">
                  <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                </div>
              </div>
              <p className="text-3xl font-bold text-zinc-900 leading-none">
                {completedCount}<span className="text-base text-zinc-400 font-normal">/{taskBlocks.length}</span>
              </p>
            </div>
            {/* Scheduled */}
            <div className="bg-white border border-zinc-200 rounded-xl px-4 py-3.5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Hours</p>
                <div className="w-7 h-7 rounded-lg bg-green-50 flex items-center justify-center">
                  <Clock className="w-3.5 h-3.5 text-green-600" />
                </div>
              </div>
              <p className="text-3xl font-bold text-zinc-900 leading-none">
                {hoursScheduled}<span className="text-base text-zinc-400 font-normal">h</span>
              </p>
            </div>
            {/* Completion */}
            <div className="bg-white border border-zinc-200 rounded-xl px-4 py-3.5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Rate</p>
                <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center">
                  <TrendingUp className="w-3.5 h-3.5 text-amber-600" />
                </div>
              </div>
              <p className={`text-3xl font-bold leading-none ${completionRate >= 80 ? "text-green-600" : completionRate >= 60 ? "text-amber-600" : "text-zinc-900"}`}>
                {completionRate}<span className="text-base text-zinc-400 font-normal">%</span>
              </p>
            </div>
            {/* Next up */}
            <div className="bg-white border border-zinc-200 rounded-xl px-4 py-3.5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Next</p>
                <div className="w-7 h-7 rounded-lg bg-purple-50 flex items-center justify-center">
                  <Zap className="w-3.5 h-3.5 text-purple-600" />
                </div>
              </div>
              {nextBlock ? (
                <div>
                  <p className="text-[13px] font-bold text-zinc-900 leading-tight truncate">
                    {nextBlock.block.title.length > 14 ? nextBlock.block.title.slice(0, 14) + "…" : nextBlock.block.title}
                  </p>
                  <p className="text-[11px] text-indigo-500 font-semibold">in {nextBlock.minutesUntil}m · {fmt12(nextBlock.block.start_time)}</p>
                </div>
              ) : (
                <p className="text-[13px] font-semibold text-green-600">All done ✓</p>
              )}
            </div>
          </div>

          {overloaded && (
            <div className="mb-5 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-[13px] font-medium text-amber-700 flex items-center gap-2">
              <span>⚠</span>
              <span>Schedule overloaded — some tasks didn&apos;t fit this week.</span>
            </div>
          )}

          {/* Time groups */}
          <div className="space-y-8">
            {(["morning", "afternoon", "evening"] as TimeGroup[]).map((key) => {
              const groupBlocks = grouped[key];
              if (groupBlocks.length === 0) return null;
              const { label, range, Icon, iconClass } = GROUP_META[key];
              const doneInGroup = groupBlocks.filter(b => completedIds.has(b.id)).length;
              const groupPct = doneInGroup / groupBlocks.length;

              return (
                <div key={key}>
                  {/* Sticky section header */}
                  <div className="sticky top-14 z-10 bg-white/95 backdrop-blur-sm -mx-1 px-1 mb-3">
                    <div className="flex items-center gap-2 py-2 border-b border-zinc-100">
                      <Icon className={`w-3.5 h-3.5 ${iconClass}`} />
                      <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{label}</h2>
                      <span className="text-[11px] text-zinc-300">·</span>
                      <span className="text-[11px] text-zinc-400">{range}</span>
                      <span className="ml-auto text-[11px] font-semibold text-zinc-400 bg-zinc-100 rounded-full px-2 py-0.5">
                        {groupBlocks.length} block{groupBlocks.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {doneInGroup > 0 && (
                      <div className="h-0.5 bg-zinc-100 rounded-full overflow-hidden mt-0.5">
                        <div
                          className="h-full bg-green-400 rounded-full transition-all duration-500"
                          style={{ width: `${groupPct * 100}%` }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Block list with NOW line + gap indicators */}
                  <div className="space-y-2">
                    {groupBlocks.map((block, i) => {
                      const prev = groupBlocks[i - 1];
                      const gap = prev ? gapMins(prev, block) : 0;
                      const showNow = block.id === nowIndicatorBeforeId;
                      return (
                        <Fragment key={block.id}>
                          {showNow && <div ref={nowLineRef}><NowLine /></div>}
                          {!showNow && gap > 15 && (
                            <div className="flex items-center gap-2 py-0.5">
                              <div className="flex-1 h-px bg-zinc-100" />
                              <span className="text-[10px] text-zinc-300 font-medium">{gap} min gap</span>
                              <div className="flex-1 h-px bg-zinc-100" />
                            </div>
                          )}
                          <BlockCard
                            block={block}
                            isExpanded={expandedId === block.id}
                            onToggle={() => toggleExpanded(block.id)}
                            onAction={handleAction}
                            completed={completedIds.has(block.id)}
                            missed={missedIds.has(block.id)}
                            isCurrent={isCurrentBlock(block)}
                            rescheduled={block.is_rescheduled === true}
                          />
                        </Fragment>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Toast notifications */}
      {toasts.length > 0 && (
        <div className="fixed bottom-6 right-4 sm:right-6 z-50 flex flex-col gap-2 max-w-xs w-full pointer-events-none">
          {toasts.map(toast => (
            <div
              key={toast.id}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl text-white text-[13px] font-medium pointer-events-auto ${
                toast.type === "success" ? "bg-indigo-600" : "bg-red-600"
              }`}
            >
              <span className="flex-1 leading-snug">{toast.message}</span>
              <button
                onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                className="shrink-0 text-white/70 hover:text-white text-[11px] font-semibold border border-white/30 rounded px-2 py-0.5"
              >
                Dismiss
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
