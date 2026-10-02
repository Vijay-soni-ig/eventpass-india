import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/apiClient";
import {
  floorPlanDetailKey,
  useAddFloorPlanElements,
  useDeleteFloorPlanElements,
  useUpdateFloorPlanElements,
  useBulkAddFloorPlanObjects,
  useBulkDeleteFloorPlanObjects,
  useBulkUpdateFloorPlanObjects,
  type FloorPlan,
  type FloorPlanElement,
  type FloorPlanElementType,
  type FloorPlanObject,
} from "@/hooks/organizer/useFloorPlanLayout";

// Undo/redo for the draft floor plan. Every edit is already saved to the server
// the moment it is made, so undoing means saving the opposite edit through the
// same atomic endpoints. History is session-only and per plan.
//
// Entries are keyed by stall, not object id: removing a stall from the map and
// putting it back creates a new object, but a stall appears on a plan at most
// once, so the stall id is the stable handle.

export const HISTORY_KEYS = ["x", "y", "width", "height", "rotation", "zIndex", "labelVisible"] as const;
export type HistoryKey = (typeof HISTORY_KEYS)[number];

export interface HistoryFields {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  labelVisible: boolean;
}

export type HistoryPatch = { stallId: string } & Partial<HistoryFields>;
export type HistoryItem = { stallId: string } & HistoryFields;

// Plan elements (aisles, entrances, labels...) keep their id for life, so unlike
// stalls they are addressed directly and an undo re-creates them under the same id.
export interface ElementFields {
  type: FloorPlanElementType;
  label: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
}

export const ELEMENT_KEYS = ["type", "label", "x", "y", "width", "height", "rotation", "zIndex"] as const;
export type ElementKey = (typeof ELEMENT_KEYS)[number];
export type ElementPatchOp = { id: string } & Partial<ElementFields>;
export type ElementItem = { id: string } & ElementFields;

export type HistoryOp =
  | { type: "update"; patches: HistoryPatch[] }
  | { type: "add"; items: HistoryItem[] }
  | { type: "remove"; stallIds: string[] }
  | { type: "elementAdd"; items: ElementItem[] }
  | { type: "elementUpdate"; patches: ElementPatchOp[] }
  | { type: "elementRemove"; ids: string[] };

export interface HistoryCommand {
  label: string;
  undo: HistoryOp[];
  redo: HistoryOp[];
}

const MAX_HISTORY = 50;
// How long undo/redo will wait for an in-flight save before going ahead anyway.
const PENDING_WRITE_WAIT_MS = 8000;

/** Copies only the editable fields named in `keys` (ignores ids and anything else). */
export function pickFields(source: Partial<HistoryFields>, keys: readonly string[]): Partial<HistoryFields> {
  const result: Partial<HistoryFields> = {};
  for (const key of HISTORY_KEYS) {
    if (keys.includes(key) && source[key] !== undefined) (result as Record<string, unknown>)[key] = source[key];
  }
  return result;
}

/** Keys present in `next` whose value differs from `prior` (numbers compare to the server's 2 decimals). */
export function diffFields(prior: Partial<HistoryFields>, next: Partial<HistoryFields>): HistoryKey[] {
  return HISTORY_KEYS.filter((key) => {
    const b = next[key];
    if (b === undefined) return false;
    const a = prior[key];
    if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) >= 0.005;
    return a !== b;
  });
}

export function sameFields(a: Partial<HistoryFields>, b: Partial<HistoryFields>): boolean {
  return HISTORY_KEYS.every((key) => {
    const x = a[key];
    const y = b[key];
    if (x === undefined && y === undefined) return true;
    if (typeof x === "number" && typeof y === "number") return Math.abs(x - y) < 0.005;
    return x === y;
  });
}

/** Copies only the element fields named in `keys`. */
export function pickElementFields(source: Partial<ElementFields>, keys: readonly string[]): Partial<ElementFields> {
  const result: Partial<ElementFields> = {};
  for (const key of ELEMENT_KEYS) {
    if (keys.includes(key) && source[key] !== undefined) (result as Record<string, unknown>)[key] = source[key];
  }
  return result;
}

