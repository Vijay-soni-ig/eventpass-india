import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/apiClient";
import {
  useAddFloorPlanElements,
  useDeleteFloorPlanElements,
  useUpdateFloorPlanElements,
  type FloorPlanElement,
  type FloorPlanElementType,
} from "@/hooks/organizer/useFloorPlanLayout";
import { ELEMENT_META, elementName, type ElementType } from "@/components/floorplan/floorPlanElements";
import {
  ALIGN_LABELS,
  alignBoxes,
  boundsOf,
  clampRange,
  distributeBoxes,
  intersects,
  round2,
  snapToGrid,
  visualBounds,
  type AlignMode,
  type DistributeAxis,
} from "./floorPlanGeometry";
import {
  diffElementFields,
  pickElementFields,
  type ElementFields,
  type ElementItem,
  type HistoryCommand,
} from "./useFloorPlanHistory";

const NUDGE_STEP = 5;
const NUDGE_STEP_LARGE = 20;
const NUDGE_DEBOUNCE_MS = 400;
const MIN_ELEMENT_SIZE = 8;

export interface LiveElement {
  id: string;
  type: FloorPlanElementType;
  label: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
}

function normalize(elements: FloorPlanElement[]): LiveElement[] {
  return elements.map((e) => ({
    id: e.id,
    type: e.type,
    label: e.label,
    x: Number(e.x),
    y: Number(e.y),
    width: Number(e.width),
    height: Number(e.height),
    rotation: Number(e.rotation),
    zIndex: e.zIndex,
  }));
}

function toItem(e: LiveElement): ElementItem {
  return { id: e.id, type: e.type, label: e.label, x: e.x, y: e.y, width: e.width, height: e.height, rotation: e.rotation, zIndex: e.zIndex };
}

