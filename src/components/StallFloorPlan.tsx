import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

interface Stall {
  id: string;
  number: string;
  size: 'small' | 'medium' | 'large';
  status: 'available' | 'booked' | 'reserved';
  price: number;
  position: { row: number; col: number };
  exhibitor?: string;
}

interface StallFloorPlanProps {
  exhibitionId: string;
  exhibitionTitle?: string;
}

// Mock stall data - in production this would come from the database
const generateMockStalls = (exhibitionId: string): Stall[] => {
  const stalls: Stall[] = [];
  const rows = 4;
  const cols = 6;
  
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const stallNum = row * cols + col + 1;
      const isBooked = Math.random() > 0.6;
      const isReserved = !isBooked && Math.random() > 0.7;
      
      stalls.push({
        id: `${exhibitionId}-stall-${stallNum}`,
        number: `${String.fromCharCode(65 + row)}${col + 1}`,
        size: col === 0 || col === cols - 1 ? 'large' : row === 0 ? 'medium' : 'small',
        status: isBooked ? 'booked' : isReserved ? 'reserved' : 'available',
        price: col === 0 || col === cols - 1 ? 50000 : row === 0 ? 35000 : 25000,
        position: { row, col },
        exhibitor: isBooked ? `Exhibitor ${stallNum}` : undefined,
      });
    }
  }
  
  return stalls;
};

const StallFloorPlan = ({ exhibitionId, exhibitionTitle }: StallFloorPlanProps) => {
  const [selectedStall, setSelectedStall] = useState<Stall | null>(null);
  const stalls = generateMockStalls(exhibitionId);
  
  const availableCount = stalls.filter(s => s.status === 'available').length;
  const bookedCount = stalls.filter(s => s.status === 'booked').length;
  const reservedCount = stalls.filter(s => s.status === 'reserved').length;

  const getStallStyles = (stall: Stall) => {
    const baseStyles = 'relative flex items-center justify-center rounded-md border-2 cursor-pointer transition-all duration-200 hover:scale-105';
    
    const sizeStyles = {
      small: 'w-16 h-16 md:w-20 md:h-20',
      medium: 'w-20 h-20 md:w-24 md:h-24',
      large: 'w-24 h-20 md:w-28 md:h-24',
    };
    
    const statusStyles = {
      available: 'bg-emerald-500/20 border-emerald-500 hover:bg-emerald-500/30',
      booked: 'bg-destructive/20 border-destructive/50 cursor-not-allowed opacity-60',
      reserved: 'bg-amber-500/20 border-amber-500 hover:bg-amber-500/30',
    };
    
    const selectedStyles = selectedStall?.id === stall.id ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : '';
    
    return cn(baseStyles, sizeStyles[stall.size], statusStyles[stall.status], selectedStyles);
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(price);
  };

  // Group stalls by row
  const rows = stalls.reduce((acc, stall) => {
    const rowIndex = stall.position.row;
    if (!acc[rowIndex]) acc[rowIndex] = [];
    acc[rowIndex].push(stall);
    return acc;
  }, {} as Record<number, Stall[]>);

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
              <span className="text-sm text-muted-foreground">Booked ({bookedCount})</span>
            </div>
          </div>
        </div>

        {/* Floor Plan Grid */}
        <div className="bg-muted/30 rounded-xl p-6 border border-border">
          {/* Entrance indicator */}
          <div className="flex justify-center mb-4">
            <Badge variant="outline" className="bg-background">
              Main Entrance
            </Badge>
          </div>
          
          {/* Stalls Grid */}
          <div className="space-y-3">
            {Object.entries(rows).map(([rowIndex, rowStalls]) => (
              <div key={rowIndex} className="flex justify-center gap-2 md:gap-3">
                {rowStalls
                  .sort((a, b) => a.position.col - b.position.col)
                  .map((stall) => (
                    <Tooltip key={stall.id}>
                      <TooltipTrigger asChild>
                        <button
                          className={getStallStyles(stall)}
                          onClick={() => stall.status !== 'booked' && setSelectedStall(stall)}
                          disabled={stall.status === 'booked'}
                        >
                          <span className="text-xs md:text-sm font-medium text-foreground">
                            {stall.number}
                          </span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="text-sm">
                          <p className="font-medium">Stall {stall.number}</p>
                          <p className="text-muted-foreground capitalize">{stall.size} • {stall.status}</p>
                          {stall.status === 'available' && (
                            <p className="text-primary font-medium">{formatPrice(stall.price)}</p>
                          )}
                          {stall.exhibitor && (
                            <p className="text-muted-foreground">{stall.exhibitor}</p>
                          )}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  ))}
              </div>
            ))}
          </div>

          {/* Exit indicator */}
          <div className="flex justify-center mt-4">
            <Badge variant="outline" className="bg-background">
              Emergency Exit
            </Badge>
          </div>
        </div>

        {/* Selected Stall Details */}
        {selectedStall && (
          <div className="bg-card rounded-lg border border-border p-4 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-semibold text-foreground">Stall {selectedStall.number}</h4>
                <p className="text-sm text-muted-foreground capitalize">
                  {selectedStall.size} stall • {selectedStall.status}
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-primary">{formatPrice(selectedStall.price)}</p>
                <p className="text-xs text-muted-foreground">per event</p>
              </div>
            </div>
            
            {selectedStall.status === 'available' && (
              <button className="mt-4 w-full bg-primary text-primary-foreground py-2 rounded-md font-medium hover:bg-primary/90 transition-colors">
                Book This Stall
              </button>
            )}
            
            {selectedStall.status === 'reserved' && (
              <p className="mt-4 text-sm text-amber-600 text-center">
                This stall is temporarily reserved. Contact organizer for availability.
              </p>
            )}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
};

export default StallFloorPlan;
