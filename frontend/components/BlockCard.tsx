"use client";

import { useState } from "react";
import {
  Moon, Utensils, Dumbbell, Car, Sunrise,
  Briefcase, Flame, CheckCircle2,
} from "lucide-react";
import { ScheduleBlock } from "@/lib/api";

// ── Block type config ─────────────────────────────────────────────────────────

interface TypeConfig {
  color: string;
  label: string;
  Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
}

const TYPE_CONFIG: Record<string, TypeConfig> = {
  sleep:     { color: "#6366f1", label: "Sleep",     Icon: Moon      },
  meal:      { color: "#16a34a", label: "Meal",      Icon: Utensils  },
  gym:       { color: "#ea580c", label: "Gym",       Icon: Dumbbell  },
  muay_thai: { color: "#dc2626", label: "Muay Thai", Icon: Flame     },
  commute:   { color: "#7c3aed", label: "Commute",   Icon: Car       },
  routine:   { color: "#71717a", label: "Routine",   Icon: Sunrise   },
  buffer:    { color: "#71717a", label: "Buffer",    Icon: Sunrise   },
  task:      { color: "#3b82f6", label: "Task",      Icon: Briefcase },
  event:     { color: "#0891b2", label: "Event",     Icon: Briefcase },
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "#dc2626",
  high:     "#d97706",
  medium:   "#4f46e5",
};

function getAccentColor(block: ScheduleBlock): string {
  if (block.block_type === "task" && block.priority && PRIORITY_COLORS[block.priority]) {
    return PRIORITY_COLORS[block.priority];
  }
  return TYPE_CONFIG[block.block_type]?.color ?? "#a1a1aa";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function durationMins(b: ScheduleBlock): number {
  const [sh, sm] = b.start_time.split(":").map(Number);
  const [eh, em] = b.end_time.split(":").map(Number);
  const raw = (eh * 60 + em) - (sh * 60 + sm);
  return Math.max(0, raw < 0 ? raw + 1440 : raw);
}

function fmtDuration(mins: number): string {
  const m = Math.max(0, mins);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h}h` : `${h}h ${r}m`;
}

function fmtTimeRange(start: string, end: string): string {
  const fmt = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${hour}:${String(m).padStart(2, "0")}`;
  };
  const [sh] = start.split(":").map(Number);
  const [eh] = end.split(":").map(Number);
  const sp = sh < 12 ? "AM" : "PM";
  const ep = eh < 12 ? "AM" : "PM";
  return sp === ep
    ? `${fmt(start)} – ${fmt(end)} ${ep}`
    : `${fmt(start)} ${sp} – ${fmt(end)} ${ep}`;
}

