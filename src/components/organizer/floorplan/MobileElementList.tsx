import { useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { elementMeta } from "@/components/floorplan/floorPlanElements";
import { ElementPanel, type ElementPatch } from "./ElementPanel";
import type { LiveElement } from "./useElementsEditor";

interface MobileElementListProps {
  elements: LiveElement[];
  /** The element whose form is open, if any. */
  selectedId: string | null;
  canEdit: boolean;
  canvasWidth: number;
  canvasHeight: number;
  onSelect: (id: string) => void;
  onDeselect: () => void;
  onCommit: (id: string, patch: ElementPatch) => void;
  onRemove: (id: string) => void;
}

/**
 * Plan elements (aisles, entrances, stages, labels...) on a phone, where the canvas is not
 * shown. Like the stall rows beside it this is form based: tap an element to open the same
 * properties form the desktop uses (text, position, size, rotation, stacking, remove).
 */
export function MobileElementList({
  elements,
  selectedId,
  canEdit,
  canvasWidth,
  canvasHeight,
  onSelect,
  onDeselect,
  onCommit,
  onRemove,
}: MobileElementListProps) {
  const openRow = useRef<HTMLLIElement | null>(null);

  // A newly added element opens below the "Add to plan" buttons the user just tapped; bring it into view.
  useEffect(() => {
    if (selectedId) openRow.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  return (
    <section className="bg-card border border-border rounded-xl p-4 space-y-3" aria-label="Plan elements">
      <h4 className="font-semibold text-sm">Plan elements ({elements.length})</h4>
      {elements.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {canEdit ? "No aisles, entrances or labels yet. Use Add to plan below." : "No aisles, entrances or labels on this plan."}
        </p>
      ) : (
        <ul className="space-y-2">
          {elements.map((element) => {
            const meta = elementMeta(element.type);
            const Icon = meta.icon;
            const open = element.id === selectedId;
            return (
              <li key={element.id} ref={open ? openRow : undefined} className="border border-border rounded-lg">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-3 py-3 text-left"
                  aria-expanded={open}
                  onClick={() => (open ? onDeselect() : onSelect(element.id))}
                >
                  <Icon className="w-4 h-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{meta.name}</span>
                    {element.label?.trim() && <span className="block truncate text-xs text-muted-foreground">{element.label}</span>}
                  </span>
                  <ChevronDown className={cn("w-4 h-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
                </button>
                {open && (
                  <div className="px-3 pb-3">
                    <ElementPanel
                      element={element}
                      canEdit={canEdit}
                      canvasWidth={canvasWidth}
                      canvasHeight={canvasHeight}
                      siblingZIndexes={elements.filter((o) => o.id !== element.id).map((o) => o.zIndex)}
                      onCommit={(patch) => onCommit(element.id, patch)}
                      onRemove={() => onRemove(element.id)}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
