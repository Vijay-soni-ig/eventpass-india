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
import { clampRange, round2, snapToGrid } from "./floorPlanGeometry";
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
  /** Called when an element becomes selected, so stall selection can be cleared. */
  onSelectElement: () => void;
}

/** Editing of aisles, entrances, stages and labels: selection, drag, resize, nudge, add, remove. */
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
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const selectedRef = useRef<string | null>(null);

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
    selectedRef.current = null;
    setSelectedElementId(null);
  }, []);

  const select = useCallback(
    (id: string) => {
      selectedRef.current = id;
      setSelectedElementId(id);
      onSelectElement();
    },
    [onSelectElement]
  );

  const selectedElement = localElements.find((e) => e.id === selectedElementId) ?? null;

  // ---- saving ------------------------------------------------------------
  // `before` is how the element looked before this change; it becomes the undo step.
  async function commit(id: string, patch: Partial<ElementFields>, before: LiveElement) {
    try {
      await updateElements.mutateAsync({ expectedVersion: versionRef.current, updates: [{ elementId: id, ...patch }] });
    } catch (err) {
      toast.error(messageOf(err, "Floor plan changed. Refreshing the editor."));
      return;
    }
    const keys = diffElementFields(before, patch);
    if (keys.length === 0) return;
    record({
      label: editLabel(keys, before),
      undo: [{ type: "elementUpdate", patches: [{ id, ...pickElementFields(before, keys) }] }],
      redo: [{ type: "elementUpdate", patches: [{ id, ...pickElementFields(patch, keys) }] }],
    });
  }

  /** Applies a change from the properties panel (local first, then saved). */
  function applyPatch(id: string, patch: Partial<ElementFields>) {
    const before = localRef.current.find((e) => e.id === id);
    if (!before) return;
    updateLocal((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    void commit(id, patch, before);
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

  function remove(id: string) {
    const removed = localRef.current.find((e) => e.id === id);
    if (!removed) return;
    deleteElements.mutate(
      { expectedVersion: versionRef.current, elementIds: [id] },
      {
        onSuccess: () => {
          if (selectedRef.current === id) deselect();
          record({
            label: `Remove ${elementName(removed)}`,
            undo: [{ type: "elementAdd", items: [toItem(removed)] }],
            redo: [{ type: "elementRemove", ids: [id] }],
          });
          toast.success("Removed from the plan");
        },
        onError: (err) => toast.error(messageOf(err, "Failed to remove from the plan")),
      }
    );
  }

  // ---- mouse drag / resize --------------------------------------------------
  const dragState = useRef<{ mode: "drag" | "resize"; id: string; startX: number; startY: number; start: LiveElement } | null>(null);

  function handleMouseDown(e: React.MouseEvent, element: LiveElement, mode: "drag" | "resize") {
    if (!editable || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    select(element.id);
    dragState.current = { mode, id: element.id, startX: e.clientX, startY: e.clientY, start: element };
    window.addEventListener("mousemove", handleWindowMove);
    window.addEventListener("mouseup", handleWindowUp);
  }

  function handleWindowMove(e: MouseEvent) {
    const drag = dragState.current;
    if (!drag) return;
    const dx = (e.clientX - drag.startX) / scale;
    const dy = (e.clientY - drag.startY) / scale;
    const s = drag.start;
    updateLocal((prev) =>
      prev.map((o) => {
        if (o.id !== s.id) return o;
        if (drag.mode === "drag") {
          return {
            ...o,
            x: round2(clampRange(snapToGrid(s.x + dx, snap), 0, canvasWidth - o.width)),
            y: round2(clampRange(snapToGrid(s.y + dy, snap), 0, canvasHeight - o.height)),
          };
        }
        return {
          ...o,
          width: round2(Math.max(MIN_ELEMENT_SIZE, Math.min(snapToGrid(s.width + dx, snap), canvasWidth - o.x))),
          height: round2(Math.max(MIN_ELEMENT_SIZE, Math.min(snapToGrid(s.height + dy, snap), canvasHeight - o.y))),
        };
      })
    );
  }

  function handleWindowUp() {
    const drag = dragState.current;
    dragState.current = null;
    window.removeEventListener("mousemove", handleWindowMove);
    window.removeEventListener("mouseup", handleWindowUp);
    if (!drag) return;
    const current = localRef.current.find((o) => o.id === drag.id);
    if (!current) return;
    const s = drag.start;
    if (current.x === s.x && current.y === s.y && current.width === s.width && current.height === s.height) return;
    void commit(current.id, { x: current.x, y: current.y, width: current.width, height: current.height }, s);
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
    const pending = Array.from(nudgeBefore.current.entries());
    nudgeBefore.current = new Map();
    for (const [id, before] of pending) {
      const current = localRef.current.find((o) => o.id === id);
      if (current) await commit(id, { x: current.x, y: current.y }, before);
    }
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
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      remove(element.id);
      return;
    }
    const step = e.shiftKey ? NUDGE_STEP_LARGE : NUDGE_STEP;
    const delta =
      e.key === "ArrowLeft" ? { dx: -step, dy: 0 } : e.key === "ArrowRight" ? { dx: step, dy: 0 } : e.key === "ArrowUp" ? { dx: 0, dy: -step } : e.key === "ArrowDown" ? { dx: 0, dy: step } : null;
    if (!delta) return;
    e.preventDefault();
    const current = localRef.current.find((o) => o.id === element.id);
    if (!current) return;
    if (!nudgeBefore.current.has(current.id)) nudgeBefore.current.set(current.id, current);
    updateLocal((prev) =>
      prev.map((o) =>
        o.id === element.id
          ? { ...o, x: round2(clampRange(o.x + delta.dx, 0, canvasWidth - o.width)), y: round2(clampRange(o.y + delta.dy, 0, canvasHeight - o.height)) }
          : o
      )
    );
    if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
    nudgeTimer.current = setTimeout(() => {
      void flushRef.current();
    }, NUDGE_DEBOUNCE_MS);
  }

  return {
    localElements,
    selectedElement,
    selectedElementId,
    deselect,
    select,
    add,
    remove,
    applyPatch,
    handleMouseDown,
    handleKeyDown,
    /** Saves a pending arrow-key nudge now (call before undo/redo reads the plan). */
    flushNudge: () => flushRef.current(),
    adding: addElements.isPending,
  };
}
