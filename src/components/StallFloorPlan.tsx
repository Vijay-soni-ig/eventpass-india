import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import type { Stall } from '@/types/exhibitor';

interface StallFloorPlanProps {
  exhibitionId: string;
  exhibitionTitle?: string;
  stalls: Stall[];
}

const StallFloorPlan = ({ exhibitionId, exhibitionTitle, stalls }: StallFloorPlanProps) => {
  const [selectedStall, setSelectedStall] = useState<Stall | null>(null);

  const availableCount = stalls.filter((s) => s.status === 'available').length;
  const reservedCount = stalls.filter((s) => s.status === 'reserved').length;
  const soldCount = stalls.filter((s) => s.status === 'sold').length;

  const getStallStyles = (stall: Stall) => {
    const baseStyles =
      'relative flex items-center justify-center w-20 h-20 md:w-24 md:h-24 rounded-md border-2 cursor-pointer transition-all duration-200 hover:scale-105';

    const statusStyles = {
      available: 'bg-emerald-500/20 border-emerald-500 hover:bg-emerald-500/30',
      sold: 'bg-destructive/20 border-destructive/50 cursor-not-allowed opacity-60',
      reserved: 'bg-amber-500/20 border-amber-500 hover:bg-amber-500/30',
    } as const;

    const selectedStyles = selectedStall?.id === stall.id ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : '';

    return cn(baseStyles, statusStyles[stall.status], selectedStyles);
  };

  const formatPrice = (price: string | number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(Number(price));
  };

  if (stalls.length === 0) {
    return null;
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold text-foreground">Floor Plan</h3>
            {exhibitionTitle && (
              <p className="text-sm text-muted-foreground">{exhibitionTitle}</p>
            )}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-emerald-500/40 border border-emerald-500"></div>
              <span className="text-sm text-muted-foreground">Available ({availableCount})</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-amber-500/40 border border-amber-500"></div>
              <span className="text-sm text-muted-foreground">Reserved ({reservedCount})</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-destructive/40 border border-destructive/50"></div>
              <span className="text-sm text-muted-foreground">Sold ({soldCount})</span>
            </div>
          </div>
        </div>

        {/* Floor Plan Grid */}
        <div className="bg-muted/30 rounded-xl p-6 border border-border">
          <div className="flex flex-wrap justify-center gap-3">
            {stalls.map((stall) => (
              <Tooltip key={stall.id}>
                <TooltipTrigger asChild>
                  <button
                    className={getStallStyles(stall)}
                    onClick={() => stall.status === 'available' && setSelectedStall(stall)}
                    disabled={stall.status !== 'available'}
                  >
                    <span className="text-xs md:text-sm font-medium text-foreground">
                      {stall.code ?? stall.stallType}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="text-sm">
                    <p className="font-medium">Stall {stall.code ?? stall.id.slice(0, 6)}</p>
                    <p className="text-muted-foreground capitalize">{stall.stallType} • {stall.status}</p>
                    {stall.status === 'available' && (
                      <p className="text-primary font-medium">{formatPrice(stall.price)}</p>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>

        {/* Selected Stall Details */}
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

            <Link to={`/book-stall/${exhibitionId}`}>
              <Button className="mt-4 w-full">Book This Stall</Button>
            </Link>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
};

export default StallFloorPlan;