/** Element keys present in `next` whose value differs from `prior` (numbers compare to 2 decimals). */
export function diffElementFields(prior: Partial<ElementFields>, next: Partial<ElementFields>): ElementKey[] {
  return ELEMENT_KEYS.filter((key) => {
    const b = next[key];
    if (b === undefined) return false;
    const a = prior[key];
    if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) >= 0.005;
    return a !== b;
  });
}

export function toHistoryItem(object: { stallId: string } & HistoryFields): HistoryItem {
  return {
    stallId: object.stallId,
    x: object.x,
    y: object.y,
    width: object.width,
    height: object.height,
    rotation: object.rotation,
    zIndex: object.zIndex,
    labelVisible: object.labelVisible,
  };
}

class HistoryApplyError extends Error {}

function failureMessage(error: unknown): string {
  if (error instanceof HistoryApplyError) return error.message;
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Could not apply that change.";
}

interface UseFloorPlanHistoryOptions {
  exhibitionId: string;
  floorPlanId: string;
  /** Latest plan version; kept current as operations complete. */
  versionRef: { current: number };
  /** Called after an undo/redo has been applied (e.g. to clear the selection). */
  onApplied?: () => void;
}

export function useFloorPlanHistory({ exhibitionId, floorPlanId, versionRef, onApplied }: UseFloorPlanHistoryOptions) {
  const queryClient = useQueryClient();
  const bulkUpdate = useBulkUpdateFloorPlanObjects(exhibitionId, floorPlanId);
  const bulkAdd = useBulkAddFloorPlanObjects(exhibitionId, floorPlanId);
  const bulkDelete = useBulkDeleteFloorPlanObjects(exhibitionId, floorPlanId);
  const addElements = useAddFloorPlanElements(exhibitionId, floorPlanId);
  const updateElements = useUpdateFloorPlanElements(exhibitionId, floorPlanId);
  const deleteElements = useDeleteFloorPlanElements(exhibitionId, floorPlanId);

  const [stacks, setStacks] = useState<{ undo: HistoryCommand[]; redo: HistoryCommand[] }>({ undo: [], redo: [] });
  const stacksRef = useRef(stacks);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const writeStacks = useCallback((next: { undo: HistoryCommand[]; redo: HistoryCommand[] }) => {
    stacksRef.current = next;
    setStacks(next);
  }, []);

  const record = useCallback(
    (command: HistoryCommand) => {
      const current = stacksRef.current;
      writeStacks({ undo: [...current.undo.slice(-(MAX_HISTORY - 1)), command], redo: [] });
    },
    [writeStacks]
  );

  const clear = useCallback(() => writeStacks({ undo: [], redo: [] }), [writeStacks]);

  // Reads the server's copy of the plan so object ids are current even right
  // after a stall was removed and put back (which gives it a new id).
  const currentObjects = useCallback(async (): Promise<FloorPlanObject[]> => {
    const key = floorPlanDetailKey(exhibitionId, floorPlanId);
    await queryClient.refetchQueries({ queryKey: key, exact: true });
    const data = queryClient.getQueryData<{ floorPlan: FloorPlan; objects: FloorPlanObject[] }>(key);
    if (!data) throw new HistoryApplyError("Could not load the floor plan to apply that change.");
    versionRef.current = Math.max(versionRef.current, data.floorPlan.version);
    return data.objects;
  }, [exhibitionId, floorPlanId, queryClient, versionRef]);

  const elementsExist = useCallback(
    async (ids: string[]): Promise<boolean> => {
      const key = floorPlanDetailKey(exhibitionId, floorPlanId);
      const data = queryClient.getQueryData<{ floorPlan: FloorPlan; objects: FloorPlanObject[]; elements?: FloorPlanElement[] }>(key);
      const present = new Set((data?.elements ?? []).map((e) => e.id));
      return ids.every((id) => present.has(id));
    },
    [exhibitionId, floorPlanId, queryClient]
  );

  const runOps = useCallback(
    async (ops: HistoryOp[]) => {
      for (const op of ops) {
        const objects = await currentObjects();
        const idByStall = new Map(objects.map((o) => [o.stallId, o.id]));
        if (op.type === "update") {
          const updates = op.patches.map(({ stallId, ...fields }) => {
            const objectId = idByStall.get(stallId);
            if (!objectId) throw new HistoryApplyError("That change can no longer be applied because a stall was removed from the plan.");
            return { objectId, ...fields };
          });
          const result = await bulkUpdate.mutateAsync({ expectedVersion: versionRef.current, updates });
          versionRef.current = Math.max(versionRef.current, result.version);
        } else if (op.type === "elementAdd") {
          const result = await addElements.mutateAsync({ expectedVersion: versionRef.current, elements: op.items });
          versionRef.current = Math.max(versionRef.current, result.version);
        } else if (op.type === "elementUpdate") {
          if (!(await elementsExist(op.patches.map((p) => p.id)))) {
            throw new HistoryApplyError("That change can no longer be applied because an element was removed from the plan.");
          }
          const updates = op.patches.map(({ id, ...fields }) => ({ elementId: id, ...fields }));
          const result = await updateElements.mutateAsync({ expectedVersion: versionRef.current, updates });
          versionRef.current = Math.max(versionRef.current, result.version);
        } else if (op.type === "elementRemove") {
          if (!(await elementsExist(op.ids))) {
            throw new HistoryApplyError("That change can no longer be applied because an element was already removed.");
          }
          const result = await deleteElements.mutateAsync({ expectedVersion: versionRef.current, elementIds: op.ids });
          versionRef.current = Math.max(versionRef.current, result.version);
        } else if (op.type === "add") {
          const result = await bulkAdd.mutateAsync({ expectedVersion: versionRef.current, objects: op.items });
          versionRef.current = Math.max(versionRef.current, result.version);
        } else {
          const objectIds = op.stallIds.map((stallId) => {
            const objectId = idByStall.get(stallId);
            if (!objectId) throw new HistoryApplyError("That change can no longer be applied because a stall was already removed.");
            return objectId;
          });
          const result = await bulkDelete.mutateAsync({ expectedVersion: versionRef.current, objectIds });
          versionRef.current = Math.max(versionRef.current, result.version);
        }
      }
      // Leave the cache current so the next undo/redo starts from the server's state.
      await currentObjects();
    },
    [addElements, bulkAdd, bulkDelete, bulkUpdate, currentObjects, deleteElements, elementsExist, updateElements, versionRef]
  );

  // An edit shows on screen at once but only enters the history after the server has confirmed it.
  // Undo pressed in that gap would undo the PREVIOUS edit (and the new one would then land on top),
  // so undo/redo first wait for every save that is still in flight. Bounded, so a hung request
  // can never lock undo forever.
  const settlePendingWrites = useCallback(async () => {
    const startedAt = Date.now();
    while (queryClient.isMutating() > 0 && Date.now() - startedAt < PENDING_WRITE_WAIT_MS) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    // One more turn so the callbacks that record the finished edit have run.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }, [queryClient]);

  const apply = useCallback(
    async (direction: "undo" | "redo") => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      try {
        await settlePendingWrites();
        const source = direction === "undo" ? stacksRef.current.undo : stacksRef.current.redo;
        const command = source[source.length - 1];
        if (!command) return;
        await runOps(direction === "undo" ? command.undo : command.redo);
        const current = stacksRef.current;
        writeStacks(
          direction === "undo"
            ? { undo: current.undo.slice(0, -1), redo: [...current.redo, command] }
            : { undo: [...current.undo, command], redo: current.redo.slice(0, -1) }
        );
        toast.success(`${direction === "undo" ? "Undid" : "Redid"}: ${command.label}`);
        onApplied?.();
      } catch (error) {
        // The plan may have changed elsewhere, so earlier entries can no longer be trusted.
        clear();
        toast.error(`${failureMessage(error)} Undo history was cleared.`);
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [clear, onApplied, runOps, settlePendingWrites, writeStacks]
  );

  const undo = useCallback(() => apply("undo"), [apply]);
  const redo = useCallback(() => apply("redo"), [apply]);

  return {
    record,
    undo,
    redo,
    clear,
    busy,
    canUndo: stacks.undo.length > 0,
    canRedo: stacks.redo.length > 0,
    undoLabel: stacks.undo[stacks.undo.length - 1]?.label ?? null,
    redoLabel: stacks.redo[stacks.redo.length - 1]?.label ?? null,
  };
}
