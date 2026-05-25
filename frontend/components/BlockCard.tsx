"use client";

import { useState } from "react";
import { ScheduleBlock } from "@/lib/api";

const BLOCK_LABELS: Record<string, string> = {
  sleep:     "Sleep",
  meal:      "Meal",
  commute:   "Commute",
  gym:       "Gym",
  muay_thai: "Muay Thai",
  routine:   "Routine",
  task:      "Task",
  buffer:    "Buffer",
};

function getLeftBorderColor(block: ScheduleBlock): string {
  switch (block.block_type) {
    case "sleep":     return "#7c3aed";
    case "meal":      return "#ea580c";
    case "commute":   return "#2563eb";
    case "gym":
    case "muay_thai": return "#16a34a";
    case "routine":   return "#525252";
    case "buffer":    return "#525252";
    case "task": {
      switch (block.priority) {
        case "critical": return "#dc2626";
        case "high":     return "#d97706";
        case "medium":   return "#6366f1";
        case "low":
        case "optional": return "#525252";
        default:         return "#6366f1";
      }
    }
    default: return "#525252";
  }
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
      className="flex items-center gap-3 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] border-l-[3px] px-4 hover:bg-[#1e1e1e] transition-colors"
      style={{
        borderLeftColor: getLeftBorderColor(block),
        paddingTop: "14px",
        paddingBottom: "14px",
      }}
    >
      {/* Time range */}
      <div className="w-[112px] shrink-0 text-[12px] font-mono text-[#555555] tabular-nums">
        {block.start_time} – {block.end_time}
      </div>

      {/* Title */}
      <div className="flex-1 min-w-0">
        <span className="text-[14px] font-medium text-[#f0f0f0] truncate block">
          {block.title}
        </span>
      </div>

      {/* Type badge */}
      <span className="shrink-0 text-[11px] text-[#888888] bg-[#2a2a2a] px-2 py-0.5 rounded">
        {label}
      </span>

      {/* Task action buttons */}
      {isTask && (
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => handle("complete")}
            disabled={loading !== null}
            className="h-7 px-2.5 rounded-md text-[12px] font-medium bg-[#166534] text-[#dcfce7] hover:bg-[#15803d] disabled:opacity-40 transition-colors"
          >
            {loading === "complete" ? "…" : "Done"}
          </button>
          <button
            onClick={() => handle("miss")}
            disabled={loading !== null}
            className="h-7 px-2.5 rounded-md text-[12px] font-medium bg-[#7f1d1d] text-[#fee2e2] hover:bg-[#991b1b] disabled:opacity-40 transition-colors"
          >
            {loading === "miss" ? "…" : "Miss"}
          </button>
        </div>
      )}
    </div>
  );
}
