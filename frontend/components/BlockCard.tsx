"use client";

import { useState } from "react";
import { ScheduleBlock } from "@/lib/api";

const BLOCK_LABELS: Record<string, string> = {
  sleep: "Sleep", meal: "Meal", commute: "Commute",
  gym: "Gym", muay_thai: "Muay Thai", routine: "Routine",
  task: "Task", buffer: "Buffer", event: "Event",
};

function getAccentColor(block: ScheduleBlock): string {
  switch (block.block_type) {
    case "sleep":     return "#7c3aed";
    case "meal":      return "#ea580c";
    case "commute":   return "#2563eb";
    case "gym":
    case "muay_thai": return "#16a34a";
    case "event":     return "#0891b2";
    case "routine":
    case "buffer":    return "#d4d4d8";
    case "task": {
      switch (block.priority) {
        case "critical": return "#dc2626";
        case "high":     return "#d97706";
        case "medium":   return "#4f46e5";
        case "low":
        case "optional": return "#d4d4d8";
        default:         return "#4f46e5";
      }
    }
    default: return "#d4d4d8";
  }
}

function getBadge(block: ScheduleBlock): { bg: string; color: string } {
  switch (block.block_type) {
    case "sleep":     return { bg: "#f5f3ff", color: "#6d28d9" };
    case "meal":      return { bg: "#fff7ed", color: "#c2410c" };
    case "commute":   return { bg: "#eff6ff", color: "#1d4ed8" };
    case "gym":
    case "muay_thai": return { bg: "#f0fdf4", color: "#15803d" };
    case "event":     return { bg: "#ecfeff", color: "#0e7490" };
    case "routine":
    case "buffer":    return { bg: "#fafafa", color: "#71717a" };
    case "task": {
      switch (block.priority) {
        case "critical": return { bg: "#fef2f2", color: "#b91c1c" };
        case "high":     return { bg: "#fffbeb", color: "#b45309" };
        case "medium":   return { bg: "#eef2ff", color: "#4338ca" };
        default:         return { bg: "#fafafa", color: "#a1a1aa" };
      }
    }
    default: return { bg: "#fafafa", color: "#71717a" };
  }
}

function durationLabel(b: ScheduleBlock): string {
  const [sh, sm] = b.start_time.split(":").map(Number);
  const [eh, em] = b.end_time.split(":").map(Number);
  const mins = eh * 60 + em - (sh * 60 + sm);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

interface Props {
  block: ScheduleBlock;
  onComplete?: (blockId: number, taskId: number) => Promise<void>;
  onMiss?: (blockId: number, taskId: number) => Promise<void>;
}

export default function BlockCard({ block, onComplete, onMiss }: Props) {
  const [loading, setLoading] = useState<"complete" | "miss" | null>(null);
  const label = BLOCK_LABELS[block.block_type] ?? block.block_type;
  const isTask = block.block_type === "task" && block.task_id != null;
  const { bg: badgeBg, color: badgeColor } = getBadge(block);

  async function handle(type: "complete" | "miss") {
    if (!block.task_id) return;
    setLoading(type);
    try {
      if (type === "complete") await onComplete?.(block.id, block.task_id);
      else await onMiss?.(block.id, block.task_id);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div
      className="flex items-center gap-3 sm:gap-4 bg-white rounded-xl border border-zinc-200 border-l-[3px] px-3 sm:px-4 py-3 hover:shadow-sm transition-all"
      style={{ borderLeftColor: getAccentColor(block) }}
    >
      <div className="w-[96px] sm:w-[108px] shrink-0 text-[11px] sm:text-[12px] font-mono text-zinc-400 tabular-nums leading-tight">
        {block.start_time}<br className="sm:hidden" />
        <span className="hidden sm:inline"> – </span>
        <span className="sm:hidden">–</span>
        {block.end_time}
      </div>

      <div className="flex-1 min-w-0">
        <span className="text-[13px] sm:text-[14px] font-medium text-zinc-900 truncate block">
          {block.title}
        </span>
        <span className="text-[11px] text-zinc-400">{durationLabel(block)}</span>
      </div>

      <span
        className="hidden sm:inline shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-md"
        style={{ background: badgeBg, color: badgeColor }}
      >
        {label}
      </span>

      {isTask && (
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <button
            onClick={() => handle("complete")}
            disabled={loading !== null}
            className="h-7 px-2 sm:px-3 rounded-lg text-[11px] sm:text-[12px] font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 transition-colors border border-emerald-200"
          >
            {loading === "complete" ? "…" : "Done"}
          </button>
          <button
            onClick={() => handle("miss")}
            disabled={loading !== null}
            className="h-7 px-2 sm:px-3 rounded-lg text-[11px] sm:text-[12px] font-semibold bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-40 transition-colors border border-red-200"
          >
            {loading === "miss" ? "…" : "Miss"}
          </button>
        </div>
      )}
    </div>
  );
}
