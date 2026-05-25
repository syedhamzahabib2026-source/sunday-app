import { ScheduleBlock } from "@/lib/api";

// 1px per minute. Day window 05:00–24:00 = 1140px
const DAY_START_MIN = 5 * 60;
const DAY_END_MIN = 24 * 60;
const CONTAINER_HEIGHT = DAY_END_MIN - DAY_START_MIN; // 1140

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function blockColors(block: ScheduleBlock): { bg: string; color: string } {
  switch (block.block_type) {
    case "sleep":     return { bg: "rgba(124,58,237,0.18)", color: "#c4b5fd" };
    case "meal":      return { bg: "rgba(234,88,12,0.18)",  color: "#fdba74" };
    case "commute":   return { bg: "rgba(37,99,235,0.18)",  color: "#93c5fd" };
    case "gym":
    case "muay_thai": return { bg: "rgba(22,163,74,0.18)",  color: "#86efac" };
    case "routine":   return { bg: "rgba(82,82,82,0.20)",   color: "#a3a3a3" };
    case "buffer":    return { bg: "rgba(82,82,82,0.12)",   color: "#737373" };
    case "task": {
      switch (block.priority) {
        case "critical": return { bg: "rgba(220,38,38,0.18)",  color: "#fca5a5" };
        case "high":     return { bg: "rgba(217,119,6,0.18)",  color: "#fcd34d" };
        case "medium":   return { bg: "rgba(99,102,241,0.18)", color: "#a5b4fc" };
        case "low":
        case "optional": return { bg: "rgba(82,82,82,0.15)",   color: "#737373" };
        default:         return { bg: "rgba(99,102,241,0.18)", color: "#a5b4fc" };
      }
    }
    default: return { bg: "rgba(82,82,82,0.15)", color: "#a3a3a3" };
  }
}

interface Props {
  day: string;      // "Mon 25"
  date: string;     // "YYYY-MM-DD"
  blocks: ScheduleBlock[];
  isToday: boolean;
}

export default function DayColumn({ day, blocks, isToday }: Props) {
  const [dayName, dayNum] = day.split(" ");

  return (
    <div className="flex flex-col min-w-0">
      {/* Column header */}
      <div
        className={`text-center py-2 mb-0 border-b border-[#2a2a2a] ${
          isToday ? "bg-[#1e1b4b]/30" : ""
        }`}
      >
        <div className="text-[11px] font-medium text-[#888888] uppercase tracking-[0.06em]">
          {dayName}
        </div>
        <div
          className={`text-[18px] font-bold leading-tight ${
            isToday ? "text-[#f0f0f0]" : "text-[#f0f0f0]"
          }`}
        >
          {dayNum}
        </div>
      </div>

      {/* Timeline */}
      <div
        className={`relative overflow-hidden min-h-[600px] ${
          isToday ? "bg-[#1e1b4b]/10" : ""
        }`}
        style={{ height: CONTAINER_HEIGHT }}
      >
        {blocks.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-[10px] text-[#2a2a2a]">—</span>
          </div>
        )}

        {blocks.map((block) => {
          const startMin = toMinutes(block.start_time);
          const endMin = toMinutes(block.end_time);
          const top = Math.max(0, startMin - DAY_START_MIN);
          const height = Math.max(8, endMin - startMin);
          const { bg, color } = blockColors(block);

          const tooltip = [
            `${block.start_time}–${block.end_time}`,
            block.title,
            block.block_type.replace("_", " "),
            block.priority ?? "",
            `${endMin - startMin} min`,
          ]
            .filter(Boolean)
            .join(" · ");

          return (
            <div
              key={block.id}
              title={tooltip}
              className="absolute left-0 right-0 mx-px rounded-sm overflow-hidden cursor-default hover:brightness-110 transition-all"
              style={{ top, height, backgroundColor: bg, color }}
            >
              {height >= 16 && (
                <div className="px-1.5 pt-px overflow-hidden">
                  {height >= 26 && (
                    <div
                      className="text-[9px] opacity-60 tabular-nums leading-none mb-px"
                      style={{ color }}
                    >
                      {block.start_time}
                    </div>
                  )}
                  <div
                    className="text-[10px] font-medium truncate leading-tight"
                    style={{ color }}
                  >
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
