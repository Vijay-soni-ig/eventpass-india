import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Trash2,
  Rocket,
  ChevronsUp,
  ChevronsDown,
  ZoomIn,
  ZoomOut,
  Maximize,
  Grid3x3,
  LayoutGrid,
  Pencil,
  ImagePlus,
  Check,
  Boxes,
  BoxSelect,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignHorizontalSpaceBetween,
  AlignVerticalSpaceBetween,
} from "lucide-react";
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
  useBulkUpdateFloorPlanObjects,
  useBulkDeleteFloorPlanObjects,
  useGenerateStalls,
  useUpdateFloorPlanObject,
  useDeleteFloorPlanObject,
  usePublishFloorPlan,
  type FloorPlan,
  type FloorPlanObject,
  type BulkObjectUpdate,
} from "@/hooks/organizer/useFloorPlanLayout";
import { GenerateStallsDialog, type GenerateStallsValues } from "./GenerateStallsDialog";
import {
  GRID_SIZE,
  alignBoxes,
  boundsOf,
  clampRange,
  distributeBoxes,
  intersects,
  layoutUnmapped,
  round2,
  snapToGrid,
  type AlignMode,
  type DistributeAxis,
} from "./floorPlanGeometry";

interface FloorPlanEditorProps {
  exhibitionId: string;
  stalls: Stall[];
  canEdit: boolean;
  backgroundUrl?: string | null;
  /** Uploads a new background image onto the draft; omitted when the user cannot manage stalls. */
  onReplaceBackground?: (file: File) => void;
  replacingBackground?: boolean;
  /** Whether the user may create stalls (enables "Generate stalls"). */
  canManageStalls?: boolean;
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

export function FloorPlanEditor({ exhibitionId, stalls, canEdit, canManageStalls = false, backgroundUrl, onReplaceBackground, replacingBackground }: FloorPlanEditorProps) {
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
      canManageStalls={canManageStalls}
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

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.25;
const MAX_BULK_PLACE = 500;
// A drag shorter than this (in screen pixels) is a click, not a selection box.
const MARQUEE_MIN_PX = 4;

function arrowDelta(key: string, shiftKey: boolean): { dx: number; dy: number } | null {
  const step = shiftKey ? NUDGE_STEP_LARGE : NUDGE_STEP;
  if (key === "ArrowLeft") return { dx: -step, dy: 0 };
  if (key === "ArrowRight") return { dx: step, dy: 0 };
  if (key === "ArrowUp") return { dx: 0, dy: -step };
  if (key === "ArrowDown") return { dx: 0, dy: step };
  return null;
}

function FloorPlanCanvasEditor({
  exhibitionId,
  plan,
  objects,
  stalls,
  canEdit,
  canManageStalls,
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
  canManageStalls: boolean;
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [fitScale, setFitScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [snap, setSnap] = useState(false);
  const scale = fitScale * zoom;

  // The latest values, readable from window-level drag listeners and debounced
  // timers that were created in an earlier render. The object and selection
  // refs are written together with their state (see updateLocal / selectIds)
  // so a mouseup that lands right after a mousemove never reads stale data.
  const localObjectsRef = useRef(localObjects);
  const selectedIdsRef = useRef<string[]>([]);
  const versionRef = useRef(plan.version);
  useEffect(() => {
    versionRef.current = plan.version;
  }, [plan.version]);

  function updateLocal(fn: (prev: LiveObject[]) => LiveObject[]) {
    const next = fn(localObjectsRef.current);
    localObjectsRef.current = next;
    setLocalObjects(next);
  }

  function selectIds(ids: string[]) {
    selectedIdsRef.current = ids;
    setSelectedIds(ids);
  }

  useEffect(() => {
    const next = normalizeObjects(objects);
    localObjectsRef.current = next;
    setLocalObjects(next);
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
  const bulkUpdateObjects = useBulkUpdateFloorPlanObjects(exhibitionId, plan.id);
  const bulkDeleteObjects = useBulkDeleteFloorPlanObjects(exhibitionId, plan.id);
  const generateStalls = useGenerateStalls(exhibitionId, plan.id);
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
  const existingCodes = useMemo(() => stalls.map((s) => s.code).filter((c): c is string => !!c), [stalls]);
  const placedCount = stalls.length - unmappedStalls.length;

  const selectedObjects = localObjects.filter((o) => selectedIds.includes(o.id));
  const selected = selectedObjects.length === 1 ? selectedObjects[0] : null;

  const commitTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const groupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  function sendBulkUpdate(updates: BulkObjectUpdate[]) {
    bulkUpdateObjects.mutate(
      { expectedVersion: versionRef.current, updates },
      { onError: (err) => toast.error(errorMessage(err, "Floor plan changed. Refreshing the editor.")) }
    );
  }

  // One debounced commit for a keyboard-nudged group, reading the latest positions when it fires.
  function scheduleGroupCommit(ids: string[]) {
    if (groupTimer.current) clearTimeout(groupTimer.current);
    groupTimer.current = setTimeout(() => {
      groupTimer.current = null;
      const updates = localObjectsRef.current
        .filter((o) => ids.includes(o.id))
        .map((o) => ({ objectId: o.id, x: round2(o.x), y: round2(o.y) }));
      if (updates.length > 0) sendBulkUpdate(updates);
    }, COMMIT_DEBOUNCE_MS);
  }

  useEffect(() => {
    const timers = commitTimers.current;
    const group = groupTimer;
    return () => {
      Object.values(timers).forEach((t) => clearTimeout(t));
      if (group.current) clearTimeout(group.current);
    };
  }, []);

  function clamp(value: number, max: number) {
    return Math.min(Math.max(0, value), Math.max(0, max));
  }

  function applyBulkUpdates(updates: BulkObjectUpdate[]) {
    if (updates.length === 0) return;
    const byId = new Map(updates.map((u) => [u.objectId, u]));
    updateLocal((prev) =>
      prev.map((o) => {
        const u = byId.get(o.id);
        return u ? { ...o, x: u.x ?? o.x, y: u.y ?? o.y, width: u.width ?? o.width, height: u.height ?? o.height } : o;
      })
    );
    sendBulkUpdate(updates);
  }

  function handleAlign(mode: AlignMode) {
    const patches = alignBoxes(selectedObjects, mode);
    if (patches.length === 0) {
      toast.message("Those stalls are already aligned");
      return;
    }
    applyBulkUpdates(patches.map((p) => ({ objectId: p.id, x: p.x, y: p.y })));
  }

  function handleDistribute(axis: DistributeAxis) {
    const patches = distributeBoxes(selectedObjects, axis);
    if (patches.length === 0) {
      toast.message("Those stalls are already evenly spaced");
      return;
    }
    applyBulkUpdates(patches.map((p) => ({ objectId: p.id, x: p.x, y: p.y })));
  }

  function handleAddStall(stall: Stall) {
    const { x, y, width, height } = computeDefaultPosition(objects.length, canvasWidth, canvasHeight);
    addObject.mutate(
      { expectedVersion: versionRef.current, stallId: stall.id, x, y, width, height },
      {
        onSuccess: (created) => {
          selectIds([created.id]);
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

  function handleGenerate(values: GenerateStallsValues) {
    generateStalls.mutate(
      { expectedVersion: versionRef.current, ...values },
      {
        onSuccess: (result) => {
          setGenerateOpen(false);
          toast.success(`Created and placed ${result.created} ${result.created === 1 ? "stall" : "stalls"}. Drag them into position.`);
        },
        onError: (err) => toast.error(errorMessage(err, "Failed to generate stalls")),
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
        selectIds(selectedIdsRef.current.filter((x) => x !== id));
        toast.success("Removed from floor plan");
      },
      onError: (err) => toast.error(errorMessage(err, "Failed to remove floor plan object")),
    });
  }

  function handleRemoveSelected(ids: string[]) {
    if (ids.length === 1) {
      handleRemove(ids[0]);
      return;
    }
    bulkDeleteObjects.mutate(
      { expectedVersion: versionRef.current, objectIds: ids },
      {
        onSuccess: () => {
          selectIds([]);
          toast.success(`Removed ${ids.length} stalls from the plan`);
        },
        onError: (err) => toast.error(errorMessage(err, "Failed to remove stalls")),
      }
    );
  }

  function handleObjectKeyDown(e: React.KeyboardEvent, object: LiveObject) {
    if (!editable) return;
    const ids = selectedIdsRef.current;
    const inGroup = ids.length > 1 && ids.includes(object.id);
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      if (inGroup) handleRemoveSelected(ids);
      else handleRemove(object.id);
      return;
    }
    const delta = arrowDelta(e.key, e.shiftKey);
    if (!delta) return;
    e.preventDefault();
    if (inGroup) {
      updateLocal((prev) => {
        const group = prev.filter((o) => ids.includes(o.id));
        const b = boundsOf(group);
        const dx = clampRange(delta.dx, -b.left, canvasWidth - b.right);
        const dy = clampRange(delta.dy, -b.top, canvasHeight - b.bottom);
        return prev.map((o) => (ids.includes(o.id) ? { ...o, x: round2(o.x + dx), y: round2(o.y + dy) } : o));
      });
      scheduleGroupCommit(ids);
      return;
    }
    const nextX = clamp(object.x + delta.dx, canvasWidth - object.width);
    const nextY = clamp(object.y + delta.dy, canvasHeight - object.height);
    updateLocal((prev) => prev.map((o) => (o.id === object.id ? { ...o, x: nextX, y: nextY } : o)));
    scheduleCommit(object.id, { x: nextX, y: nextY });
  }

  // Mouse drag / resize — commits only on mouseup, constrained to canvas bounds
  // (the server independently re-validates bounds on write). Dragging a stall
  // that is part of a multi-selection moves the whole selection together.
  const dragState = useRef<{
    mode: "drag" | "resize";
    primaryId: string;
    startX: number;
    startY: number;
    starts: Map<string, LiveObject>;
    // A plain click (no movement) on a stall inside a multi-selection narrows to just that stall.
    collapseOnClick: boolean;
  } | null>(null);

  function handleObjectMouseDown(e: React.MouseEvent, object: LiveObject, mode: "drag" | "resize") {
    if (!editable || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (mode === "drag" && (e.shiftKey || e.ctrlKey || e.metaKey)) {
      const current = selectedIdsRef.current;
      selectIds(current.includes(object.id) ? current.filter((id) => id !== object.id) : [...current, object.id]);
      return;
    }
    let ids = selectedIdsRef.current;
    const collapseOnClick = mode === "drag" && ids.length > 1 && ids.includes(object.id);
    if (mode === "resize" || !ids.includes(object.id)) {
      ids = [object.id];
      selectIds(ids);
    }
    const starts = new Map(localObjectsRef.current.filter((o) => ids.includes(o.id)).map((o) => [o.id, o]));
    dragState.current = { mode, primaryId: object.id, startX: e.clientX, startY: e.clientY, starts, collapseOnClick };
    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowMouseUp);
  }

  function handleWindowMouseMove(e: MouseEvent) {
    const drag = dragState.current;
    if (!drag) return;
    const dx = (e.clientX - drag.startX) / scale;
    const dy = (e.clientY - drag.startY) / scale;
    const primary = drag.starts.get(drag.primaryId);
    if (!primary) return;
    if (drag.mode === "resize") {
      updateLocal((prev) =>
        prev.map((o) => {
          if (o.id !== primary.id) return o;
          const width = Math.max(20, Math.min(snapToGrid(primary.width + dx, snap), canvasWidth - o.x));
          const height = Math.max(20, Math.min(snapToGrid(primary.height + dy, snap), canvasHeight - o.y));
          return { ...o, width, height };
        })
      );
      return;
    }
    const b = boundsOf(Array.from(drag.starts.values()));
    const moveX = clampRange(snapToGrid(primary.x + dx, snap) - primary.x, -b.left, canvasWidth - b.right);
    const moveY = clampRange(snapToGrid(primary.y + dy, snap) - primary.y, -b.top, canvasHeight - b.bottom);
    updateLocal((prev) =>
      prev.map((o) => {
        const start = drag.starts.get(o.id);
        return start ? { ...o, x: round2(start.x + moveX), y: round2(start.y + moveY) } : o;
      })
    );
  }

  function handleWindowMouseUp() {
    const drag = dragState.current;
    dragState.current = null;
    window.removeEventListener("mousemove", handleWindowMouseMove);
    window.removeEventListener("mouseup", handleWindowMouseUp);
    if (!drag) return;
    const changed = localObjectsRef.current.filter((o) => {
      const start = drag.starts.get(o.id);
      return !!start && (o.x !== start.x || o.y !== start.y || o.width !== start.width || o.height !== start.height);
    });
    if (changed.length === 0) {
      if (drag.collapseOnClick) selectIds([drag.primaryId]);
      return;
    }
    if (changed.length === 1) {
      const o = changed[0];
      commitObject(o.id, { x: o.x, y: o.y, width: o.width, height: o.height });
      return;
    }
    sendBulkUpdate(changed.map((o) => ({ objectId: o.id, x: o.x, y: o.y })));
  }

  // Dragging on empty canvas draws a selection box; Shift/Ctrl/Cmd adds to the selection.
  const marqueeState = useRef<{
    startX: number;
    startY: number;
    clientX: number;
    clientY: number;
    additive: boolean;
    base: string[];
    moved: boolean;
  } | null>(null);

  function toCanvasPoint(clientX: number, clientY: number) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: clampRange((clientX - rect.left) / scale, 0, canvasWidth),
      y: clampRange((clientY - rect.top) / scale, 0, canvasHeight),
    };
  }

  function handleCanvasMouseDown(e: React.MouseEvent) {
    if (!editable || e.button !== 0) return;
    e.preventDefault();
    const point = toCanvasPoint(e.clientX, e.clientY);
    marqueeState.current = {
      startX: point.x,
      startY: point.y,
      clientX: e.clientX,
      clientY: e.clientY,
      additive: e.shiftKey || e.ctrlKey || e.metaKey,
      base: selectedIdsRef.current,
      moved: false,
    };
    window.addEventListener("mousemove", handleMarqueeMove);
    window.addEventListener("mouseup", handleMarqueeUp);
  }

  function handleMarqueeMove(e: MouseEvent) {
    const m = marqueeState.current;
    if (!m) return;
    if (!m.moved && Math.hypot(e.clientX - m.clientX, e.clientY - m.clientY) < MARQUEE_MIN_PX) return;
    m.moved = true;
    const point = toCanvasPoint(e.clientX, e.clientY);
    setMarquee({ x1: m.startX, y1: m.startY, x2: point.x, y2: point.y });
  }

  function handleMarqueeUp(e: MouseEvent) {
    const m = marqueeState.current;
    marqueeState.current = null;
    window.removeEventListener("mousemove", handleMarqueeMove);
    window.removeEventListener("mouseup", handleMarqueeUp);
    setMarquee(null);
    if (!m) return;
    if (!m.moved) {
      if (!m.additive) selectIds([]);
      return;
    }
    const point = toCanvasPoint(e.clientX, e.clientY);
    const rect = {
      left: Math.min(m.startX, point.x),
      top: Math.min(m.startY, point.y),
      right: Math.max(m.startX, point.x),
      bottom: Math.max(m.startY, point.y),
    };
    const hits = localObjectsRef.current.filter((o) => intersects(o, rect)).map((o) => o.id);
    selectIds(m.additive ? Array.from(new Set([...m.base, ...hits])) : hits);
  }

  useEffect(() => {
    return () => {
      // Never leave drag/selection listeners behind if the editor unmounts mid-drag.
      dragState.current = null;
      marqueeState.current = null;
    };
  }, []);

  // Escape clears the selection from anywhere on the page, except while typing
  // in a field or when a dialog/menu has already handled the key.
  useEffect(() => {
    if (generateOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
      if (selectedIdsRef.current.length > 0) {
        selectedIdsRef.current = [];
        setSelectedIds([]);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [generateOpen]);

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
              {editable && localObjects.length > 1 && (
                <Button type="button" size="sm" variant="outline" onClick={() => selectIds(localObjects.map((o) => o.id))}>
                  <BoxSelect className="w-4 h-4 mr-1" />
                  Select all
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
            {editable && localObjects.length > 1 && (
              <p className="text-xs text-muted-foreground px-1">
                Tip: drag on an empty area to select several stalls, or Shift-click to add one. Then move, align or space them together.
              </p>
            )}

            <div
              ref={containerRef}
              className="bg-muted/30 border border-border rounded-xl overflow-auto max-h-[75vh]"
            >
              <div className="p-4">
                <div style={{ width: canvasWidth * scale, height: canvasHeight * scale }}>
                  <div
                    ref={canvasRef}
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
                    onMouseDown={handleCanvasMouseDown}
                    onClick={() => {
                      if (!editable) selectIds([]);
                    }}
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
                      const isSelected = selectedIds.includes(object.id);
                      return (
                        <div
                          key={object.id}
                          tabIndex={0}
                          role="button"
                          aria-label={`Stall ${stall?.code ?? object.stallId.slice(0, 6)}`}
                          aria-pressed={isSelected}
                          className={cn(
                            "absolute border-2 rounded-md flex flex-col items-center justify-center select-none",
                            stall ? STATUS_STYLES[stall.status] : "bg-card border-border",
                            editable && "cursor-move",
                            isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background"
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
                            if (!editable) selectIds([object.id]);
                          }}
                          onKeyDown={(e) => handleObjectKeyDown(e, object)}
                        >
                          {object.labelVisible && (
                            <span className="text-xs font-mono font-semibold pointer-events-none">
                              {stall?.code ?? object.stallId.slice(0, 6)}
                            </span>
                          )}
                          {editable && selectedIds.length <= 1 && (
                            <div
                              className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize bg-primary/30 rounded-tl"
                              onMouseDown={(e) => handleObjectMouseDown(e, object, "resize")}
                            />
                          )}
                        </div>
                      );
                    })}
                    {marquee && (
                      <div
                        aria-hidden
                        className="absolute pointer-events-none border border-primary bg-primary/10"
                        style={{
                          left: Math.min(marquee.x1, marquee.x2),
                          top: Math.min(marquee.y1, marquee.y2),
                          width: Math.abs(marquee.x2 - marquee.x1),
                          height: Math.abs(marquee.y2 - marquee.y1),
                          zIndex: 100000,
                        }}
                      />
                    )}
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
              {canManageStalls && (
                <Button size="sm" variant="outline" className="w-full" onClick={() => setGenerateOpen(true)}>
                  <Boxes className="w-3.5 h-3.5 mr-1.5" />
                  Generate stalls
                </Button>
              )}
              {unmappedStalls.length === 0 ? (
                stalls.length === 0 ? (
                  // Nothing can be placed (and no Stall Properties panel can open) until the
                  // exhibition has stalls; say so and link to where they are created.
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      This exhibition has no stalls yet. {canManageStalls ? "Generate a block above, or add them one by one." : "Add stalls first, then place them on this plan."}
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
                updateLocal((prev) => prev.map((o) => (o.id === selected.id ? { ...o, ...patch } : o)));
                commitObject(selected.id, patch);
              }}
              onRemove={() => handleRemove(selected.id)}
            />
          )}

          {selectedObjects.length > 1 && !isMobile && (
            <MultiSelectPanel
              count={selectedObjects.length}
              canEdit={editable}
              onAlign={handleAlign}
              onDistribute={handleDistribute}
              onRemove={() => handleRemoveSelected(selectedObjects.map((o) => o.id))}
              onClear={() => selectIds([])}
              removing={bulkDeleteObjects.isPending}
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

      {generateOpen && (
        <GenerateStallsDialog
          open
          onOpenChange={(open) => {
            if (!open && !generateStalls.isPending) setGenerateOpen(false);
          }}
          existing={localObjects}
          existingCodes={existingCodes}
          canvasWidth={canvasWidth}
          canvasHeight={canvasHeight}
          pending={generateStalls.isPending}
          onSubmit={handleGenerate}
        />
      )}
    </div>
  );
}

function MultiSelectPanel({
  count,
  canEdit,
  onAlign,
  onDistribute,
  onRemove,
  onClear,
  removing,
}: {
  count: number;
  canEdit: boolean;
  onAlign: (mode: AlignMode) => void;
  onDistribute: (axis: DistributeAxis) => void;
  onRemove: () => void;
  onClear: () => void;
  removing: boolean;
}) {
  const alignButtons: Array<{ mode: AlignMode; label: string; icon: typeof AlignStartVertical }> = [
    { mode: "left", label: "Align left", icon: AlignStartVertical },
    { mode: "hcenter", label: "Align centers horizontally", icon: AlignCenterVertical },
    { mode: "right", label: "Align right", icon: AlignEndVertical },
    { mode: "top", label: "Align top", icon: AlignStartHorizontal },
    { mode: "vcenter", label: "Align centers vertically", icon: AlignCenterHorizontal },
    { mode: "bottom", label: "Align bottom", icon: AlignEndHorizontal },
  ];
  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-semibold text-sm">{count} stalls selected</h4>
        <Button type="button" size="sm" variant="ghost" onClick={onClear}>
          Clear
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Drag any selected stall to move them all. Arrow keys nudge the group.</p>
      <div className="space-y-1.5">
        <p className="text-xs font-medium">Align</p>
        <div className="grid grid-cols-6 gap-1">
          {alignButtons.map(({ mode, label, icon: Icon }) => (
            <Button key={mode} type="button" size="icon" variant="outline" aria-label={label} title={label} disabled={!canEdit} onClick={() => onAlign(mode)}>
              <Icon className="w-4 h-4" />
            </Button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <p className="text-xs font-medium">Space evenly</p>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" size="sm" variant="outline" disabled={!canEdit || count < 3} onClick={() => onDistribute("horizontal")}>
            <AlignHorizontalSpaceBetween className="w-4 h-4 mr-1" />
            Across
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={!canEdit || count < 3} onClick={() => onDistribute("vertical")}>
            <AlignVerticalSpaceBetween className="w-4 h-4 mr-1" />
            Down
          </Button>
        </div>
        {count < 3 && <p className="text-xs text-muted-foreground">Select at least 3 stalls to space them evenly.</p>}
      </div>
      {canEdit && (
        <Button variant="destructive" size="sm" className="w-full" onClick={onRemove} disabled={removing}>
          <Trash2 className="w-3.5 h-3.5 mr-2" />
          {removing ? "Removing..." : `Remove ${count} from map`}
        </Button>
      )}
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