// ── Priority badge ────────────────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: string | null }) {
  if (!priority || priority === "low" || priority === "optional") return null;
  const styles: Record<string, string> = {
    critical: "bg-red-50 text-red-700 border-red-200",
    high:     "bg-orange-50 text-orange-700 border-orange-200",
    medium:   "bg-indigo-50 text-indigo-700 border-indigo-200",
  };
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide border ${styles[priority] ?? "bg-zinc-50 text-zinc-600 border-zinc-200"}`}>
      {priority}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  block: ScheduleBlock;
  onComplete?: (blockId: number, taskId: number) => Promise<void>;
  onMiss?: (blockId: number, taskId: number) => Promise<void>;
  onSkip?: (blockId: number, taskId: number) => Promise<void>;
  completed?: boolean;
  missed?: boolean;
  isCurrent?: boolean;
}

export default function BlockCard({
  block, onComplete, onMiss, onSkip,
  completed, missed, isCurrent,
}: Props) {
  const [loading, setLoading] = useState<"complete" | "miss" | "skip" | null>(null);
  const isTask = block.block_type === "task" && block.task_id != null;
  const mins = durationMins(block);
  const config = TYPE_CONFIG[block.block_type] ?? TYPE_CONFIG.task;
  const { Icon, label } = config;
  const accentColor = getAccentColor(block);

  async function handle(type: "complete" | "miss" | "skip") {
    if (!block.task_id) return;
    setLoading(type);
    try {
      if (type === "complete") await onComplete?.(block.id, block.task_id);
      else if (type === "miss")     await onMiss?.(block.id, block.task_id);
      else                          await onSkip?.(block.id, block.task_id);
    } finally { setLoading(null); }
  }

  // Card visual state
  const cardBg =
    missed    ? "bg-red-50/40 border-red-200" :
    completed ? "bg-zinc-50 border-zinc-200 opacity-70" :
    isCurrent ? "bg-indigo-50/50 border-indigo-200" :
                "bg-white border-zinc-200 shadow-sm hover:shadow-md hover:border-zinc-300";

  const leftBarColor = missed ? "#dc2626" : isCurrent ? "#6366f1" : accentColor;
  const leftBarWidth = isCurrent ? "w-1.5" : "w-1";

  return (
    <div className={`relative flex items-stretch rounded-xl border overflow-hidden transition-all ${cardBg}`}>
      {/* Left color bar */}
      <div className={`${leftBarWidth} shrink-0 self-stretch`} style={{ backgroundColor: leftBarColor }} />

      {/* Content */}
      <div className="flex-1 px-3 py-2.5 min-w-0">
        {/* Row 1: title + badge */}
        <div className="flex items-start justify-between gap-2 mb-1">
          <span className={`text-[14px] font-medium leading-snug ${completed || missed ? "line-through text-zinc-400" : "text-zinc-900"}`}>
            {block.title}
          </span>
          {completed ? (
            <span className="shrink-0 flex items-center gap-1 text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
              <CheckCircle2 className="w-3 h-3" /> Done
            </span>
          ) : isTask && !missed ? (
            <PriorityBadge priority={block.priority} />
          ) : null}
        </div>

        {/* Row 2: time range + duration + type */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="bg-zinc-100 text-zinc-500 rounded-full px-2 py-0.5 text-[11px] font-mono tabular-nums">
            {fmtTimeRange(block.start_time, block.end_time)}
          </span>
          <span className="text-[11px] text-zinc-400">{fmtDuration(mins)}</span>
          {!isTask && <span className="text-[11px] text-zinc-400">{label}</span>}
        </div>

        {/* Row 3: task actions */}
        {isTask && !completed && !missed && (
          <div className="flex items-center gap-1.5 mt-2">
            <button onClick={() => handle("complete")} disabled={loading !== null}
              className="flex items-center gap-1 text-[12px] font-semibold text-green-700 bg-green-50 hover:bg-green-100 disabled:opacity-40 border border-green-200 rounded-lg px-2.5 py-1 transition-colors">
              {loading === "complete" ? "·" : "✓"} Complete
            </button>
            <button onClick={() => handle("skip")} disabled={loading !== null}
              className="flex items-center gap-1 text-[12px] font-semibold text-zinc-500 bg-zinc-50 hover:bg-zinc-100 disabled:opacity-40 border border-zinc-200 rounded-lg px-2.5 py-1 transition-colors">
              {loading === "skip" ? "·" : "⟳"} Skip
            </button>
            <button onClick={() => handle("miss")} disabled={loading !== null}
              className="flex items-center gap-1 text-[12px] font-semibold text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-40 border border-red-200 rounded-lg px-2.5 py-1 transition-colors">
              {loading === "miss" ? "·" : "✗"} Miss
            </button>
          </div>
        )}
      </div>

      {/* Right: type icon */}
      <div className="flex items-center px-3 shrink-0">
        <Icon
          className="w-4 h-4"
          style={{ color: completed || missed ? "#a1a1aa" : accentColor, opacity: completed ? 0.5 : 1 }}
        />
      </div>
    </div>
  );
}
