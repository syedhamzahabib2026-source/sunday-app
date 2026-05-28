"use client";

import { useCallback, useEffect, useState } from "react";
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
  return `Week of ${monday.toLocaleDateString("en-US", opts)} – ${sunday.toLocaleDateString("en-US", opts)}`;
}

function blockMins(b: ScheduleBlock): number {
  const [sh, sm] = b.start_time.split(":").map(Number);
  const [eh, em] = b.end_time.split(":").map(Number);
  return eh * 60 + em - (sh * 60 + sm);
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
    const start = h * 60 + m;
    if (start > cur) return { block: b, minutesUntil: start - cur };
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

const GROUPS: { key: TimeGroup; label: string; range: string }[] = [
  { key: "morning",   label: "Morning",   range: "before noon" },
  { key: "afternoon", label: "Afternoon", range: "12 – 5 PM" },
  { key: "evening",   label: "Evening",   range: "after 5 PM" },
];

export default function TodayPage() {
  const [todayStr] = useState(() => toLocalDateString(new Date()));
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [completedIds, setCompletedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overloaded, setOverloaded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBlocks(await getTodaySchedule(USER_ID, todayStr));
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, [todayStr]);

  useEffect(() => { load(); }, [load]);

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

  const grouped = blocks.reduce<Record<TimeGroup, ScheduleBlock[]>>(
    (acc, b) => { acc[getGroup(b.start_time)].push(b); return acc; },
    { morning: [], afternoon: [], evening: [] }
  );

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-8 pb-20">
      {/* Header */}
      <div className="mb-7">
        <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Today</p>
        <h1 className="text-[28px] sm:text-[32px] font-semibold text-zinc-900 leading-tight mb-0.5">
          {formatDateLong(new Date(todayStr + "T12:00:00"))}
        </h1>
        <p className="text-[14px] text-zinc-400">{formatWeekRange(new Date(todayStr + "T12:00:00"))}</p>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-[13px] text-red-700 mb-5">{error}</div>
      )}

      {loading && (
        <div className="flex items-center gap-3 py-20 text-zinc-400">
          <div className="w-4 h-4 border-2 border-zinc-200 border-t-indigo-600 rounded-full animate-spin" />
          <span className="text-[14px]">Loading your schedule...</span>
        </div>
      )}

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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-7">
            <div className="bg-white border border-zinc-200 rounded-xl px-4 py-3 shadow-sm">
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Blocks done</p>
              <p className="text-[22px] font-semibold text-zinc-900">{completedCount}<span className="text-[14px] text-zinc-400 font-normal"> / {taskBlocks.length}</span></p>
            </div>
            <div className="bg-white border border-zinc-200 rounded-xl px-4 py-3 shadow-sm">
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Scheduled</p>
              <p className="text-[22px] font-semibold text-zinc-900">{hoursScheduled}<span className="text-[12px] text-zinc-400 font-normal">h</span></p>
            </div>
            <div className="bg-white border border-zinc-200 rounded-xl px-4 py-3 shadow-sm">
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Completion</p>
              <p className={`text-[22px] font-semibold ${completionRate >= 80 ? "text-green-600" : completionRate >= 60 ? "text-amber-600" : "text-zinc-900"}`}>
                {completionRate}<span className="text-[12px] text-zinc-400 font-normal">%</span>
              </p>
            </div>
            <div className="bg-white border border-zinc-200 rounded-xl px-4 py-3 shadow-sm">
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Next up</p>
              {nextBlock ? (
                <p className="text-[13px] font-semibold text-zinc-900 leading-tight">
                  {nextBlock.block.title.length > 12 ? nextBlock.block.title.slice(0, 12) + "…" : nextBlock.block.title}
                  <span className="block text-[11px] text-zinc-400 font-normal">in {nextBlock.minutesUntil}m · {fmt12(nextBlock.block.start_time)}</span>
                </p>
              ) : (
                <p className="text-[13px] text-zinc-400">All done</p>
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
          <div className="space-y-7">
            {GROUPS.map(({ key, label, range }) => {
              const groupBlocks = grouped[key];
              if (groupBlocks.length === 0) return null;
              return (
                <div key={key}>
                  <div className="flex items-baseline gap-2 mb-3">
                    <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{label}</h2>
                    <span className="text-[11px] text-zinc-300">{range}</span>
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
