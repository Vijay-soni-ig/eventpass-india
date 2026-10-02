import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/apiClient";
import {
  floorPlanDetailKey,
  useBulkAddFloorPlanObjects,
  useBulkDeleteFloorPlanObjects,
  useBulkUpdateFloorPlanObjects,
  type FloorPlan,
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

export type HistoryOp =
  | { type: "update"; patches: HistoryPatch[] }
  | { type: "add"; items: HistoryItem[] }
  | { type: "remove"; stallIds: string[] };

export interface HistoryCommand {
  label: string;
  undo: HistoryOp[];
  redo: HistoryOp[];
}

const MAX_HISTORY = 50;

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
    [bulkAdd, bulkDelete, bulkUpdate, currentObjects, versionRef]
  );

  const apply = useCallback(
    async (direction: "undo" | "redo") => {
      if (busyRef.current) return;
      const source = direction === "undo" ? stacksRef.current.undo : stacksRef.current.redo;
      const command = source[source.length - 1];
      if (!command) return;
      busyRef.current = true;
      setBusy(true);
      try {
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
    [clear, onApplied, runOps, writeStacks]
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
