"use client";

import { useEffect, useState } from "react";
import DayColumn from "@/components/DayColumn";
import { getWeekSchedule, ScheduleBlock } from "@/lib/api";

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

  const todayStr = toLocalDateString(new Date());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getWeekSchedule(USER_ID, toLocalDateString(weekStart))
      .then((data) => {
        if (!cancelled) {
          setBlocks(data);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(String(e));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [weekStart]);

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
    </div>
  );
}
