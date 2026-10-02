import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PublicStallSummary } from "@/hooks/usePublicExhibitions";
import { BAND_ALPHA, bookedPercent, formatPrice, priceRange, type MapView, type TypeFilter } from "./floorPlanView";

interface FloorPlanViewControlsProps {
  stalls: PublicStallSummary[];
  view: MapView;
  onChange: (view: MapView) => void;
  /** Stalls that pass the current filters, for the "N of M shown" line. */
  shownCount: number;
}

const TYPE_LABELS: Record<Exclude<TypeFilter, "all">, string> = { premium: "Premium", standard: "Standard", basic: "Basic" };

export function FloorPlanViewControls({ stalls, view, onChange, shownCount }: FloorPlanViewControlsProps) {
  const range = priceRange(stalls);
  const types = (Object.keys(TYPE_LABELS) as Array<Exclude<TypeFilter, "all">>).filter((t) => stalls.some((s) => s.stallType === t));
  const filtered = view.availableOnly || view.type !== "all";

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex items-center gap-2" role="group" aria-label="Colour the map by">
          <span className="text-xs font-medium text-muted-foreground">Colour by</span>
          <Button
            type="button"
            size="sm"
            variant={view.mode === "status" ? "secondary" : "outline"}
            aria-pressed={view.mode === "status"}
            className="h-8"
            onClick={() => onChange({ ...view, mode: "status" })}
          >
            Status
          </Button>
          <Button
            type="button"
            size="sm"
            variant={view.mode === "price" ? "secondary" : "outline"}
            aria-pressed={view.mode === "price"}
            className="h-8"
            onClick={() => onChange({ ...view, mode: "price" })}
          >
            Price
          </Button>
        </div>

        {types.length > 1 && (
          <div className="flex items-center gap-2">
            <Label htmlFor="floor-plan-type-filter" className="text-xs font-medium text-muted-foreground">
              Type
            </Label>
            <Select value={view.type} onValueChange={(value) => onChange({ ...view, type: value as TypeFilter })}>
              <SelectTrigger id="floor-plan-type-filter" className="h-8 w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {types.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Switch
            id="floor-plan-available-only"
            checked={view.availableOnly}
            onCheckedChange={(checked) => onChange({ ...view, availableOnly: checked })}
          />
          <Label htmlFor="floor-plan-available-only" className="text-sm">
            Available only
          </Label>
        </div>

        {filtered && (
          <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => onChange({ ...view, availableOnly: false, type: "all" })}>
            Clear filters
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {view.mode === "price" ? (
          range ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground" aria-label="Price scale">
              <span className="tabular-nums">{formatPrice(range.min)}</span>
              <div className="flex overflow-hidden rounded border border-border" aria-hidden>
                {BAND_ALPHA.map((alpha, i) => (
                  <div key={i} className="h-3 w-6" style={{ backgroundColor: `hsl(var(--primary) / ${alpha})` }} />
                ))}
              </div>
              <span className="tabular-nums">{formatPrice(range.max)}</span>
              <span className="ml-1">Booked stalls are grey.</span>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No stalls are available to price.</p>
          )
        ) : (
          <span />
        )}
        <p className="text-xs text-muted-foreground" aria-live="polite" data-testid="floor-plan-summary">
          {filtered ? `${shownCount} of ${stalls.length} stalls shown` : `${stalls.length} stalls`} · {bookedPercent(stalls)}% booked
        </p>
      </div>
    </div>
  );
}
