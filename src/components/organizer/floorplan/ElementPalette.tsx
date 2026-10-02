import { Button } from "@/components/ui/button";
import { ELEMENT_META, ELEMENT_ORDER, type ElementType } from "@/components/floorplan/floorPlanElements";

interface ElementPaletteProps {
  onAdd: (type: ElementType) => void;
  disabled?: boolean;
}

/** Buttons that drop an aisle, entrance, stage... into the middle of the visible plan. */
export function ElementPalette({ onAdd, disabled }: ElementPaletteProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div>
        <h4 className="font-semibold text-sm">Add to plan</h4>
        <p className="text-xs text-muted-foreground mt-0.5">Aisles, entrances, stages and labels. Visitors see them under the stalls.</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {ELEMENT_ORDER.map((type) => {
          const { icon: Icon, name } = ELEMENT_META[type];
          return (
            <Button
              key={type}
              type="button"
              variant="outline"
              className="h-auto flex-col gap-1 px-1 py-2 text-[11px] font-normal leading-tight"
              disabled={disabled}
              onClick={() => onAdd(type)}
              aria-label={`Add ${name.toLowerCase()}`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-center">{name}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
