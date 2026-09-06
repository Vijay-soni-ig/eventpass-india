import { useState } from "react";
import { Clock } from "lucide-react";

interface ScheduleItem {
  id: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  title: string;
  description: string | null;
}

function formatDay(dateString: string) {
  const d = new Date(dateString);
  return {
    weekday: d.toLocaleDateString("en-IN", { weekday: "short" }),
    day: d.toLocaleDateString("en-IN", { day: "numeric" }),
    month: d.toLocaleDateString("en-IN", { month: "short" }),
  };
}

// Phase 25 — organizer-entered daily schedule (ExhibitionSchedule), optional
// and never fabricated: if the organizer never added one, this renders
// nothing and the hero's own date-range line remains the only schedule
// information (see EventHero.tsx). A compact date-strip selector, not a
// list of cards, per the redesign's "timeline, not another card" direction.
export function EventScheduleSection({ schedule }: { schedule: ScheduleItem[] | undefined }) {
  const items = schedule ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id ?? null);
  if (items.length === 0) return null;

  const selected = items.find((i) => i.id === selectedId) ?? items[0];

  return (
    <div>
      <h2 className="font-display text-xl font-semibold mb-4">Dates &amp; Schedule</h2>
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Exhibition schedule by day">
        {items.map((item) => {
          const { weekday, day, month } = formatDay(item.date);
          const isSelected = item.id === selected.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => setSelectedId(item.id)}
              className={`shrink-0 min-w-[64px] rounded-xl border px-3 py-2 text-center transition-colors ${
                isSelected ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40"
              }`}
            >
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{weekday}</p>
              <p className="font-semibold text-sm">{day} {month}</p>
            </button>
          );
        })}
      </div>

      <div className="mt-4 p-4 rounded-xl border border-border bg-muted/30">
        {(selected.startTime || selected.endTime) && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1">
            <Clock className="w-3.5 h-3.5 text-primary shrink-0" aria-hidden="true" />
            {selected.startTime}
            {selected.startTime && selected.endTime ? " – " : ""}
            {selected.endTime}
          </p>
        )}
        <p className="font-semibold">{selected.title}</p>
        {selected.description && <p className="text-sm text-muted-foreground mt-1">{selected.description}</p>}
      </div>
    </div>
  );
}
