import { useEffect, useRef, useState } from 'react';
import { Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { PublicFloorPlan, PublicStallSummary } from '@/hooks/usePublicExhibitions';

interface PublishedFloorPlanProps {
  floorPlan: PublicFloorPlan;
  exhibitionTitle?: string;
  // Same contract as StallFloorPlan — see that component for the rationale:
  // stalls are never bought directly, only via apply -> approve -> select.
  onApply?: () => void;
  canApply?: boolean;
  applyPending?: boolean;
}

const STATUS_STYLES = {
  available: 'bg-emerald-500/20 border-emerald-500 hover:bg-emerald-500/30',
  reserved: 'bg-amber-500/20 border-amber-500 hover:bg-amber-500/30',
  sold: 'bg-destructive/20 border-destructive/50 cursor-not-allowed opacity-60',
} as const;

function toNumber(value: string | number): number {
  return typeof value === 'number' ? value : Number(value);
}

function formatPrice(price: string | number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(price));
}

export default function PublishedFloorPlan({ floorPlan, exhibitionTitle, onApply, canApply, applyPending }: PublishedFloorPlanProps) {
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

  const stalls = floorPlan.objects.map((o) => o.stall);
  const availableCount = stalls.filter((s) => s.status === 'available').length;
  const reservedCount = stalls.filter((s) => s.status === 'reserved').length;
  const soldCount = stalls.filter((s) => s.status === 'sold').length;

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold text-foreground">Floor Plan</h3>
            {exhibitionTitle && <p className="text-sm text-muted-foreground">{exhibitionTitle}</p>}
          </div>
          <div className="flex flex-wrap gap-4">
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
        </div>

        <div
          ref={containerRef}
          className="bg-muted/30 rounded-xl border border-border overflow-hidden"
          style={{ height: canvasHeight * scale + 32 }}
        >
          <div className="p-4">
            <div
              className="relative bg-card border border-border rounded-lg"
              style={{
                width: canvasWidth,
                height: canvasHeight,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
                backgroundImage: floorPlan.backgroundUrl ? `url(${floorPlan.backgroundUrl})` : undefined,
                backgroundSize: 'cover',
              }}
            >
              {floorPlan.objects.map((object) => {
                const stall = object.stall;
                const isAvailable = stall.status === 'available';
                return (
                  <Tooltip key={object.id}>
                    <TooltipTrigger asChild>
                      <button
                        className={cn(
                          'absolute border-2 rounded-md flex items-center justify-center transition-colors',
                          STATUS_STYLES[stall.status],
                          selectedStall?.id === stall.id && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                        )}
                        style={{
                          left: toNumber(object.x),
                          top: toNumber(object.y),
                          width: toNumber(object.width),
                          height: toNumber(object.height),
                          zIndex: object.zIndex,
                        }}
                        onClick={() => isAvailable && setSelectedStall(stall)}
                        disabled={!isAvailable}
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
                        <p className="text-muted-foreground capitalize">{stall.stallType} • {stall.status}</p>
                        {isAvailable && <p className="text-primary font-medium">{formatPrice(stall.price)}</p>}
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
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-semibold text-foreground">Stall {selectedStall.code ?? selectedStall.id.slice(0, 6)}</h4>
                <p className="text-sm text-muted-foreground capitalize">
                  {selectedStall.stallType} stall • {selectedStall.status}
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-primary">{formatPrice(selectedStall.price)}</p>
                <p className="text-xs text-muted-foreground">per event</p>
              </div>
            </div>

            {onApply ? (
              <>
                <p className="text-sm text-muted-foreground mt-4">
                  Stalls aren't purchased directly — apply to exhibit, and once the organizer approves you, you'll
                  choose your own stall (this one or another available one) before paying.
                </p>
                <Button className="mt-3 w-full gap-2" onClick={onApply} disabled={applyPending}>
                  <Building2 className="w-4 h-4" />
                  {applyPending ? 'Applying...' : 'Apply to Exhibit'}
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground mt-4">
                {canApply === false
                  ? 'Stalls are allocated to approved exhibitors through the application process.'
                  : 'You already have an application for this exhibition — track its status from My Participations.'}
              </p>
            )}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
