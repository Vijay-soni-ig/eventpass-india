import { CalendarRange, Store, Ticket } from "lucide-react";
import { Card } from "@/components/ui/card";
import { eventDurationDays } from "@/lib/dateFormat";
import type { Exhibition } from "@/types/exhibitor";

interface HighlightsProps {
  exhibition: Exhibition;
  confirmedExhibitorCount: number;
}

// Phase 24 — every highlight here is DERIVED from real counts already
// returned by the API (never an organizer-authored marketing claim, since no
// such field exists on Exhibition). A highlight is only shown when its
// underlying count is genuinely > 0 — per the brief, "do not hardcode fake
// claims" and "do not show empty fields" apply equally to this section.
export function EventHighlights({ exhibition, confirmedExhibitorCount }: HighlightsProps) {
  const duration = eventDurationDays(exhibition.startDate, exhibition.endDate);
  const ticketTierCount = (exhibition.ticketTypes ?? []).filter((t) => t.visible).length;
  const availableStallCount = (exhibition.stalls ?? []).filter((s) => s.status === "available").length;

  const items: { icon: typeof CalendarRange; label: string }[] = [];
  if (duration && duration > 1) items.push({ icon: CalendarRange, label: `${duration}-day exhibition` });
  if (confirmedExhibitorCount > 0) {
    items.push({ icon: Store, label: `${confirmedExhibitorCount}+ confirmed exhibitors` });
  }
  if (ticketTierCount > 1) items.push({ icon: Ticket, label: `${ticketTierCount} ticket types available` });
  if (availableStallCount > 0) items.push({ icon: Store, label: `${availableStallCount} stalls still available` });

  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-3">
      {items.map((item) => (
        <Card key={item.label} className="px-4 py-2.5 flex items-center gap-2">
          <item.icon className="w-4 h-4 text-primary shrink-0" />
          <span className="text-sm font-medium">{item.label}</span>
        </Card>
      ))}
    </div>
  );
}
