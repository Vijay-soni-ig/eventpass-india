import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, Rocket, ChevronsUp, ChevronsDown, ZoomIn, ZoomOut, Maximize, Grid3x3, LayoutGrid, Pencil, ImagePlus, Check } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn, resolveAssetUrl } from "@/lib/utils";
import { ApiError } from "@/lib/apiClient";
import type { Stall, StallStatus } from "@/types/exhibitor";
import {
  useFloorPlans,
  useFloorPlan,
  useCloneFloorPlan,
  useAddFloorPlanObject,
  useBulkAddFloorPlanObjects,
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
  backgroundUrl?: string | null;
  /** Uploads a new background image onto the draft; omitted when the user cannot manage stalls. */
  onReplaceBackground?: (file: File) => void;
  replacingBackground?: boolean;
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

export function FloorPlanEditor({ exhibitionId, stalls, canEdit, backgroundUrl, onReplaceBackground, replacingBackground }: FloorPlanEditorProps) {
  const { data: floorPlans, isLoading: plansLoading, isError: plansError, error: plansErrorDetail, refetch: refetchPlans } =
    useFloorPlans(exhibitionId);

  // Prefer an editable draft. A published/archived plan may be the newest
  // record, but it is intentionally immutable; choosing it first can make
  // the editor appear unusable even when a draft exists.
  const currentPlanSummary =
    floorPlans?.find((plan) => plan.status === "draft") ??
    floorPlans?.find((plan) => plan.status === "published");

  const {
    data: detail,
    isLoading: detailLoading,
    isError: detailError,
    error: detailErrorDetail,
    refetch: refetchDetail,
  } = useFloorPlan(exhibitionId, currentPlanSummary?.id);

  if (plansLoading) return <LoadingState label="Loading floor plan..." />;
  if (plansError) {
    const message = plansErrorDetail instanceof ApiError
      ? `Unable to load this exhibition's floor plan (${plansErrorDetail.status}). ${plansErrorDetail.message}`
      : plansErrorDetail instanceof Error
        ? plansErrorDetail.message
        : "The floor plan could not be loaded.";
    return (
      <ErrorState
        title="Failed to load floor plan"
        description={message}
        onRetry={() => refetchPlans()}
      />
    );
  }

  if (!currentPlanSummary) {
    // The workspace page shows its own "create your floor plan" step before
    // this component is reached, so this is only a read-only/empty fallback.
    return (
      <EmptyState
        title="No floor plan yet"
        description="The organizer hasn't created a floor plan for this exhibition yet."
      />
    );
  }

  if (detailLoading) return <LoadingState label="Loading floor plan layout..." />;
  if (detailError || !detail) {
    const message = detailErrorDetail instanceof ApiError
      ? `Unable to load this floor plan (${detailErrorDetail.status}). ${detailErrorDetail.message}`
      : detailErrorDetail instanceof Error
        ? detailErrorDetail.message
        : "The floor plan layout could not be loaded.";
    return (
      <ErrorState
        title="Failed to load floor plan layout"
        description={message}
        onRetry={() => refetchDetail()}
      />
    );
  }

  return (
    <FloorPlanCanvasEditor
      key={detail.floorPlan.id}
      exhibitionId={exhibitionId}
      plan={detail.floorPlan}
      objects={detail.objects}
      stalls={stalls}
      canEdit={canEdit}
      backgroundUrl={backgroundUrl}
      hasLivePlan={!!floorPlans?.some((plan) => plan.status === "published")}
      onReplaceBackground={onReplaceBackground}
      replacingBackground={replacingBackground}
    />
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

const GRID_SIZE = 10;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.25;
const MAX_BULK_PLACE = 500;

function snapToGrid(value: number, enabled: boolean): number {
  return enabled ? Math.round(value / GRID_SIZE) * GRID_SIZE : value;
}

/**
 * Lays `count` square stalls out in a grid in the free area below everything
 * already on the canvas, shrinking the cells until they all fit. Returns null
 * when there is no room, so the caller can say so instead of placing stalls
 * outside the canvas (the server rejects out-of-bounds objects).
 */
function layoutUnmapped(
  count: number,
  canvasWidth: number,
  canvasHeight: number,
  existing: LiveObject[]
): Array<{ x: number; y: number; size: number }> | null {
  const margin = 20;
  const gap = 10;
  const top = existing.length > 0 ? Math.max(...existing.map((o) => o.y + o.height)) + margin : margin;
  const availableWidth = canvasWidth - margin * 2;
  const availableHeight = canvasHeight - top - margin;
  for (let size = 100; size >= 30; size -= 10) {
    const cols = Math.floor((availableWidth + gap) / (size + gap));
    if (cols < 1) continue;
    const rows = Math.ceil(count / cols);
    if (rows * (size + gap) - gap > availableHeight) continue;
    return Array.from({ length: count }, (_, i) => ({
      x: margin + (i % cols) * (size + gap),
      y: top + Math.floor(i / cols) * (size + gap),
      size,
    }));
  }
  return null;
}

function FloorPlanCanvasEditor({
  exhibitionId,
  plan,
  objects,
  stalls,
  canEdit,
  backgroundUrl,
  hasLivePlan,
  onReplaceBackground,
  replacingBackground,
}: {
  exhibitionId: string;
  plan: FloorPlan;
  objects: FloorPlanObject[];
  stalls: Stall[];
  canEdit: boolean;
  backgroundUrl?: string | null;
  hasLivePlan: boolean;
  onReplaceBackground?: (file: File) => void;
  replacingBackground?: boolean;
}) {
  const isMobile = useIsMobile();
  const canvasWidth = toNumber(plan.canvasWidth);
  const canvasHeight = toNumber(plan.canvasHeight);
  const isDraft = plan.status === "draft";
  const isPublished = plan.status === "published";
  const editable = canEdit && isDraft;
  const resolvedBackground = plan.backgroundUrl ? resolveAssetUrl(plan.backgroundUrl) : backgroundUrl ? resolveAssetUrl(backgroundUrl) : null;

  const [localObjects, setLocalObjects] = useState<LiveObject[]>(() => normalizeObjects(objects));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [fitScale, setFitScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [snap, setSnap] = useState(false);
  const scale = fitScale * zoom;

  // The latest values, readable from window-level drag listeners and debounced
  // timers that were created in an earlier render.
  const localObjectsRef = useRef(localObjects);
  const versionRef = useRef(plan.version);
  useEffect(() => {
    localObjectsRef.current = localObjects;
  }, [localObjects]);
  useEffect(() => {
    versionRef.current = plan.version;
  }, [plan.version]);

  useEffect(() => {
    setLocalObjects(normalizeObjects(objects));
  }, [objects]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateScale = () => {
      // 32px = the p-4 padding around the canvas inside the scroll container.
      const available = el.clientWidth - 32;
      if (available > 0) setFitScale(Math.min(1, available / canvasWidth));
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(el);
    return () => observer.disconnect();
  }, [canvasWidth, isMobile]);

  const addObject = useAddFloorPlanObject(exhibitionId, plan.id);
  const bulkAddObjects = useBulkAddFloorPlanObjects(exhibitionId, plan.id);
  const updateObject = useUpdateFloorPlanObject(exhibitionId, plan.id);
  const deleteObject = useDeleteFloorPlanObject(exhibitionId, plan.id);
  const publishPlan = usePublishFloorPlan(exhibitionId, plan.id);
  const cloneFloorPlan = useCloneFloorPlan(exhibitionId);

  const stallById = useMemo(() => new Map(stalls.map((s) => [s.id, s])), [stalls]);
  const mappedStallIds = useMemo(() => new Set(objects.map((o) => o.stallId)), [objects]);
  const unmappedStalls = useMemo(
    () =>
      stalls
        .filter((s) => !mappedStallIds.has(s.id))
        .sort((a, b) => (a.code ?? "").localeCompare(b.code ?? "", undefined, { numeric: true })),
    [stalls, mappedStallIds]
  );
  const placedCount = stalls.length - unmappedStalls.length;

  const selected = localObjects.find((o) => o.id === selectedId) ?? null;

  const commitTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  function commitObject(id: string, patch: Partial<LiveObject>) {
    updateObject.mutate(
      { objectId: id, expectedVersion: versionRef.current, ...patch },
      {
        onError: (err) => {
          toast.error(errorMessage(err, "Floor plan changed. Refreshing the editor."));
        },
      }
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
      { expectedVersion: versionRef.current, stallId: stall.id, x, y, width, height },
      {
        onSuccess: (created) => {
          setSelectedId(created.id);
          toast.success(`Placed stall ${stall.code ?? stall.id.slice(0, 6)}. Drag it into position.`);
        },
        onError: (err) => toast.error(errorMessage(err, "Failed to map stall")),
      }
    );
  }

  function handlePlaceAll() {
    const batch = unmappedStalls.slice(0, MAX_BULK_PLACE);
    const slots = layoutUnmapped(batch.length, canvasWidth, canvasHeight, localObjects);
    if (!slots) {
      toast.error("There isn't enough free space on the canvas. Place the remaining stalls one by one, or remove some from the map.");
      return;
    }
    bulkAddObjects.mutate(
      {
        expectedVersion: versionRef.current,
        objects: batch.map((stall, i) => ({
          stallId: stall.id,
          x: slots[i].x,
          y: slots[i].y,
          width: slots[i].size,
          height: slots[i].size,
        })),
      },
      {
        onSuccess: (result) => {
          const rest = unmappedStalls.length - result.created;
          toast.success(
            rest > 0
              ? `Placed ${result.created} stalls. ${rest} more can be placed in another pass.`
              : `Placed ${result.created} stalls. Drag them into position on the plan.`
          );
        },
        onError: (err) => toast.error(errorMessage(err, "Failed to place stalls")),
      }
    );
  }

  function handleEditPublished() {
    cloneFloorPlan.mutate(plan.id, {
      onSuccess: () =>
        toast.success("Draft created. Exhibitors and visitors keep seeing the published plan until you publish your changes."),
      onError: (err) => toast.error(errorMessage(err, "Failed to create a draft")),
    });
  }

  function handleRemove(id: string) {
    deleteObject.mutate({ objectId: id, expectedVersion: versionRef.current }, {
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
    if (!editable) return;
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
    if (!editable) return;
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
            x: clamp(snapToGrid(drag.startObj.x + dx, snap), canvasWidth - o.width),
            y: clamp(snapToGrid(drag.startObj.y + dy, snap), canvasHeight - o.height),
          };
        }
        const width = Math.max(20, Math.min(snapToGrid(drag.startObj.width + dx, snap), canvasWidth - o.x));
        const height = Math.max(20, Math.min(snapToGrid(drag.startObj.height + dy, snap), canvasHeight - o.y));
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
    // Read the latest positions from a ref rather than from inside a state
    // updater: updaters must be pure, and React may run them twice.
    const current = localObjectsRef.current.find((o) => o.id === drag.id);
    if (!current) return;
    const unchanged =
      current.x === drag.startObj.x &&
      current.y === drag.startObj.y &&
      current.width === drag.startObj.width &&
      current.height === drag.startObj.height;
    if (unchanged) return;
    commitObject(drag.id, { x: current.x, y: current.y, width: current.width, height: current.height });
  }

  const canPublish = editable && objects.length > 0 && !publishPlan.isPending;

  function handlePublish() {
    publishPlan.mutate(versionRef.current, {
      onSuccess: () => toast.success("Floor plan published"),
      onError: (err) => toast.error(errorMessage(err, "Failed to publish floor plan")),
    });
  }

  const publishHint = !isDraft
    ? isPublished
      ? "Exhibitors and visitors see this version. Editing creates a draft copy."
      : null
    : objects.length === 0
      ? "Place at least one stall to publish"
      : unmappedStalls.length > 0
        ? `${unmappedStalls.length} ${unmappedStalls.length === 1 ? "stall isn't" : "stalls aren't"} on the map yet`
        : "Everything is placed. Ready to publish.";

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold">{plan.name}</h3>
            <Badge variant={plan.status === "published" ? "success" : plan.status === "archived" ? "outline" : "secondary"}>
              {plan.status === "draft" ? "Draft" : plan.status === "published" ? "Published" : "Archived"}
            </Badge>
          </div>
          {canEdit && (
            <div className="flex flex-col items-end gap-1">
              {isDraft ? (
                <Button onClick={handlePublish} disabled={!canPublish}>
                  <Rocket className="w-4 h-4 mr-2" />
                  {publishPlan.isPending ? "Publishing..." : "Publish"}
                </Button>
              ) : isPublished ? (
                <Button onClick={handleEditPublished} disabled={cloneFloorPlan.isPending}>
                  <Pencil className="w-4 h-4 mr-2" />
                  {cloneFloorPlan.isPending ? "Creating draft..." : "Edit plan"}
                </Button>
              ) : null}
              {publishHint && <p className="text-xs text-muted-foreground">{publishHint}</p>}
            </div>
          )}
        </div>

        <ol className="grid gap-3 sm:grid-cols-3">
          <Step
            number={1}
            title="Background"
            detail={resolvedBackground ? "Venue image added" : "Optional"}
            done={!!resolvedBackground}
          />
          <Step
            number={2}
            title="Place stalls"
            detail={stalls.length === 0 ? "No stalls created yet" : `${placedCount} of ${stalls.length} placed`}
            done={stalls.length > 0 && unmappedStalls.length === 0}
          >
            {stalls.length > 0 && <Progress className="h-1.5" value={(placedCount / stalls.length) * 100} />}
          </Step>
          <Step number={3} title="Publish" detail={isPublished ? "Live for visitors" : "Not published yet"} done={isPublished} />
        </ol>

        {isDraft && hasLivePlan && (
          <p className="text-sm bg-warning/10 text-warning border border-warning/20 rounded-lg p-3">
            You're editing a draft. Exhibitors and visitors still see the previously published plan until you publish this one.
          </p>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {isMobile ? (
          <MobileObjectList
            objects={localObjects}
            stallById={stallById}
            canEdit={editable}
            onCommit={commitObject}
            onRemove={handleRemove}
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
          />
        ) : (
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2 bg-card border border-border rounded-xl p-2">
              <Button
                type="button"
                size="icon"
                variant="outline"
                aria-label="Zoom out"
                disabled={zoom <= MIN_ZOOM}
                onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z / ZOOM_STEP))}
              >
                <ZoomOut className="w-4 h-4" />
              </Button>
              <span className="text-sm tabular-nums w-12 text-center" aria-live="polite">
                {Math.round(scale * 100)}%
              </span>
              <Button
                type="button"
                size="icon"
                variant="outline"
                aria-label="Zoom in"
                disabled={zoom >= MAX_ZOOM}
                onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z * ZOOM_STEP))}
              >
                <ZoomIn className="w-4 h-4" />
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setZoom(1)} disabled={zoom === 1}>
                <Maximize className="w-4 h-4 mr-1" />
                Fit
              </Button>
              {editable && (
                <Button
                  type="button"
                  size="sm"
                  variant={snap ? "secondary" : "outline"}
                  aria-pressed={snap}
                  onClick={() => setSnap((v) => !v)}
                >
                  <Grid3x3 className="w-4 h-4 mr-1" />
                  Snap to grid
                </Button>
              )}
              {editable && onReplaceBackground && (
                <Button type="button" size="sm" variant="outline" className="ml-auto" asChild disabled={replacingBackground}>
                  <label className="cursor-pointer">
                    <ImagePlus className="w-4 h-4 mr-1" />
                    {replacingBackground ? "Uploading..." : resolvedBackground ? "Replace background" : "Add background"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      disabled={replacingBackground}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) onReplaceBackground(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </Button>
              )}
            </div>

            <div ref={containerRef} className="bg-muted/30 border border-border rounded-xl overflow-auto max-h-[75vh]">
              <div className="p-4">
                <div style={{ width: canvasWidth * scale, height: canvasHeight * scale }}>
                  <div
                    className="relative bg-card border border-border rounded-lg"
                    style={{
                      width: canvasWidth,
                      height: canvasHeight,
                      transform: `scale(${scale})`,
                      transformOrigin: "top left",
                      backgroundImage: resolvedBackground ? `url(${resolvedBackground})` : undefined,
                      backgroundSize: "contain",
                      backgroundRepeat: "no-repeat",
                      backgroundPosition: "center",
                    }}
                    onClick={() => setSelectedId(null)}
                  >
                    {editable && snap && (
                      <div
                        aria-hidden
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          backgroundImage:
                            "linear-gradient(to right, rgba(100,116,139,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(100,116,139,0.18) 1px, transparent 1px)",
                          backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
                        }}
                      />
                    )}
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
                            editable && "cursor-move",
                            selectedId === object.id && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                          )}
                          style={{
                            left: object.x,
                            top: object.y,
                            width: object.width,
                            height: object.height,
                            zIndex: object.zIndex,
                            transform: object.rotation ? `rotate(${object.rotation}deg)` : undefined,
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
                          {editable && (
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
            </div>
          </div>
        )}

        <div className="w-full lg:w-72 space-y-4">
          {editable && (
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <h4 className="font-semibold text-sm">Stalls to place</h4>
              {unmappedStalls.length === 0 ? (
                stalls.length === 0 ? (
                  // Nothing can be placed (and no Stall Properties panel can open) until the
                  // exhibition has stalls; say so and link to where they are created.
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      This exhibition has no stalls yet. Add stalls first, then place them on this plan.
                    </p>
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/organizer/stalls?exhibitionId=${exhibitionId}`}>
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        Add stalls
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-primary" />
                    All stalls are placed on this plan.
                  </p>
                )
              ) : (
                <>
                  {unmappedStalls.length > 1 && (
                    <div className="space-y-1.5">
                      <Button size="sm" className="w-full" onClick={handlePlaceAll} disabled={bulkAddObjects.isPending || addObject.isPending}>
                        <LayoutGrid className="w-3.5 h-3.5 mr-1.5" />
                        {bulkAddObjects.isPending ? "Placing..." : `Place all (${unmappedStalls.length})`}
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        Puts them in a grid below your existing stalls. Then drag each one into position.
                      </p>
                    </div>
                  )}
                  <ul className="space-y-2 max-h-48 overflow-auto">
                    {unmappedStalls.map((stall) => (
                      <li key={stall.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-mono">{stall.code ?? stall.id.slice(0, 6)}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAddStall(stall)}
                          disabled={addObject.isPending || bulkAddObjects.isPending}
                        >
                          <Plus className="w-3.5 h-3.5 mr-1" />
                          Place
                        </Button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          {selected && !isMobile && (
            <PropertiesPanel
              key={selected.id}
              object={selected}
              stall={stallById.get(selected.stallId)}
              canEdit={editable}
              canvasWidth={canvasWidth}
              canvasHeight={canvasHeight}
              siblingZIndexes={localObjects.filter((o) => o.id !== selected.id).map((o) => o.zIndex)}
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

function Step({
  number,
  title,
  detail,
  done,
  children,
}: {
  number: number;
  title: string;
  detail: string;
  done: boolean;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={cn(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
          done ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"
        )}
        aria-hidden
      >
        {done ? <Check className="w-3.5 h-3.5" /> : number}
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-sm font-medium leading-tight">{title}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
        {children}
      </div>
    </li>
  );
}

function PropertiesPanel({
  object,
  stall,
  canEdit,
  canvasWidth,
  canvasHeight,
  siblingZIndexes,
  onCommit,
  onRemove,
}: {
  object: LiveObject;
  stall: Stall | undefined;
  canEdit: boolean;
  canvasWidth: number;
  canvasHeight: number;
  siblingZIndexes: number[];
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

      <div className="space-y-1">
        <Label className="text-xs">Stacking order</Label>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="flex-1"
            disabled={!canEdit}
            onClick={() => onCommit({ zIndex: Math.max(0, ...siblingZIndexes, object.zIndex) + 1 })}
          >
            <ChevronsUp className="w-3.5 h-3.5 mr-1" />
            Bring to front
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="flex-1"
            disabled={!canEdit}
            onClick={() => onCommit({ zIndex: Math.min(0, ...siblingZIndexes, object.zIndex) - 1 })}
          >
            <ChevronsDown className="w-3.5 h-3.5 mr-1" />
            Send to back
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Label htmlFor={`label-visible-${object.id}`} className="text-xs">
          Show stall label on map
        </Label>
        <Switch
          id={`label-visible-${object.id}`}
          disabled={!canEdit}
          checked={object.labelVisible}
          onCheckedChange={(checked) => onCommit({ labelVisible: checked })}
        />
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
          siblingZIndexes={objects.filter((o) => o.id !== object.id).map((o) => o.zIndex)}
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
  siblingZIndexes,
  onCommit,
  onRemove,
}: {
  object: LiveObject;
  stall: Stall | undefined;
  canEdit: boolean;
  canvasWidth: number;
  canvasHeight: number;
  siblingZIndexes: number[];
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
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="flex-1"
          disabled={!canEdit}
          onClick={() => onCommit({ zIndex: Math.max(0, ...siblingZIndexes, object.zIndex) + 1 })}
        >
          <ChevronsUp className="w-3.5 h-3.5 mr-1" />
          Front
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="flex-1"
          disabled={!canEdit}
          onClick={() => onCommit({ zIndex: Math.min(0, ...siblingZIndexes, object.zIndex) - 1 })}
        >
          <ChevronsDown className="w-3.5 h-3.5 mr-1" />
          Back
        </Button>
      </div>
      <div className="flex items-center justify-between">
        <Label htmlFor={`mobile-label-visible-${object.id}`} className="text-xs">
          Show stall label on map
        </Label>
        <Switch
          id={`mobile-label-visible-${object.id}`}
          disabled={!canEdit}
          checked={object.labelVisible}
          onCheckedChange={(checked) => onCommit({ labelVisible: checked })}
        />
      </div>
    </div>
  );
}
