"use client";

import {
  Moon, Utensils, Dumbbell, Car, Sunrise,
  Briefcase, Flame, CheckCircle2, Zap,
} from "lucide-react";
import { ScheduleBlock } from "@/lib/api";

// ── Type config ───────────────────────────────────────────────────────────────

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
  task:       { color: "#3b82f6", label: "Task",       Icon: Briefcase },
  event:      { color: "#0891b2", label: "Event",      Icon: Briefcase },
  deep_work:  { color: "#2563eb", label: "Deep Work",  Icon: Zap       },
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

// ── Action config ─────────────────────────────────────────────────────────────

type ActionId = "done" | "skip" | "miss";
interface ActionDef {
  id: ActionId;
  label: string;
  icon: string;
  style: "green" | "zinc" | "red";
}

const BTN: Record<string, string> = {
  green: "text-green-700 bg-green-50 border-green-200 hover:bg-green-100",
  zinc:  "text-zinc-500  bg-zinc-50  border-zinc-200  hover:bg-zinc-100",
  red:   "text-red-700   bg-red-50   border-red-200   hover:bg-red-100",
};

function getActions(bt: string, isTask: boolean): ActionDef[] {
  if (bt === "sleep") return [
    { id: "done", label: "Done",     icon: "✓", style: "green" },
  ];
  if (bt === "meal" || bt === "routine") return [
    { id: "done", label: "Done",    icon: "✓", style: "green" },
    { id: "skip", label: "Skipped", icon: "✗", style: "red"   },
  ];
  if (isTask) return [
    { id: "done", label: "Complete", icon: "✓", style: "green" },
    { id: "skip", label: "Skip",     icon: "⟳", style: "zinc"  },
    { id: "miss", label: "Miss",     icon: "✗", style: "red"   },
  ];
  if (bt === "gym" || bt === "muay_thai") return [
    { id: "done", label: "Done",   icon: "✓", style: "green" },
    { id: "skip", label: "Skip",   icon: "⟳", style: "zinc"  },
    { id: "miss", label: "Missed", icon: "✗", style: "red"   },
  ];
  // commute, event, buffer
  return [
    { id: "done", label: "Done", icon: "✓", style: "green" },
    { id: "skip", label: "Skip", icon: "⟳", style: "zinc"  },
  ];
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
  isExpanded?: boolean;
  onToggle?: () => void;
  onAction?: (blockId: number, taskId: number | null, action: ActionId) => void;
  completed?: boolean;
  missed?: boolean;
  isCurrent?: boolean;
  rescheduled?: boolean;
}

export default function BlockCard({
  block, isExpanded, onToggle, onAction,
  completed, missed, isCurrent, rescheduled,
}: Props) {
  const isTask     = block.block_type === "task" && block.task_id != null;
  const mins       = durationMins(block);
  const config     = TYPE_CONFIG[block.block_type] ?? TYPE_CONFIG.task;
  const { Icon, label } = config;
  const accentColor = getAccentColor(block);
  const actions    = getActions(block.block_type, isTask);
  const isClickable = !completed && !missed;

  const cardBg =
    missed      ? "bg-red-50/40 border-red-200" :
    completed   ? "bg-zinc-50 border-zinc-200 opacity-70" :
    rescheduled ? "bg-amber-50/30 border-amber-200 hover:shadow-md" :
    isExpanded  ? "bg-white border-indigo-300 ring-2 ring-indigo-100" :
    isCurrent   ? "bg-indigo-50/50 border-indigo-200" :
                  "bg-white border-zinc-200 shadow-sm hover:shadow-md hover:border-zinc-300";

  const leftColor =
    missed      ? "#dc2626" :
    rescheduled ? "#d97706" :
    (isCurrent || isExpanded) ? "#6366f1" :
    accentColor;
  const leftWidth  = isCurrent || isExpanded ? "w-1.5" : "w-1";

  return (
    <div
      className={`relative flex items-stretch rounded-xl border overflow-hidden transition-all duration-150 ${cardBg}`}
      style={{ cursor: isClickable ? "pointer" : "default" }}
      onClick={isClickable ? onToggle : undefined}
    >
      {/* Left accent bar — stretches with accordion */}
      <div className={`${leftWidth} shrink-0`} style={{ backgroundColor: leftColor }} />

      {/* Content column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Main row: info + icon */}
        <div className="flex items-center gap-2 px-3 py-2.5">
          <div className="flex-1 min-w-0">
            {/* Title + badge */}
            <div className="flex items-start justify-between gap-2 mb-0.5">
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
            {/* Rescheduled badge */}
            {rescheduled && !completed && !missed && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 mb-1"
                title="This task was missed and moved here by Sunday"
              >
                ↻ Rescheduled
              </span>
            )}
            {/* Time + duration + type */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="bg-zinc-100 text-zinc-500 rounded-full px-2 py-0.5 text-[11px] font-mono tabular-nums">
                {fmtTimeRange(block.start_time, block.end_time)}
              </span>
              <span className="text-[11px] text-zinc-400">{fmtDuration(mins)}</span>
              {!isTask && <span className="text-[11px] text-zinc-400">{label}</span>}
            </div>
          </div>
          {/* Type icon */}
          <Icon
            className="w-4 h-4 shrink-0"
            style={{
              color: completed || missed ? "#a1a1aa" : accentColor,
              opacity: completed ? 0.5 : 1,
            }}
          />
        </div>

        {/* Accordion panel */}
        <div
          className={`grid transition-all duration-200 ease-in-out ${
            isExpanded && !completed && !missed ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
        >
          <div className="overflow-hidden">
            <div
              className="flex items-center gap-2 px-3 pb-3 pt-2 border-t border-zinc-100"
              onClick={e => e.stopPropagation()}
            >
              {actions.map(a => (
                <button
                  key={`${a.id}-${a.label}`}
                  onClick={() => onAction?.(block.id, block.task_id, a.id)}
                  className={`flex items-center gap-1 text-[12px] font-semibold border rounded-lg px-2.5 py-1.5 transition-colors ${BTN[a.style]}`}
                >
                  <span>{a.icon}</span> {a.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