function messageOf(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

function editLabel(keys: string[], element: LiveElement): string {
  const name = elementName(element);
  const has = (k: string) => keys.includes(k);
  const moves = has("x") || has("y");
  const resizes = has("width") || has("height");
  if (moves && !resizes && keys.length <= 2) return `Move ${name}`;
  if (resizes && !moves && keys.length <= 2) return `Resize ${name}`;
  if (keys.length === 1 && has("rotation")) return `Rotate ${name}`;
  if (keys.length === 1 && has("label")) return `Edit text of ${name}`;
  if (keys.length === 1 && has("zIndex")) return `Change stacking of ${name}`;
  return `Edit ${name}`;
}

function moveLabel(elements: LiveElement[]): string {
  return elements.length === 1 ? `Move ${elementName(elements[0])}` : `Move ${elements.length} plan elements`;
}

type ElementChange = { id: string; patch: Partial<ElementFields> };

interface UseElementsEditorOptions {
  exhibitionId: string;
  floorPlanId: string;
  /** The plan's elements as last loaded from the server. */
  elements: FloorPlanElement[];
  editable: boolean;
  canvasWidth: number;
  canvasHeight: number;
  scale: number;
  snap: boolean;
  versionRef: { current: number };
  /** The scroll container, used to drop new elements into the visible middle. */
  containerRef: RefObject<HTMLDivElement | null>;
  record: (command: HistoryCommand) => void;
  /** Called when elements become selected, so stall selection can be cleared. */
  onSelectElement: () => void;
}

/**
 * Editing of aisles, entrances, stages and labels: selection (one or many), drag, resize,
 * nudge, align, space evenly, add and remove. A selection is only ever elements; it is
 * never mixed with stalls, so every group action is one atomic server request and one undo step.
 */
export function useElementsEditor({
  exhibitionId,
  floorPlanId,
  elements,
  editable,
  canvasWidth,
  canvasHeight,
  scale,
  snap,
  versionRef,
  containerRef,
  record,
  onSelectElement,
}: UseElementsEditorOptions) {
  const addElements = useAddFloorPlanElements(exhibitionId, floorPlanId);
  const updateElements = useUpdateFloorPlanElements(exhibitionId, floorPlanId);
  const deleteElements = useDeleteFloorPlanElements(exhibitionId, floorPlanId);

  const [localElements, setLocalElements] = useState<LiveElement[]>(() => normalize(elements));
  const localRef = useRef(localElements);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedRef = useRef<string[]>([]);

  // Written together with state so a mouseup right after a mousemove reads current positions.
  const updateLocal = useCallback((fn: (prev: LiveElement[]) => LiveElement[]) => {
    const next = fn(localRef.current);
    localRef.current = next;
    setLocalElements(next);
  }, []);

  useEffect(() => {
    const next = normalize(elements);
    localRef.current = next;
    setLocalElements(next);
  }, [elements]);

  const deselect = useCallback(() => {
    selectedRef.current = [];
    setSelectedIds([]);
  }, []);

  const setSelection = useCallback(
    (ids: string[]) => {
      selectedRef.current = ids;
      setSelectedIds(ids);
      if (ids.length > 0) onSelectElement();
    },
    [onSelectElement]
  );

  const select = useCallback((id: string) => setSelection([id]), [setSelection]);

  const toggle = useCallback(
    (id: string) => {
      const current = selectedRef.current;
      setSelection(current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
    },
    [setSelection]
  );

  const getSelectedIds = useCallback(() => selectedRef.current, []);

  // Ids that no longer exist (removed elsewhere, or by undo) silently drop out of the selection.
  const selectedElements = localElements.filter((e) => selectedIds.includes(e.id));
  const selectedElement = selectedElements.length === 1 ? selectedElements[0] : null;

  /** Elements whose visible (rotated) box touches a marquee rectangle, in canvas units. */
  const hitTest = useCallback(
    (rect: { left: number; top: number; right: number; bottom: number }): string[] =>
      localRef.current.filter((e) => intersects(visualBounds(e), rect)).map((e) => e.id),
    []
  );

  // ---- saving ------------------------------------------------------------
  // `before` is how each element looked before the change; it becomes the undo step.
  async function commitMany(changes: ElementChange[], before: Map<string, LiveElement>, label: (keys: string[]) => string) {
    if (changes.length === 0) return;
    try {
      await updateElements.mutateAsync({
        expectedVersion: versionRef.current,
        updates: changes.map((c) => ({ elementId: c.id, ...c.patch })),
      });
    } catch (err) {
      toast.error(messageOf(err, "Floor plan changed. Refreshing the editor."));
      return;
    }
    const undoPatches: Array<{ id: string } & Partial<ElementFields>> = [];
    const redoPatches: Array<{ id: string } & Partial<ElementFields>> = [];
    const allKeys = new Set<string>();
    for (const { id, patch } of changes) {
      const prior = before.get(id);
      if (!prior) continue;
      const keys = diffElementFields(prior, patch);
      if (keys.length === 0) continue;
      keys.forEach((k) => allKeys.add(k));
      undoPatches.push({ id, ...pickElementFields(prior, keys) });
      redoPatches.push({ id, ...pickElementFields(patch, keys) });
    }
    if (undoPatches.length === 0) return;
    record({
      label: label(Array.from(allKeys)),
      undo: [{ type: "elementUpdate", patches: undoPatches }],
      redo: [{ type: "elementUpdate", patches: redoPatches }],
    });
  }

  /** Applies a change from the properties panel (local first, then saved). */
  function applyPatch(id: string, patch: Partial<ElementFields>) {
    const before = localRef.current.find((e) => e.id === id);
    if (!before) return;
    updateLocal((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    void commitMany([{ id, patch }], new Map([[id, before]]), (keys) => editLabel(keys, before));
  }

  function applyChanges(changes: ElementChange[], label: string) {
    if (changes.length === 0) return;
    const before = new Map(localRef.current.map((e) => [e.id, e]));
    const byId = new Map(changes.map((c) => [c.id, c.patch]));
    updateLocal((prev) => prev.map((e) => (byId.has(e.id) ? { ...e, ...byId.get(e.id) } : e)));
    void commitMany(changes, before, () => label);
  }

  function align(mode: AlignMode) {
    const patches = alignBoxes(selectedElements, mode);
    if (patches.length === 0) {
      toast.message("Those plan elements are already aligned");
      return;
    }
    applyChanges(
      patches.map((p) => ({ id: p.id, patch: { x: p.x, y: p.y } })),
      ALIGN_LABELS[mode]
    );
  }

  function distribute(axis: DistributeAxis) {
    const patches = distributeBoxes(selectedElements, axis);
    if (patches.length === 0) {
      toast.message("Those plan elements are already evenly spaced");
      return;
    }
    applyChanges(
      patches.map((p) => ({ id: p.id, patch: { x: p.x, y: p.y } })),
      "Space plan elements evenly"
    );
  }

  function add(type: ElementType) {
    const meta = ELEMENT_META[type];
    const width = Math.min(meta.width, canvasWidth);
    const height = Math.min(meta.height, canvasHeight);
    let cx = canvasWidth / 2;
    let cy = canvasHeight / 2;
    const container = containerRef.current;
    if (container && scale > 0) {
      // 16px = the p-4 padding between the scroll container and the canvas.
      cx = (container.scrollLeft + container.clientWidth / 2 - 16) / scale;
      cy = (container.scrollTop + Math.min(container.clientHeight, canvasHeight * scale + 32) / 2 - 16) / scale;
    }
    const item: ElementItem = {
      id: crypto.randomUUID(),
      type,
      label: type === "label" ? "Label" : null,
      x: round2(clampRange(cx - width / 2, 0, canvasWidth - width)),
      y: round2(clampRange(cy - height / 2, 0, canvasHeight - height)),
      width,
      height,
      rotation: 0,
      zIndex: 0,
    };
    addElements.mutate(
      { expectedVersion: versionRef.current, elements: [item] },
      {
        onSuccess: () => {
          select(item.id);
          record({
            label: `Add ${meta.name.toLowerCase()}`,
            undo: [{ type: "elementRemove", ids: [item.id] }],
            redo: [{ type: "elementAdd", items: [item] }],
          });
          toast.success(`Added ${meta.name.toLowerCase()}. Drag it into position.`);
        },
        onError: (err) => toast.error(messageOf(err, "Failed to add to the plan")),
      }
    );
  }

  /** Removes one or several elements in a single request and a single undo step. */
  function removeMany(ids: string[]) {
    const removed = localRef.current.filter((e) => ids.includes(e.id));
    if (removed.length === 0) return;
    deleteElements.mutate(
      { expectedVersion: versionRef.current, elementIds: removed.map((e) => e.id) },
      {
        onSuccess: () => {
          const gone = new Set(removed.map((e) => e.id));
          setSelection(selectedRef.current.filter((id) => !gone.has(id)));
          record({
            label: removed.length === 1 ? `Remove ${elementName(removed[0])}` : `Remove ${removed.length} plan elements`,
            undo: [{ type: "elementAdd", items: removed.map(toItem) }],
            redo: [{ type: "elementRemove", ids: removed.map((e) => e.id) }],
          });
          toast.success(removed.length === 1 ? "Removed from the plan" : `Removed ${removed.length} plan elements`);
        },
        onError: (err) => toast.error(messageOf(err, "Failed to remove from the plan")),
      }
    );
  }

  const remove = (id: string) => removeMany([id]);
  const removeSelected = () => removeMany(selectedRef.current);

  // ---- mouse drag / resize --------------------------------------------------
  // Dragging an element that is part of a multi-selection moves the whole selection.
  const dragState = useRef<{
    mode: "drag" | "resize";
    primaryId: string;
    startX: number;
    startY: number;
    starts: Map<string, LiveElement>;
    // A plain click (no movement) on an element inside a multi-selection narrows to just that element.
    collapseOnClick: boolean;
  } | null>(null);

  function handleMouseDown(e: React.MouseEvent, element: LiveElement, mode: "drag" | "resize") {
    if (!editable || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (mode === "drag" && (e.shiftKey || e.ctrlKey || e.metaKey)) {
      toggle(element.id);
      return;
    }
    let ids = selectedRef.current;
    const collapseOnClick = mode === "drag" && ids.length > 1 && ids.includes(element.id);
    if (mode === "resize" || !ids.includes(element.id)) {
      ids = [element.id];
      setSelection(ids);
    }
    const starts = new Map(localRef.current.filter((o) => ids.includes(o.id)).map((o) => [o.id, o]));
    dragState.current = { mode, primaryId: element.id, startX: e.clientX, startY: e.clientY, starts, collapseOnClick };
    window.addEventListener("mousemove", handleWindowMove);
    window.addEventListener("mouseup", handleWindowUp);
  }

  function handleWindowMove(e: MouseEvent) {
    const drag = dragState.current;
    if (!drag) return;
    const dx = (e.clientX - drag.startX) / scale;
    const dy = (e.clientY - drag.startY) / scale;
    const primary = drag.starts.get(drag.primaryId);
    if (!primary) return;
    if (drag.mode === "resize") {
      updateLocal((prev) =>
        prev.map((o) =>
          o.id !== primary.id
            ? o
            : {
                ...o,
                width: round2(Math.max(MIN_ELEMENT_SIZE, Math.min(snapToGrid(primary.width + dx, snap), canvasWidth - o.x))),
                height: round2(Math.max(MIN_ELEMENT_SIZE, Math.min(snapToGrid(primary.height + dy, snap), canvasHeight - o.y))),
              }
        )
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

  function handleWindowUp() {
    const drag = dragState.current;
    dragState.current = null;
    window.removeEventListener("mousemove", handleWindowMove);
    window.removeEventListener("mouseup", handleWindowUp);
    if (!drag) return;
    const changed = localRef.current.filter((o) => {
      const s = drag.starts.get(o.id);
      return !!s && (o.x !== s.x || o.y !== s.y || o.width !== s.width || o.height !== s.height);
    });
    if (changed.length === 0) {
      if (drag.collapseOnClick) setSelection([drag.primaryId]);
      return;
    }
    void commitMany(
      changed.map((o) => ({ id: o.id, patch: { x: o.x, y: o.y, width: o.width, height: o.height } })),
      drag.starts,
      (keys) => (changed.length === 1 ? editLabel(keys, drag.starts.get(changed[0].id)!) : moveLabel(changed))
    );
  }

  // ---- keyboard ---------------------------------------------------------------
  // Arrow-key nudges are saved in one debounced burst, which is also one undo step.
  const nudgeBefore = useRef<Map<string, LiveElement>>(new Map());
  const nudgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushNudge = async () => {
    if (nudgeTimer.current) {
      clearTimeout(nudgeTimer.current);
      nudgeTimer.current = null;
    }
    const before = nudgeBefore.current;
    nudgeBefore.current = new Map();
    const moved = localRef.current.filter((o) => before.has(o.id));
    await commitMany(
      moved.map((o) => ({ id: o.id, patch: { x: o.x, y: o.y } })),
      before,
      () => moveLabel(moved)
    );
  };
  const flushRef = useRef(flushNudge);
  useEffect(() => {
    flushRef.current = flushNudge;
  });

  useEffect(() => {
    return () => {
      if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
      dragState.current = null;
    };
  }, []);

  function handleKeyDown(e: React.KeyboardEvent, element: LiveElement) {
    if (!editable) return;
    const ids = selectedRef.current;
    const inGroup = ids.length > 1 && ids.includes(element.id);
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      removeMany(inGroup ? ids : [element.id]);
      return;
    }
    const step = e.shiftKey ? NUDGE_STEP_LARGE : NUDGE_STEP;
    const delta =
      e.key === "ArrowLeft" ? { dx: -step, dy: 0 } : e.key === "ArrowRight" ? { dx: step, dy: 0 } : e.key === "ArrowUp" ? { dx: 0, dy: -step } : e.key === "ArrowDown" ? { dx: 0, dy: step } : null;
    if (!delta) return;
    e.preventDefault();
    const targetIds = inGroup ? ids : [element.id];
    for (const id of targetIds) {
      const current = localRef.current.find((o) => o.id === id);
      if (current && !nudgeBefore.current.has(id)) nudgeBefore.current.set(id, current);
    }
    updateLocal((prev) => {
      const group = prev.filter((o) => targetIds.includes(o.id));
      if (group.length === 0) return prev;
      const b = boundsOf(group);
      const dx = clampRange(delta.dx, -b.left, canvasWidth - b.right);
      const dy = clampRange(delta.dy, -b.top, canvasHeight - b.bottom);
      return prev.map((o) => (targetIds.includes(o.id) ? { ...o, x: round2(o.x + dx), y: round2(o.y + dy) } : o));
    });
    if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
    nudgeTimer.current = setTimeout(() => {
      void flushRef.current();
    }, NUDGE_DEBOUNCE_MS);
  }

  return {
    localElements,
    selectedIds,
    selectedElements,
    selectedElement,
    getSelectedIds,
    deselect,
    select,
    toggle,
    setSelection,
    selectAll: () => setSelection(localRef.current.map((e) => e.id)),
    hitTest,
    add,
    remove,
    removeSelected,
    applyPatch,
    align,
    distribute,
    handleMouseDown,
    handleKeyDown,
    /** Saves a pending arrow-key nudge now (call before undo/redo reads the plan). */
    flushNudge: () => flushRef.current(),
    adding: addElements.isPending,
    removing: deleteElements.isPending,
  };
}
