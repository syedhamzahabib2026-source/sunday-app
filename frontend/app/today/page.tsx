"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock, TrendingUp, Zap, Sun, Moon } from "lucide-react";
import BlockCard from "@/components/BlockCard";
import { getTodaySchedule, updateTaskStatus, reorganize, ScheduleBlock } from "@/lib/api";

const USER_ID = 1;

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

function blockMins(b: ScheduleBlock): number {
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

const GROUP_META: Record<TimeGroup, { label: string; range: string; Icon: React.ComponentType<{ className?: string }>; iconClass: string }> = {
  morning:   { label: "Morning",   range: "before noon",  Icon: Sun,  iconClass: "text-amber-500" },
  afternoon: { label: "Afternoon", range: "12 – 5 PM",    Icon: Sun,  iconClass: "text-orange-400" },
  evening:   { label: "Evening",   range: "after 5 PM",   Icon: Moon, iconClass: "text-indigo-500" },
};

export default function TodayPage() {
  const [todayStr] = useState(() => toLocalDateString(new Date()));
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [completedIds, setCompletedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overloaded, setOverloaded] = useState(false);
  const [showStickyBar, setShowStickyBar] = useState(false);
  const statsRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBlocks(await getTodaySchedule(USER_ID, todayStr));
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, [todayStr]);

  useEffect(() => { load(); }, [load]);

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

  async function handleComplete(blockId: number, taskId: number) {
    await updateTaskStatus(taskId, "complete");
    setCompletedIds(prev => new Set(prev).add(blockId));
    const r = await reorganize(USER_ID, "task_complete");
    setOverloaded(r.is_overloaded);
  }

  async function handleMiss(_blockId: number, taskId: number) {
    await updateTaskStatus(taskId, "missed");
    const r = await reorganize(USER_ID, "task_missed");
    setOverloaded(r.is_overloaded);
    await load();
  }

  async function handleSkip(_blockId: number, taskId: number) {
    await updateTaskStatus(taskId, "cancelled");
    await load();
  }

  const taskBlocks = blocks.filter(b => b.block_type === "task");
  const completedCount = completedIds.size;
  const totalMins = blocks.reduce((s, b) => s + blockMins(b), 0);
  const hoursScheduled = Math.round(totalMins / 60 * 10) / 10;
  const completionRate = taskBlocks.length === 0 ? 0 : Math.round((completedCount / taskBlocks.length) * 100);
  const nextBlock = getNextBlock(blocks);
  const weekNum = getWeekNumber(new Date(todayStr + "T12:00:00"));

  const grouped = blocks.reduce<Record<TimeGroup, ScheduleBlock[]>>(
    (acc, b) => { acc[getGroup(b.start_time)].push(b); return acc; },
    { morning: [], afternoon: [], evening: [] }
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
        <div className="flex items-center gap-2 mb-1.5">
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Today</p>
          <span className="bg-zinc-100 text-zinc-500 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
            Week {weekNum}
          </span>
        </div>
        <h1 className="text-[28px] sm:text-[32px] font-semibold text-zinc-900 leading-tight mb-0.5">
          {formatDateLong(new Date(todayStr + "T12:00:00"))}
        </h1>
        <p className="text-[14px] text-zinc-400">{formatWeekRange(new Date(todayStr + "T12:00:00"))}</p>
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
          <p className="text-[17px] font-semibold text-zinc-900 mb-2">No schedule for today</p>
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
              return (
                <div key={key}>
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-zinc-100">
                    <Icon className={`w-3.5 h-3.5 ${iconClass}`} />
                    <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{label}</h2>
                    <span className="text-[11px] text-zinc-300">·</span>
                    <span className="text-[11px] text-zinc-400">{range}</span>
                    <span className="ml-auto text-[11px] font-semibold text-zinc-400 bg-zinc-100 rounded-full px-2 py-0.5">
                      {groupBlocks.length} block{groupBlocks.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {groupBlocks.map((block) => (
                      <BlockCard
                        key={block.id}
                        block={block}
                        onComplete={handleComplete}
                        onMiss={handleMiss}
                        onSkip={handleSkip}
                        completed={completedIds.has(block.id)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
