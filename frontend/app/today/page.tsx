"use client";

import { useCallback, useEffect, useState } from "react";
import BlockCard from "@/components/BlockCard";
import { getTodaySchedule, updateTaskStatus, reorganize, ScheduleBlock } from "@/lib/api";

const USER_ID = 1;

function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function blockDurationMin(b: ScheduleBlock): number {
  const [sh, sm] = b.start_time.split(":").map(Number);
  const [eh, em] = b.end_time.split(":").map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

function totalHoursScheduled(blocks: ScheduleBlock[]): number {
  return Math.round(blocks.reduce((s, b) => s + blockDurationMin(b), 0) / 60 * 10) / 10;
}

function calcConfidence(blocks: ScheduleBlock[]): number {
  const totalMin = blocks.reduce((s, b) => s + blockDurationMin(b), 0);
  return Math.min(Math.round((totalMin / (16 * 60)) * 100), 100);
}

type TimeGroup = "morning" | "afternoon" | "evening";

function getTimeGroup(startTime: string): TimeGroup {
  const [h] = startTime.split(":").map(Number);
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

const TIME_GROUPS: { key: TimeGroup; label: string; sublabel: string }[] = [
  { key: "morning",   label: "Morning",   sublabel: "before noon" },
  { key: "afternoon", label: "Afternoon", sublabel: "12–5 PM" },
  { key: "evening",   label: "Evening",   sublabel: "after 5 PM" },
];

export default function TodayPage() {
  const [todayStr] = useState(() => toLocalDateString(new Date()));
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overloaded, setOverloaded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBlocks(await getTodaySchedule(USER_ID, todayStr));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [todayStr]);

  useEffect(() => { load(); }, [load]);

  async function handleComplete(_blockId: number, taskId: number) {
    await updateTaskStatus(taskId, "complete");
    const r = await reorganize(USER_ID, "task_complete");
    setOverloaded(r.is_overloaded);
    await load();
  }

  async function handleMiss(_blockId: number, taskId: number) {
    await updateTaskStatus(taskId, "missed");
    const r = await reorganize(USER_ID, "task_missed");
    setOverloaded(r.is_overloaded);
    await load();
  }

  const confidence = calcConfidence(blocks);
  const hoursScheduled = totalHoursScheduled(blocks);
  const taskBlocks = blocks.filter((b) => b.block_type === "task");

  const grouped = blocks.reduce<Record<TimeGroup, ScheduleBlock[]>>(
    (acc, b) => {
      acc[getTimeGroup(b.start_time)].push(b);
      return acc;
    },
    { morning: [], afternoon: [], evening: [] }
  );

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-8 sm:pt-10 pb-16 sm:pb-20">
      {/* Header */}
      <div className="mb-7">
        <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Today</p>
        <h1 className="text-[26px] sm:text-[30px] font-semibold text-zinc-900 leading-tight">
          {formatDate(new Date(todayStr + "T12:00:00"))}
        </h1>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-[13px] text-red-700 mb-5">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-3 py-20 text-zinc-400">
          <div className="w-4 h-4 border-2 border-zinc-200 border-t-indigo-600 rounded-full animate-spin" />
          <span className="text-[14px]">Loading your schedule...</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && blocks.length === 0 && (
        <div className="py-24 text-center">
          <div className="text-[44px] mb-5">📅</div>
          <p className="text-[17px] font-semibold text-zinc-900 mb-2">No schedule for today</p>
          <p className="text-[14px] text-zinc-400 mb-7 leading-relaxed">
            Set up your preferences to generate your first week.
          </p>
          <a
            href="/setup"
            className="inline-flex items-center gap-2 bg-indigo-600 text-white text-[14px] font-semibold px-5 py-2.5 rounded-xl hover:bg-indigo-700 transition-colors"
          >
            Set up Sunday →
          </a>
        </div>
      )}

      {/* Stats strip */}
      {!loading && !error && blocks.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3 mb-7">
            <div className="bg-white rounded-xl border border-zinc-200 px-4 py-3 shadow-sm">
              <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wide mb-1">Tasks</p>
              <p className="text-[22px] font-semibold text-zinc-900">{taskBlocks.length}</p>
            </div>
            <div className="bg-white rounded-xl border border-zinc-200 px-4 py-3 shadow-sm">
              <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wide mb-1">Scheduled</p>
              <p className="text-[22px] font-semibold text-zinc-900">{hoursScheduled}h</p>
            </div>
            <div className="bg-white rounded-xl border border-zinc-200 px-4 py-3 shadow-sm">
              <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wide mb-1">Coverage</p>
              <p className="text-[22px] font-semibold text-indigo-600">{confidence}%</p>
            </div>
          </div>

          {/* Overload banner */}
          {overloaded && (
            <div className="mb-5 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-[13px] font-medium text-amber-700 flex items-center gap-2">
              <span>⚠</span>
              <span>Schedule is overloaded — some tasks didn&apos;t fit this week.</span>
            </div>
          )}

          {/* Time-of-day groups */}
          <div className="space-y-7">
            {TIME_GROUPS.map(({ key, label, sublabel }) => {
              const groupBlocks = grouped[key];
              if (groupBlocks.length === 0) return null;
              return (
                <div key={key}>
                  <div className="flex items-baseline gap-2 mb-3">
                    <h2 className="text-[13px] font-bold text-zinc-900 uppercase tracking-wide">{label}</h2>
                    <span className="text-[11px] text-zinc-400">{sublabel}</span>
                  </div>
                  <div className="space-y-2">
                    {groupBlocks.map((block) => (
                      <BlockCard
                        key={block.id}
                        block={block}
                        onComplete={handleComplete}
                        onMiss={handleMiss}
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
