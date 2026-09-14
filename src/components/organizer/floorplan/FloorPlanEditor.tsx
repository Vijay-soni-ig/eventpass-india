import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, Rocket } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/apiClient";
import type { Stall, StallStatus } from "@/types/exhibitor";
import {
  useFloorPlans,
  useFloorPlan,
  useCreateFloorPlan,
  useAddFloorPlanObject,
  useUpdateFloorPlanObject,
  useDeleteFloorPlanObject,
  usePublishFloorPlan,
  type FloorPlan,
  type FloorPlanObject,
} from "@/hooks/organizer/useFloorPlanLayout";

interface FloorPlanEditorProps {
  exhibitionId: string;
  stalls: Stall[];
  canEdit: boolean;
}

// Mirrors the stall-status color convention already used in StallFloorPlan.tsx
// so the organizer editor and the public map read the same visual language.
const STATUS_STYLES: Record<StallStatus, string> = {
  available: "bg-emerald-500/20 border-emerald-500",
  reserved: "bg-amber-500/20 border-amber-500",
  sold: "bg-destructive/20 border-destructive/50",
};

const NUDGE_STEP = 5;
const NUDGE_STEP_LARGE = 20;
const COMMIT_DEBOUNCE_MS = 400;

function toNumber(value: string | number): number {
  return typeof value === "number" ? value : Number(value);
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

export function FloorPlanEditor({ exhibitionId, stalls, canEdit }: FloorPlanEditorProps) {
  const { data: floorPlans, isLoading: plansLoading, isError: plansError, refetch: refetchPlans } =
    useFloorPlans(exhibitionId);

  const currentPlanSummary = floorPlans?.[0];

  const {
    data: detail,
    isLoading: detailLoading,
    isError: detailError,
    refetch: refetchDetail,
  } = useFloorPlan(exhibitionId, currentPlanSummary?.id);

  if (plansLoading) return <LoadingState label="Loading floor plan..." />;
  if (plansError) {
    return <ErrorState title="Failed to load floor plan" onRetry={() => refetchPlans()} />;
  }

  if (stalls.length === 0) {
    return (
      <EmptyState
        title="No stalls yet"
        description="Create commercial stalls for this exhibition first, then come back here to map them onto a floor plan."
      />
    );
  }

  if (!currentPlanSummary) {
    if (!canEdit) {
      return (
        <EmptyState
          title="No floor plan yet"
          description="The organizer hasn't created a floor plan for this exhibition yet."
        />
      );
    }
    return <CreateFloorPlanForm exhibitionId={exhibitionId} />;
  }

  if (detailLoading) return <LoadingState label="Loading floor plan layout..." />;
  if (detailError || !detail) {
    return <ErrorState title="Failed to load floor plan layout" onRetry={() => refetchDetail()} />;
  }

  return (
    <FloorPlanCanvasEditor
      exhibitionId={exhibitionId}
      plan={detail.floorPlan}
      objects={detail.objects}
      stalls={stalls}
      canEdit={canEdit}
    />
  );
}

function CreateFloorPlanForm({ exhibitionId }: { exhibitionId: string }) {
  const [name, setName] = useState("Main Floor Plan");
  const [canvasWidth, setCanvasWidth] = useState(1000);
  const [canvasHeight, setCanvasHeight] = useState(800);
  const createFloorPlan = useCreateFloorPlan(exhibitionId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Give the floor plan a name");
      return;
    }
    createFloorPlan.mutate(
      { name: name.trim(), canvasWidth, canvasHeight },
      {
        onSuccess: () => toast.success("Floor plan created"),
        onError: (err) => toast.error(errorMessage(err, "Failed to create floor plan")),
      }
    );
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-card border border-border rounded-xl p-6 space-y-4 max-w-md"
    >
      <div>
        <h3 className="font-semibold">Create a floor plan</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Set up the canvas for this exhibition's floor plan. You can map stalls onto it next.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="fp-name">Name</Label>
        <Input id="fp-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="fp-width">Canvas width (px)</Label>
          <Input
            id="fp-width"
            type="number"
            min={1}
            value={canvasWidth}
            onChange={(e) => setCanvasWidth(Number(e.target.value))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fp-height">Canvas height (px)</Label>
          <Input
            id="fp-height"
            type="number"
            min={1}
            value={canvasHeight}
            onChange={(e) => setCanvasHeight(Number(e.target.value))}
          />
        </div>
      </div>
      <Button type="submit" disabled={createFloorPlan.isPending}>
        {createFloorPlan.isPending ? "Creating..." : "Create floor plan"}
      </Button>
    </form>
  );
}

interface LiveObject {
  id: string;
  stallId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  labelVisible: boolean;
}

function normalizeObjects(objects: FloorPlanObject[]): LiveObject[] {
  return objects.map((o) => ({
    id: o.id,
    stallId: o.stallId,
    x: toNumber(o.x),
    y: toNumber(o.y),
    width: toNumber(o.width),
    height: toNumber(o.height),
    rotation: toNumber(o.rotation),
    zIndex: o.zIndex,
    labelVisible: o.labelVisible,
  }));
}

function computeDefaultPosition(
  index: number,
  canvasWidth: number,
  canvasHeight: number
): { x: number; y: number; width: number; height: number } {
  const width = Math.min(100, canvasWidth);
  const height = Math.min(100, canvasHeight);
  const gap = 20;
  const cols = Math.max(1, Math.floor(canvasWidth / (width + gap)));
  const col = index % cols;
  const row = Math.floor(index / cols);
  const x = Math.min(col * (width + gap), Math.max(0, canvasWidth - width));
  const y = Math.min(row * (height + gap), Math.max(0, canvasHeight - height));
  return { x, y, width, height };
}

function FloorPlanCanvasEditor({
  exhibitionId,
  plan,
  objects,
  stalls,
  canEdit,
}: {
  exhibitionId: string;
  plan: FloorPlan;
  objects: FloorPlanObject[];
  stalls: Stall[];
  canEdit: boolean;
}) {
  const isMobile = useIsMobile();
  const canvasWidth = toNumber(plan.canvasWidth);
  const canvasHeight = toNumber(plan.canvasHeight);
  const isDraft = plan.status === "draft";

  const [localObjects, setLocalObjects] = useState<LiveObject[]>(() => normalizeObjects(objects));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    setLocalObjects(normalizeObjects(objects));
  }, [objects]);

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

  const addObject = useAddFloorPlanObject(exhibitionId, plan.id);
  const updateObject = useUpdateFloorPlanObject(exhibitionId, plan.id);
  const deleteObject = useDeleteFloorPlanObject(exhibitionId, plan.id);
  const publishPlan = usePublishFloorPlan(exhibitionId, plan.id);

  const stallById = useMemo(() => new Map(stalls.map((s) => [s.id, s])), [stalls]);
  const mappedStallIds = useMemo(() => new Set(objects.map((o) => o.stallId)), [objects]);
  const unmappedStalls = useMemo(() => stalls.filter((s) => !mappedStallIds.has(s.id)), [stalls, mappedStallIds]);

  const selected = localObjects.find((o) => o.id === selectedId) ?? null;

  const commitTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  function commitObject(id: string, patch: Partial<LiveObject>) {
    updateObject.mutate(
      { objectId: id, ...patch },
      { onError: (err) => toast.error(errorMessage(err, "Failed to update floor plan object")) }
    );
  }

  function scheduleCommit(id: string, patch: Partial<LiveObject>) {
    if (commitTimers.current[id]) clearTimeout(commitTimers.current[id]);
    commitTimers.current[id] = setTimeout(() => {
      delete commitTimers.current[id];
      commitObject(id, patch);
    }, COMMIT_DEBOUNCE_MS);
  }

  useEffect(() => {
    const timers = commitTimers.current;
    return () => {
      Object.values(timers).forEach((t) => clearTimeout(t));
    };
  }, []);

  function clamp(value: number, max: number) {
    return Math.min(Math.max(0, value), Math.max(0, max));
  }

  function handleAddStall(stall: Stall) {
    const { x, y, width, height } = computeDefaultPosition(objects.length, canvasWidth, canvasHeight);
    addObject.mutate(
      { stallId: stall.id, x, y, width, height },
      {
        onSuccess: () => toast.success(`Mapped stall ${stall.code ?? stall.id.slice(0, 6)}`),
        onError: (err) => toast.error(errorMessage(err, "Failed to map stall")),
      }
    );
  }

  function handleRemove(id: string) {
    deleteObject.mutate(id, {
      onSuccess: () => {
        if (selectedId === id) setSelectedId(null);
        toast.success("Removed from floor plan");
      },
      onError: (err) => toast.error(errorMessage(err, "Failed to remove floor plan object")),
    });
  }

  function handleKeyNudge(object: LiveObject, key: string, shiftKey: boolean) {
    const step = shiftKey ? NUDGE_STEP_LARGE : NUDGE_STEP;
    let dx = 0;
    let dy = 0;
    if (key === "ArrowLeft") dx = -step;
    else if (key === "ArrowRight") dx = step;
    else if (key === "ArrowUp") dy = -step;
    else if (key === "ArrowDown") dy = step;
    else return false;

    const nextX = clamp(object.x + dx, canvasWidth - object.width);
    const nextY = clamp(object.y + dy, canvasHeight - object.height);
    setLocalObjects((prev) => prev.map((o) => (o.id === object.id ? { ...o, x: nextX, y: nextY } : o)));
    scheduleCommit(object.id, { x: nextX, y: nextY });
    return true;
  }

  function handleObjectKeyDown(e: React.KeyboardEvent, object: LiveObject) {
    if (!canEdit || !isDraft) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      handleRemove(object.id);
      return;
    }
    if (handleKeyNudge(object, e.key, e.shiftKey)) {
      e.preventDefault();
    }
  }

  // Mouse drag / resize — commits only on mouseup, constrained to canvas bounds
  // (the server independently re-validates bounds on write).
  const dragState = useRef<{
    id: string;
    mode: "drag" | "resize";
    startX: number;
    startY: number;
    startObj: LiveObject;
  } | null>(null);

  function handleObjectMouseDown(e: React.MouseEvent, object: LiveObject, mode: "drag" | "resize") {
    if (!canEdit || !isDraft) return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(object.id);
    dragState.current = { id: object.id, mode, startX: e.clientX, startY: e.clientY, startObj: object };
    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowMouseUp);
  }

  function handleWindowMouseMove(e: MouseEvent) {
    const drag = dragState.current;
    if (!drag) return;
    const dx = (e.clientX - drag.startX) / scale;
    const dy = (e.clientY - drag.startY) / scale;
    setLocalObjects((prev) =>
      prev.map((o) => {
        if (o.id !== drag.id) return o;
        if (drag.mode === "drag") {
          return {
            ...o,
            x: clamp(drag.startObj.x + dx, canvasWidth - o.width),
            y: clamp(drag.startObj.y + dy, canvasHeight - o.height),
          };
        }
        const width = Math.max(20, Math.min(drag.startObj.width + dx, canvasWidth - o.x));
        const height = Math.max(20, Math.min(drag.startObj.height + dy, canvasHeight - o.y));
        return { ...o, width, height };
      })
    );
  }

  function handleWindowMouseUp() {
    const drag = dragState.current;
    dragState.current = null;
    window.removeEventListener("mousemove", handleWindowMouseMove);
    window.removeEventListener("mouseup", handleWindowMouseUp);
    if (!drag) return;
    setLocalObjects((prev) => {
      const current = prev.find((o) => o.id === drag.id);
      if (current) {
        commitObject(drag.id, {
          x: current.x,
          y: current.y,
          width: current.width,
          height: current.height,
        });
      }
      return prev;
    });
  }

  const canPublish = canEdit && isDraft && objects.length > 0 && !publishPlan.isPending;

  function handlePublish() {
    publishPlan.mutate(undefined, {
      onSuccess: () => toast.success("Floor plan published"),
      onError: (err) => toast.error(errorMessage(err, "Failed to publish floor plan")),
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-card border border-border rounded-xl p-4">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold">{plan.name}</h3>
          <Badge variant={plan.status === "published" ? "success" : plan.status === "archived" ? "outline" : "secondary"}>
            {plan.status === "draft" ? "Draft" : plan.status === "published" ? "Published" : "Archived"}
          </Badge>
        </div>
        {canEdit && (
          <div className="flex flex-col items-end gap-1">
            <Button onClick={handlePublish} disabled={!canPublish}>
              <Rocket className="w-4 h-4 mr-2" />
              {publishPlan.isPending ? "Publishing..." : "Publish"}
            </Button>
            {isDraft && objects.length === 0 && (
              <p className="text-xs text-muted-foreground">Map at least one stall before publishing</p>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {isMobile ? (
          <MobileObjectList
            objects={localObjects}
            stallById={stallById}
            canEdit={canEdit && isDraft}
            onCommit={commitObject}
            onRemove={handleRemove}
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
          />
        ) : (
          <div
            ref={containerRef}
            className="flex-1 bg-muted/30 border border-border rounded-xl overflow-hidden"
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
                  backgroundImage: plan.backgroundUrl ? `url(${plan.backgroundUrl})` : undefined,
                  backgroundSize: "cover",
                }}
                onClick={() => setSelectedId(null)}
              >
                {localObjects.map((object) => {
                  const stall = stallById.get(object.stallId);
                  return (
                    <div
                      key={object.id}
                      tabIndex={0}
                      role="button"
                      aria-label={`Stall ${stall?.code ?? object.stallId.slice(0, 6)}`}
                      className={cn(
                        "absolute border-2 rounded-md flex flex-col items-center justify-center select-none",
                        stall ? STATUS_STYLES[stall.status] : "bg-card border-border",
                        canEdit && isDraft && "cursor-move",
                        selectedId === object.id && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                      )}
                      style={{
                        left: object.x,
                        top: object.y,
                        width: object.width,
                        height: object.height,
                        zIndex: object.zIndex,
                      }}
                      onMouseDown={(e) => handleObjectMouseDown(e, object, "drag")}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(object.id);
                      }}
                      onKeyDown={(e) => handleObjectKeyDown(e, object)}
                    >
                      {object.labelVisible && (
                        <span className="text-xs font-mono font-semibold pointer-events-none">
                          {stall?.code ?? object.stallId.slice(0, 6)}
                        </span>
                      )}
                      {canEdit && isDraft && (
                        <div
                          className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize bg-primary/30 rounded-tl"
                          onMouseDown={(e) => handleObjectMouseDown(e, object, "resize")}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div className="w-full lg:w-72 space-y-4">
          {canEdit && isDraft && (
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <h4 className="font-semibold text-sm">Unmapped stalls</h4>
              {unmappedStalls.length === 0 ? (
                <p className="text-xs text-muted-foreground">All stalls are mapped on this plan.</p>
              ) : (
                <ul className="space-y-2 max-h-48 overflow-auto">
                  {unmappedStalls.map((stall) => (
                    <li key={stall.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-mono">{stall.code ?? stall.id.slice(0, 6)}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAddStall(stall)}
                        disabled={addObject.isPending}
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        Add
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {selected && !isMobile && (
            <PropertiesPanel
              key={selected.id}
              object={selected}
              stall={stallById.get(selected.stallId)}
              canEdit={canEdit && isDraft}
              canvasWidth={canvasWidth}
              canvasHeight={canvasHeight}
              onCommit={(patch) => {
                setLocalObjects((prev) => prev.map((o) => (o.id === selected.id ? { ...o, ...patch } : o)));
                commitObject(selected.id, patch);
              }}
              onRemove={() => handleRemove(selected.id)}
            />
          )}

          <div className="bg-card border border-border rounded-xl p-4 space-y-2">
            <p className="text-sm font-medium">Legend</p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm">
                <div className="w-4 h-4 rounded bg-emerald-500/40 border border-emerald-500" />
                <span className="text-muted-foreground">Available</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className="w-4 h-4 rounded bg-amber-500/40 border border-amber-500" />
                <span className="text-muted-foreground">Reserved</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className="w-4 h-4 rounded bg-destructive/40 border border-destructive/50" />
                <span className="text-muted-foreground">Sold</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PropertiesPanel({
  object,
  stall,
  canEdit,
  canvasWidth,
  canvasHeight,
  onCommit,
  onRemove,
}: {
  object: LiveObject;
  stall: Stall | undefined;
  canEdit: boolean;
  canvasWidth: number;
  canvasHeight: number;
  onCommit: (patch: Partial<LiveObject>) => void;
  onRemove: () => void;
}) {
  const [form, setForm] = useState({
    x: object.x,
    y: object.y,
    width: object.width,
    height: object.height,
    rotation: object.rotation,
  });

  // Parent remounts this panel (`key={selected.id}`) whenever the selected
  // object changes, so this effect only needs to reseed local form state
  // when that identity changes — not on every object.x/y/etc. update caused
  // by our own in-flight commits, which would otherwise clobber the field
  // the user is actively editing.
  useEffect(() => {
    setForm({ x: object.x, y: object.y, width: object.width, height: object.height, rotation: object.rotation });
  }, [object.id]);

  function commit() {
    const x = Math.min(Math.max(0, form.x), Math.max(0, canvasWidth - form.width));
    const y = Math.min(Math.max(0, form.y), Math.max(0, canvasHeight - form.height));
    const width = Math.min(Math.max(1, form.width), canvasWidth);
    const height = Math.min(Math.max(1, form.height), canvasHeight);
    onCommit({ x, y, width, height, rotation: form.rotation });
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <h4 className="font-semibold text-sm">
        Stall {stall?.code ?? object.stallId.slice(0, 6)}
      </h4>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">X</Label>
          <Input
            type="number"
            disabled={!canEdit}
            value={form.x}
            onChange={(e) => setForm((f) => ({ ...f, x: Number(e.target.value) }))}
            onBlur={commit}
            onKeyDown={(e) => e.key === "Enter" && commit()}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Y</Label>
          <Input
            type="number"
            disabled={!canEdit}
            value={form.y}
            onChange={(e) => setForm((f) => ({ ...f, y: Number(e.target.value) }))}
            onBlur={commit}
            onKeyDown={(e) => e.key === "Enter" && commit()}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Width</Label>
          <Input
            type="number"
            disabled={!canEdit}
            value={form.width}
            onChange={(e) => setForm((f) => ({ ...f, width: Number(e.target.value) }))}
            onBlur={commit}
            onKeyDown={(e) => e.key === "Enter" && commit()}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Height</Label>
          <Input
            type="number"
            disabled={!canEdit}
            value={form.height}
            onChange={(e) => setForm((f) => ({ ...f, height: Number(e.target.value) }))}
            onBlur={commit}
            onKeyDown={(e) => e.key === "Enter" && commit()}
          />
        </div>
        <div className="space-y-1 col-span-2">
          <Label className="text-xs">Rotation</Label>
          <Input
            type="number"
            disabled={!canEdit}
            value={form.rotation}
            onChange={(e) => setForm((f) => ({ ...f, rotation: Number(e.target.value) }))}
            onBlur={commit}
            onKeyDown={(e) => e.key === "Enter" && commit()}
          />
        </div>
      </div>
      {canEdit && (
        <Button variant="destructive" size="sm" className="w-full" onClick={onRemove}>
          <Trash2 className="w-3.5 h-3.5 mr-2" />
          Remove from map
        </Button>
      )}
    </div>
  );
}

function MobileObjectList({
  objects,
  stallById,
  canEdit,
  onCommit,
  onRemove,
  canvasWidth,
  canvasHeight,
}: {
  objects: LiveObject[];
  stallById: Map<string, Stall>;
  canEdit: boolean;
  onCommit: (id: string, patch: Partial<LiveObject>) => void;
  onRemove: (id: string) => void;
  canvasWidth: number;
  canvasHeight: number;
}) {
  if (objects.length === 0) {
    return (
      <div className="flex-1 bg-card border border-border rounded-xl p-6">
        <p className="text-sm text-muted-foreground text-center">No stalls mapped on this plan yet.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-3">
      {objects.map((object) => (
        <MobileObjectRow
          key={object.id}
          object={object}
          stall={stallById.get(object.stallId)}
          canEdit={canEdit}
          canvasWidth={canvasWidth}
          canvasHeight={canvasHeight}
          onCommit={(patch) => onCommit(object.id, patch)}
          onRemove={() => onRemove(object.id)}
        />
      ))}
    </div>
  );
}

function MobileObjectRow({
  object,
  stall,
  canEdit,
  canvasWidth,
  canvasHeight,
  onCommit,
  onRemove,
}: {
  object: LiveObject;
  stall: Stall | undefined;
  canEdit: boolean;
  canvasWidth: number;
  canvasHeight: number;
  onCommit: (patch: Partial<LiveObject>) => void;
  onRemove: () => void;
}) {
  const [form, setForm] = useState({ x: object.x, y: object.y, width: object.width, height: object.height });

  useEffect(() => {
    setForm({ x: object.x, y: object.y, width: object.width, height: object.height });
  }, [object.x, object.y, object.width, object.height]);

  function commit() {
    const width = Math.min(Math.max(1, form.width), canvasWidth);
    const height = Math.min(Math.max(1, form.height), canvasHeight);
    const x = Math.min(Math.max(0, form.x), Math.max(0, canvasWidth - width));
    const y = Math.min(Math.max(0, form.y), Math.max(0, canvasHeight - height));
    onCommit({ x, y, width, height });
  }

  return (
    <div className={cn("border rounded-lg p-3 space-y-2", stall ? STATUS_STYLES[stall.status] : "border-border")}>
      <div className="flex items-center justify-between">
        <span className="font-mono font-semibold text-sm">{stall?.code ?? object.stallId.slice(0, 6)}</span>
        {canEdit && (
          <Button variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
      <div className="grid grid-cols-4 gap-2">
        {(["x", "y", "width", "height"] as const).map((field) => (
          <div key={field} className="space-y-1">
            <Label className="text-xs capitalize">{field}</Label>
            <Input
              type="number"
              disabled={!canEdit}
              value={form[field]}
              onChange={(e) => setForm((f) => ({ ...f, [field]: Number(e.target.value) }))}
              onBlur={commit}
              onKeyDown={(e) => e.key === "Enter" && commit()}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
