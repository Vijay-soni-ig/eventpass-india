import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

export type DatePreset = "today" | "7d" | "30d" | "90d" | "year" | "custom";

export interface DashboardRange {
  preset: DatePreset;
  from: Date;
  to: Date;
  granularity: "day" | "week" | "month";
}

const PRESET_LABELS: Record<DatePreset, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  year: "This year",
  custom: "Custom range",
};

export function rangeForPreset(preset: DatePreset, customFrom?: Date, customTo?: Date): DashboardRange {
  const to = new Date();
  let from: Date;
  let granularity: "day" | "week" | "month" = "day";

  switch (preset) {
    case "today":
      from = new Date(to.getFullYear(), to.getMonth(), to.getDate());
      break;
    case "7d":
      from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "90d":
      from = new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);
      granularity = "week";
      break;
    case "year":
      from = new Date(to.getFullYear(), 0, 1);
      granularity = "month";
      break;
    case "custom":
      from = customFrom ?? new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { preset, from, to: customTo ?? to, granularity: "day" };
    case "30d":
    default:
      from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
  }
  return { preset, from, to, granularity };
}

interface DateRangeControlProps {
  range: DashboardRange;
  onChange: (range: DashboardRange) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export function DateRangeControl({ range, onChange, onRefresh, isRefreshing }: DateRangeControlProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={range.preset}
        onValueChange={(v) => onChange(rangeForPreset(v as DatePreset, range.from, range.to))}
      >
        <SelectTrigger className="w-44 h-9">
          <SelectValue>{PRESET_LABELS[range.preset]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(PRESET_LABELS) as DatePreset[]).map((p) => (
            <SelectItem key={p} value={p}>
              {PRESET_LABELS[p]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {range.preset === "custom" && (
        <>
          <Input
            type="date"
            className="h-9 w-40"
            value={range.from.toISOString().slice(0, 10)}
            onChange={(e) => onChange({ ...range, from: new Date(e.target.value) })}
          />
          <span className="text-muted-foreground text-sm">to</span>
          <Input
            type="date"
            className="h-9 w-40"
            value={range.to.toISOString().slice(0, 10)}
            onChange={(e) => onChange({ ...range, to: new Date(e.target.value) })}
          />
        </>
      )}

      <Button variant="outline" size="sm" className="h-9" onClick={onRefresh} disabled={isRefreshing}>
        <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
        Refresh
      </Button>
    </div>
  );
}
