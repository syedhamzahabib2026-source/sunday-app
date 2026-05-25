"use client";

import { useCallback, useEffect, useState } from "react";
import BlockCard from "@/components/BlockCard";
import {
  getTodaySchedule,
  updateTaskStatus,
  reorganize,
  ScheduleBlock,
} from "@/lib/api";

const USER_ID = 1;

function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function blockDurationMin(b: ScheduleBlock): number {
  const [sh, sm] = b.start_time.split(":").map(Number);
  const [eh, em] = b.end_time.split(":").map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

function calcConfidence(blocks: ScheduleBlock[]): number {
  const totalMin = blocks.reduce((s, b) => s + blockDurationMin(b), 0);
  return Math.min(Math.round((totalMin / (16 * 60)) * 100), 100);
}

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
      const data = await getTodaySchedule(USER_ID, todayStr);
      setBlocks(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [todayStr]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleComplete(_blockId: number, taskId: number) {
    await updateTaskStatus(taskId, "complete");
    const result = await reorganize(USER_ID, "task_complete");
    setOverloaded(result.is_overloaded);
    await load();
  }

  async function handleMiss(_blockId: number, taskId: number) {
    await updateTaskStatus(taskId, "missed");
    const result = await reorganize(USER_ID, "task_missed");
    setOverloaded(result.is_overloaded);
    await load();
  }

  const confidence = calcConfidence(blocks);

  return (
    <div className="max-w-[680px] pt-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[24px] font-medium text-[#f0f0f0]">
          {formatDate(new Date(todayStr + "T12:00:00"))}
        </h1>
        {!loading && !error && (
          <span className="text-[12px] text-[#555555] bg-[#1a1a1a] border border-[#2a2a2a] px-2.5 py-1 rounded">
            {confidence}% scheduled
          </span>
        )}
      </div>

      {/* Overload banner */}
      {overloaded && (
        <div className="mb-4 rounded-lg bg-[#7f1d1d] px-4 py-3 text-[13px] text-[#fca5a5] flex items-center gap-2">
          <span>Schedule overloaded — some tasks didn&apos;t fit</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] px-4 py-3 text-[13px] text-[#f87171]">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 py-16 text-[#555555]">
          <div className="w-3.5 h-3.5 border-2 border-[#2a2a2a] border-t-[#555555] rounded-full animate-spin" />
          <span className="text-[13px]">Loading schedule...</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && blocks.length === 0 && (
        <div className="py-20 text-center">
          <p className="text-[14px] text-[#555555]">
            No schedule yet.{" "}
            <a
              href="/setup"
              className="text-[#6366f1] hover:text-[#818cf8] transition-colors"
            >
              Go to Setup
            </a>{" "}
            to build your week.
          </p>
        </div>
      )}

      {/* Block list */}
      {!loading && !error && blocks.length > 0 && (
        <div className="space-y-4">
          {blocks.map((block) => (
            <BlockCard
              key={block.id}
              block={block}
              onComplete={handleComplete}
              onMiss={handleMiss}
            />
          ))}
        </div>
      )}
    </div>
  );
}
