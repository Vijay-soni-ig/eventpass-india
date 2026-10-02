import { useState, type ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PublicFloorPlan } from "@/hooks/usePublicExhibitions";

interface HallPlansProps {
  /** One published plan per hall, in hall order. */
  floorPlans: PublicFloorPlan[];
  /** Renders the plan for the selected hall. */
  children: (plan: PublicFloorPlan) => ReactNode;
}

/**
 * Shows one hall's plan at a time. With a single hall there is nothing to choose,
 * so no tabs appear and the page looks exactly as it did before halls existed.
 */
export function HallPlans({ floorPlans, children }: HallPlansProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  if (floorPlans.length === 0) return null;

  const keyOf = (plan: PublicFloorPlan) => plan.hall?.id ?? plan.id;
  const selected = floorPlans.find((plan) => keyOf(plan) === selectedKey) ?? floorPlans[0];

  if (floorPlans.length === 1) return <>{children(selected)}</>;

  return (
    <div className="space-y-4">
      <Tabs value={keyOf(selected)} onValueChange={setSelectedKey}>
        <TabsList className="h-auto flex-wrap justify-start" aria-label="Halls">
          {floorPlans.map((plan) => {
            const available = plan.objects.filter((o) => o.stall.status === "available").length;
            return (
              <TabsTrigger key={keyOf(plan)} value={keyOf(plan)} className="gap-2">
                {plan.hall?.name ?? plan.name}
                <span className="text-xs font-normal text-muted-foreground">{available} available</span>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>
      {/* Keyed by plan so each hall starts with its own zoom, filters and selection. */}
      <div key={selected.id}>{children(selected)}</div>
    </div>
  );
}
