import { ScheduleBlock } from "@/lib/api";

const MAX_VISIBLE = 5;

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
    case "deep_work": return "#2563eb";
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

function fmt12short(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "p" : "a";
  const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour}${m === 0 ? "" : `:${String(m).padStart(2, "0")}`}${period}`;
}

interface Props {
  day: string;
  date: string;
  blocks: ScheduleBlock[];
  isToday: boolean;
  onClick?: () => void;
}

export default function DayColumn({ day, blocks, isToday, onClick }: Props) {
  const [dayName, dayNum] = day.split(" ");
  const visible = blocks.slice(0, MAX_VISIBLE);
  const overflow = blocks.length - MAX_VISIBLE;

  return (
    <div
      className={`flex flex-col min-w-0 min-h-[160px] ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
    >
      {/* Header */}
      <div className={`text-center py-2.5 border-b border-zinc-200 transition-colors ${isToday ? "bg-indigo-50" : onClick ? "hover:bg-zinc-50 bg-white" : "bg-white"}`}>
        <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-1">{dayName}</div>
        <div
          className={`text-[15px] font-bold leading-none mx-auto w-7 h-7 flex items-center justify-center rounded-full ${
            isToday ? "bg-indigo-600 text-white" : "text-zinc-900"
          }`}
        >
          {dayNum}
        </div>
      </div>

      {/* Blocks */}
      <div className={`flex-1 p-1.5 space-y-1 transition-colors ${isToday ? "bg-indigo-50/20" : onClick ? "hover:bg-zinc-50/50 bg-white" : "bg-white"}`}>
        {blocks.length === 0 ? (
          <div className="h-full min-h-[80px] border border-dashed border-zinc-200 rounded-lg flex items-center justify-center">
            <span className="text-[10px] text-zinc-300">—</span>
          </div>
        ) : (
          <>
            {visible.map((block) => (
              <div
                key={block.id}
                className="flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-zinc-50 transition-colors cursor-default group"
                title={`${block.start_time}–${block.end_time} · ${block.title}`}
              >
                <div
                  className="w-[3px] h-3.5 rounded-full shrink-0"
                  style={{ backgroundColor: getAccent(block) }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-medium text-zinc-700 truncate leading-tight">{block.title}</p>
                  <p className="text-[9px] text-zinc-400 tabular-nums">{fmt12short(block.start_time)}</p>
                </div>
              </div>
            ))}
            {overflow > 0 && (
              <p className="text-[9px] text-indigo-500 font-medium px-1.5 pb-0.5 hover:text-indigo-700">
                View all →
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
