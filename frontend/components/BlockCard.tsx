"use client";

import { useState } from "react";
import { ScheduleBlock } from "@/lib/api";

const BLOCK_LABELS: Record<string, string> = {
  sleep: "Sleep", meal: "Meal", commute: "Commute",
  gym: "Gym", muay_thai: "Muay Thai", routine: "Routine",
  task: "Task", buffer: "Buffer", event: "Event",
};

function getAccent(block: ScheduleBlock): string {
  switch (block.block_type) {
    case "sleep":     return "#6366f1";
    case "meal":      return "#16a34a";
    case "gym":
    case "muay_thai": return "#ea580c";
    case "commute":   return "#7c3aed";
    case "event":     return "#0891b2";
    case "routine":
    case "buffer":    return "#a1a1aa";
    case "task": {
      switch (block.priority) {
        case "critical": return "#dc2626";
        case "high":     return "#d97706";
        case "medium":   return "#4f46e5";
        default:         return "#a1a1aa";
      }
    }
    default: return "#a1a1aa";
  }
}

function PriorityBadge({ priority }: { priority: string | null }) {
  if (!priority || priority === "low" || priority === "optional") return null;
  const cls: Record<string, string> = {
    critical: "bg-red-50 text-red-700 border border-red-200",
    high:     "bg-orange-50 text-orange-700 border border-orange-200",
    medium:   "bg-yellow-50 text-yellow-700 border border-yellow-200",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls[priority] ?? ""}`}>
      {priority}
    </span>
  );
}

function durationMins(b: ScheduleBlock): number {
  const [sh, sm] = b.start_time.split(":").map(Number);
  const [eh, em] = b.end_time.split(":").map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

function fmtDuration(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function fmt12(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

interface Props {
  block: ScheduleBlock;
  onComplete?: (blockId: number, taskId: number) => Promise<void>;
  onMiss?: (blockId: number, taskId: number) => Promise<void>;
  onSkip?: (blockId: number, taskId: number) => Promise<void>;
  completed?: boolean;
}

export default function BlockCard({ block, onComplete, onMiss, onSkip, completed }: Props) {
  const [loading, setLoading] = useState<"complete" | "miss" | "skip" | null>(null);
  const isTask = block.block_type === "task" && block.task_id != null;
  const mins = durationMins(block);

  async function handle(type: "complete" | "miss" | "skip") {
    if (!block.task_id) return;
    setLoading(type);
    try {
      if (type === "complete") await onComplete?.(block.id, block.task_id);
      else if (type === "miss") await onMiss?.(block.id, block.task_id);
      else await onSkip?.(block.id, block.task_id);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div
      className={`flex items-start gap-3 bg-white rounded-xl border border-zinc-200 border-l-[3px] px-4 py-3 transition-all ${
        completed ? "opacity-50" : "hover:shadow-sm"
      }`}
      style={{ borderLeftColor: getAccent(block) }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <span className={`text-[14px] font-medium text-zinc-900 truncate ${completed ? "line-through text-zinc-400" : ""}`}>
            {block.title}
          </span>
          {isTask && <PriorityBadge priority={block.priority} />}
          {completed && (
            <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold bg-green-50 text-green-700 border border-green-200">
              Done
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[12px] text-zinc-400">
          <span>{fmt12(block.start_time)} – {fmt12(block.end_time)}</span>
          <span>·</span>
          <span>{fmtDuration(mins)}</span>
          {!isTask && (
            <>
              <span>·</span>
              <span className="capitalize">{BLOCK_LABELS[block.block_type] ?? block.block_type}</span>
            </>
          )}
        </div>
      </div>

      {isTask && !completed && (
        <div className="flex items-center gap-1 shrink-0 mt-0.5">
          <button
            onClick={() => handle("complete")}
            disabled={loading !== null}
            className="h-7 px-2.5 rounded-md text-[11px] font-semibold text-green-700 bg-green-50 hover:bg-green-100 disabled:opacity-40 transition-colors border border-green-200"
          >
            {loading === "complete" ? "…" : "✓"}
          </button>
          <button
            onClick={() => handle("skip")}
            disabled={loading !== null}
            className="h-7 px-2.5 rounded-md text-[11px] font-semibold text-zinc-500 bg-zinc-50 hover:bg-zinc-100 disabled:opacity-40 transition-colors border border-zinc-200"
          >
            {loading === "skip" ? "…" : "⟳"}
          </button>
          <button
            onClick={() => handle("miss")}
            disabled={loading !== null}
            className="h-7 px-2.5 rounded-md text-[11px] font-semibold text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-40 transition-colors border border-red-200"
          >
            {loading === "miss" ? "…" : "✗"}
          </button>
        </div>
      )}
    </div>
  );
}
