import { useEffect, useRef, useState } from "react";
import { Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { PublicFloorPlan, PublicStallSummary } from "@/hooks/usePublicExhibitions";

interface FloorPlanStallPickerProps {
  floorPlan: PublicFloorPlan;
  onSelectStall: (stallId: string) => void;
  selecting: boolean;
  /**
   * Optional — the backend's conditional update on reservation is the real
   * concurrency guard, this is purely cosmetic in case a caller already
   * knows (from other context) that a stall shouldn't be offered.
   */
  disabledStallIds?: string[];
}

const STATUS_STYLES = {
  available: "bg-emerald-500/20 border-emerald-500 hover:bg-emerald-500/30",
  reserved: "bg-amber-500/20 border-amber-500 cursor-not-allowed opacity-60",
  sold: "bg-destructive/20 border-destructive/50 cursor-not-allowed opacity-60",
} as const;

function toNumber(value: string | number): number {
  return typeof value === "number" ? value : Number(value);
}

function formatPrice(price: string | number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(price));
}

function stallAriaLabel(stall: PublicStallSummary): string {
  const parts = [
    `Stall ${stall.code ?? stall.id.slice(0, 6)}`,
    stall.stallType,
    stall.status,
    stall.status === "available" ? formatPrice(stall.price) : null,
  ].filter((part): part is string => Boolean(part));
  return parts.join(", ");
}

/**
 * Visual map for RESERVING a stall (approved exhibitor's "Select Stall"
 * flow), adapted from PublishedFloorPlan.tsx's public "apply to exhibit"
 * rendering — same absolute-positioned scaled canvas and status colors, but
 * a different action (reserve, not apply) and no application-flow copy.
 *
 * Staleness handling: this component does not re-check availability itself
 * before calling `onSelectStall` — the backend's conditional update on the
 * reservation endpoint is the authoritative guard against a race, and
 * duplicating that check here would just be a second, non-authoritative
 * copy of it. Instead, the parent is expected to (a) refetch the floor-plan
 * query when this picker is opened, so it starts from fresh data, and
 * (b) refetch again if the reservation call comes back 409 (stall taken by
 * someone else since); when the floor plan prop is refreshed after a 409,
 * the effect below drops the selected-stall panel if that stall is no
 * longer available.
 */
export default function FloorPlanStallPicker({
  floorPlan,
  onSelectStall,
  selecting,
  disabledStallIds,
}: FloorPlanStallPickerProps) {
  const [selectedStall, setSelectedStall] = useState<PublicStallSummary | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  const canvasWidth = toNumber(floorPlan.canvasWidth);
  const canvasHeight = toNumber(floorPlan.canvasHeight);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateScale = () => {
      const width = el.clientWidth;
      if (width > 0) setScale(Math.min(1, width / canvasWidth));
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(el);
    return () => observer.disconnect();
  }, [canvasWidth]);

  // If the floor plan data refreshes (e.g. after a 409 conflict) and the
  // currently-selected stall is no longer available, drop the confirm
  // panel instead of leaving it offering a reservation that will fail.
  useEffect(() => {
    setSelectedStall((current) => {
      if (!current) return current;
      const updated = floorPlan.objects.find((o) => o.stallId === current.id)?.stall;
      if (!updated || updated.status !== "available") return null;
      return updated;
    });
  }, [floorPlan]);

  const disabledSet = new Set(disabledStallIds ?? []);
  const stalls = floorPlan.objects.map((o) => o.stall);
  const availableCount = stalls.filter((s) => s.status === "available" && !disabledSet.has(s.id)).length;
  const reservedCount = stalls.filter((s) => s.status === "reserved").length;
  const soldCount = stalls.filter((s) => s.status === "sold").length;

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="flex flex-wrap justify-end gap-4">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-emerald-500/40 border border-emerald-500" />
            <span className="text-sm text-muted-foreground">Available ({availableCount})</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-amber-500/40 border border-amber-500" />
            <span className="text-sm text-muted-foreground">Reserved ({reservedCount})</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-destructive/40 border border-destructive/50" />
            <span className="text-sm text-muted-foreground">Sold ({soldCount})</span>
          </div>
        </div>

        <div
          ref={containerRef}
          className="bg-muted/30 rounded-xl border border-border overflow-hidden max-w-full"
          style={{ height: canvasHeight * scale + 32 }}
        >
          <div className="p-4">
            <div
              className="relative bg-card border border-border rounded-lg"
              style={{
                width: canvasWidth,
                height: canvasHeight,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
                backgroundImage: floorPlan.backgroundUrl ? `url(${floorPlan.backgroundUrl})` : undefined,
                backgroundSize: "cover",
              }}
            >
              {floorPlan.objects.map((object) => {
                const stall = object.stall;
                const isSelectable = stall.status === "available" && !disabledSet.has(stall.id);
                return (
                  <Tooltip key={object.id}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          "absolute border-2 rounded-md flex items-center justify-center transition-colors",
                          STATUS_STYLES[stall.status],
                          !isSelectable && stall.status === "available" && "cursor-not-allowed opacity-60",
                          selectedStall?.id === stall.id && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                        )}
                        style={{
                          left: toNumber(object.x),
                          top: toNumber(object.y),
                          width: toNumber(object.width),
                          height: toNumber(object.height),
                          zIndex: object.zIndex,
                        }}
                        onClick={() => isSelectable && setSelectedStall(stall)}
                        disabled={!isSelectable}
                        aria-label={stallAriaLabel(stall)}
                        aria-pressed={selectedStall?.id === stall.id}
                      >
                        {object.labelVisible && (
                          <span className="text-xs font-medium text-foreground truncate px-1">
                            {stall.code ?? stall.stallType}
                          </span>
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="text-sm">
                        <p className="font-medium">Stall {stall.code ?? stall.id.slice(0, 6)}</p>
                        <p className="text-muted-foreground capitalize">
                          {stall.stallType} • {stall.status}
                        </p>
                        {stall.status === "available" && <p className="text-primary font-medium">{formatPrice(stall.price)}</p>}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        </div>

        {selectedStall && (
          <div className="bg-card rounded-lg border border-border p-4 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="font-semibold text-foreground">Stall {selectedStall.code ?? selectedStall.id.slice(0, 6)}</h4>
                <p className="text-sm text-muted-foreground capitalize">{selectedStall.stallType} stall</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-primary">{formatPrice(selectedStall.price)}</p>
              </div>
            </div>
            <Button className="mt-3 w-full gap-2" onClick={() => onSelectStall(selectedStall.id)} disabled={selecting}>
              <Store className="w-4 h-4" />
              {selecting ? "Reserving..." : "Reserve this stall"}
            </Button>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
