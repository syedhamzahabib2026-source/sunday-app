import { ScheduleBlock } from "@/lib/api";

const DAY_START_MIN = 5 * 60;
const DAY_END_MIN = 24 * 60;
const CONTAINER_HEIGHT = DAY_END_MIN - DAY_START_MIN;

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function blockStyle(block: ScheduleBlock): { bg: string; color: string; border: string } {
  switch (block.block_type) {
    case "sleep":     return { bg: "#f5f3ff", color: "#6d28d9", border: "#ddd6fe" };
    case "meal":      return { bg: "#fff7ed", color: "#c2410c", border: "#fed7aa" };
    case "commute":   return { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" };
    case "gym":
    case "muay_thai": return { bg: "#f0fdf4", color: "#15803d", border: "#bbf7d0" };
    case "event":     return { bg: "#ecfeff", color: "#0e7490", border: "#a5f3fc" };
    case "routine":   return { bg: "#fafafa", color: "#71717a", border: "#e4e4e7" };
    case "buffer":    return { bg: "#fafafa", color: "#a1a1aa", border: "#f4f4f5" };
    case "task": {
      switch (block.priority) {
        case "critical": return { bg: "#fef2f2", color: "#b91c1c", border: "#fecaca" };
        case "high":     return { bg: "#fffbeb", color: "#b45309", border: "#fde68a" };
        case "medium":   return { bg: "#eef2ff", color: "#4338ca", border: "#c7d2fe" };
        case "low":
        case "optional": return { bg: "#fafafa", color: "#a1a1aa", border: "#e4e4e7" };
        default:         return { bg: "#eef2ff", color: "#4338ca", border: "#c7d2fe" };
      }
    }
    default: return { bg: "#fafafa", color: "#71717a", border: "#e4e4e7" };
  }
}

interface Props {
  day: string;
  date: string;
  blocks: ScheduleBlock[];
  isToday: boolean;
}

export default function DayColumn({ day, blocks, isToday }: Props) {
  const [dayName, dayNum] = day.split(" ");

  return (
    <div className="flex flex-col min-w-0">
      <div className={`text-center py-2.5 border-b border-zinc-200 ${isToday ? "bg-indigo-50" : "bg-white"}`}>
        <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-1">{dayName}</div>
        <div
          className={`text-[16px] font-bold leading-none mx-auto w-7 h-7 flex items-center justify-center rounded-full ${
            isToday ? "bg-indigo-600 text-white" : "text-zinc-900"
          }`}
        >
          {dayNum}
        </div>
      </div>

      <div
        className={`relative overflow-hidden ${isToday ? "bg-indigo-50/30" : "bg-white"}`}
        style={{ height: CONTAINER_HEIGHT }}
      >
        {blocks.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-[9px] text-zinc-200">—</span>
          </div>
        )}

        {blocks.map((block) => {
          const startMin = toMinutes(block.start_time);
          const endMin = toMinutes(block.end_time);
          const top = Math.max(0, startMin - DAY_START_MIN);
          const height = Math.max(8, endMin - startMin);
          const { bg, color, border } = blockStyle(block);

          const tooltip = [
            `${block.start_time}–${block.end_time}`,
            block.title,
            block.block_type.replace("_", " "),
            block.priority ?? "",
            `${endMin - startMin} min`,
          ].filter(Boolean).join(" · ");

          return (
            <div
              key={block.id}
              title={tooltip}
              className="absolute left-0 right-0 mx-px rounded-[3px] overflow-hidden cursor-default hover:brightness-95 transition-all border"
              style={{ top, height, backgroundColor: bg, color, borderColor: border }}
            >
              {height >= 16 && (
                <div className="px-1 pt-0.5 overflow-hidden">
                  {height >= 28 && (
                    <div className="text-[8px] opacity-50 tabular-nums leading-none mb-px" style={{ color }}>
                      {block.start_time}
                    </div>
                  )}
                  <div className="text-[9px] font-semibold truncate leading-tight" style={{ color }}>
                    {block.title}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
