// Pure geometry helpers for the floor plan editor. Coordinates are canvas
// units (the same units stored on FloorPlanObject), never screen pixels.

export interface Box {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type AlignMode = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";
export type DistributeAxis = "horizontal" | "vertical";

/** Names for the align actions, used in undo labels and tooltips by both stalls and plan elements. */
export const ALIGN_LABELS: Record<AlignMode, string> = {
  left: "Align left",
  hcenter: "Align centers horizontally",
  right: "Align right",
  top: "Align top",
  vcenter: "Align centers vertically",
  bottom: "Align bottom",
};

export interface BoxPatch {
  id: string;
  x?: number;
  y?: number;
}

export const GRID_SIZE = 10;
const EPSILON = 0.005;

/** The server stores two decimals; round before sending so what we show is what is saved. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function snapToGrid(value: number, enabled: boolean): number {
  return enabled ? Math.round(value / GRID_SIZE) * GRID_SIZE : value;
}

export function clampRange(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function boundsOf(boxes: Box[]): { left: number; top: number; right: number; bottom: number } {
  return {
    left: Math.min(...boxes.map((b) => b.x)),
    top: Math.min(...boxes.map((b) => b.y)),
    right: Math.max(...boxes.map((b) => b.x + b.width)),
    bottom: Math.max(...boxes.map((b) => b.y + b.height)),
  };
}

/** Anything already on the canvas that new stalls must not land on: a stall or a plan element. */
export interface Obstacle extends Box {
  rotation?: number;
}

/** The axis-aligned box a (possibly rotated) rectangle actually covers on the canvas. */
export function visualBounds(o: Obstacle): Box {
  const angle = ((o.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  const width = o.width * cos + o.height * sin;
  const height = o.width * sin + o.height * cos;
  const cx = o.x + o.width / 2;
  const cy = o.y + o.height / 2;
  return { id: o.id, x: cx - width / 2, y: cy - height / 2, width, height };
}

const DEFAULT_MARGIN = 20;
const DEFAULT_CLEARANCE = 10;
const DEFAULT_SEARCH_STEP = 20;

function candidates(start: number, last: number, step: number): number[] {
  const values: number[] = [];
  for (let v = start; v <= last; v += step) values.push(round2(v));
  // The far edge itself is a valid spot even when it is not a multiple of the step.
  if (last >= start && values[values.length - 1] !== round2(last)) values.push(round2(last));
  return values;
}

export interface FreeSpotOptions {
  /** Do not look above this y (used to prefer the area below existing stalls). */
  startY?: number;
  margin?: number;
  /** Empty space kept around every obstacle. */
  clearance?: number;
  step?: number;
}

/**
 * The first place, scanning left to right and top to bottom, where a `width` x `height`
 * block fits on the canvas without touching any obstacle (rotated ones count at their
 * rotated size) and while keeping `margin` from the canvas edge. Null when there is none.
 */
export function findFreeSpot(
  width: number,
  height: number,
  obstacles: Obstacle[],
  canvasWidth: number,
  canvasHeight: number,
  options: FreeSpotOptions = {}
): { x: number; y: number } | null {
  const margin = options.margin ?? DEFAULT_MARGIN;
  const clearance = options.clearance ?? DEFAULT_CLEARANCE;
  const step = options.step ?? DEFAULT_SEARCH_STEP;
  const lastX = canvasWidth - width - margin;
  const lastY = canvasHeight - height - margin;
  if (lastX < margin || lastY < margin) return null;

  const blocked = obstacles.map((o) => {
    const b = visualBounds(o);
    return { left: b.x - clearance, top: b.y - clearance, right: b.x + b.width + clearance, bottom: b.y + b.height + clearance };
  });
  const xs = candidates(margin, lastX, step);
  const ys = candidates(Math.max(margin, options.startY ?? margin), lastY, step);
  for (const y of ys) {
    for (const x of xs) {
      const clear = blocked.every((b) => x >= b.right || x + width <= b.left || y >= b.bottom || y + height <= b.top);
      if (clear) return { x, y };
    }
  }
  return null;
}

/**
 * Where a new block of stalls should start. It prefers the area below everything already
 * on the canvas (as before), but steps around plan elements such as aisles and labels,
 * and falls back to any free area higher up. Null when no area is large enough.
 */
export function placeBlock(
  width: number,
  height: number,
  stalls: Obstacle[],
  elements: Obstacle[],
  canvasWidth: number,
  canvasHeight: number
): { x: number; y: number } | null {
  const all = [...stalls, ...elements];
  const startY = stalls.length > 0 ? boundsOf(stalls.map(visualBounds)).bottom + DEFAULT_MARGIN : DEFAULT_MARGIN;
  return (
    findFreeSpot(width, height, all, canvasWidth, canvasHeight, { startY }) ??
    findFreeSpot(width, height, all, canvasWidth, canvasHeight, { startY: DEFAULT_MARGIN })
  );
}

/** Size of a `count`-stall block laid out in `columns` rows of `width` x `height` stalls. */
export function blockSize(
  count: number,
  columns: number,
  width: number,
  height: number,
  gap: number
): { cols: number; rows: number; totalWidth: number; totalHeight: number } {
  const cols = Math.max(1, Math.min(columns, count));
  const rows = Math.ceil(count / cols);
  return { cols, rows, totalWidth: cols * width + (cols - 1) * gap, totalHeight: rows * height + (rows - 1) * gap };
}

/**
 * Lays `count` square stalls out in a grid in free space, never on top of an existing stall
 * or plan element. As before, it first tries the area below everything already placed
 * (largest cells first, shrinking only when nothing fits); aisles, entrances and labels
 * in that area are stepped around. Only when no size fits there does it look for free
 * space anywhere else on the canvas. Returns null when there is no room, so the caller
 * can say so instead of placing stalls somewhere the server would reject.
 */
export function layoutUnmapped(
  count: number,
  canvasWidth: number,
  canvasHeight: number,
  stalls: Obstacle[],
  elements: Obstacle[] = []
): Array<{ x: number; y: number; size: number }> | null {
  const margin = DEFAULT_MARGIN;
  const gap = 10;
  const all = [...stalls, ...elements];
  const belowStalls = stalls.length > 0 ? boundsOf(stalls.map(visualBounds)).bottom + margin : margin;
  const searches = belowStalls > margin ? [belowStalls, margin] : [margin];

  for (const startY of searches) {
    for (let size = 100; size >= 30; size -= 10) {
      const maxCols = Math.floor((canvasWidth - margin * 2 + gap) / (size + gap));
      if (maxCols < 1) continue;
      for (let cols = Math.min(maxCols, count); cols >= 1; cols -= 1) {
        const { totalWidth, totalHeight } = blockSize(count, cols, size, size, gap);
        // Fewer columns only make the block taller, so stop once it can't fit the canvas at all.
        if (totalHeight > canvasHeight - margin * 2) break;
        const spot = findFreeSpot(totalWidth, totalHeight, all, canvasWidth, canvasHeight, { startY });
        if (!spot) continue;
        return Array.from({ length: count }, (_, i) => ({
          x: round2(spot.x + (i % cols) * (size + gap)),
          y: round2(spot.y + Math.floor(i / cols) * (size + gap)),
          size,
        }));
      }
    }
  }
  return null;
}

/** Aligns every box to the selection's bounding box. Only boxes that actually move are returned. */
/**
 * Applies a patch to a copy of `target`, ignoring keys whose value is undefined.
 *
 * Align and distribute only change one axis, so their patch looks like { x: 100, y: undefined }.
 * A plain `{ ...target, ...patch }` would overwrite the real y with undefined until the next
 * server refresh, and anything that read the element in that window (such as the undo entry for a
 * remove) would carry a missing y and be rejected by the server.
 */
export function mergeDefined<T extends object>(target: T, patch: Partial<T>): T {
  const defined = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
  return { ...target, ...defined };
}

export function alignBoxes(boxes: Box[], mode: AlignMode): BoxPatch[] {
  if (boxes.length < 2) return [];
  const b = boundsOf(boxes);
  const patches: BoxPatch[] = [];
  for (const box of boxes) {
    let x = box.x;
    let y = box.y;
    if (mode === "left") x = b.left;
    else if (mode === "right") x = b.right - box.width;
    else if (mode === "hcenter") x = (b.left + b.right) / 2 - box.width / 2;
    else if (mode === "top") y = b.top;
    else if (mode === "bottom") y = b.bottom - box.height;
    else y = (b.top + b.bottom) / 2 - box.height / 2;
    x = round2(x);
    y = round2(y);
    const patch: BoxPatch = { id: box.id };
    if (Math.abs(x - box.x) > EPSILON) patch.x = x;
    if (Math.abs(y - box.y) > EPSILON) patch.y = y;
    if (patch.x !== undefined || patch.y !== undefined) patches.push(patch);
  }
  return patches;
}

/**
 * Spaces three or more boxes evenly between the outermost two along one axis.
 * The first and last box stay where they are. Only boxes that move are returned.
 */
export function distributeBoxes(boxes: Box[], axis: DistributeAxis): BoxPatch[] {
  if (boxes.length < 3) return [];
  const horizontal = axis === "horizontal";
  const sorted = [...boxes].sort((a, b) => (horizontal ? a.x - b.x : a.y - b.y));
  const b = boundsOf(boxes);
  const start = horizontal ? b.left : b.top;
  const end = horizontal ? b.right : b.bottom;
  const sizeSum = sorted.reduce((sum, box) => sum + (horizontal ? box.width : box.height), 0);
  const gap = (end - start - sizeSum) / (sorted.length - 1);
  const patches: BoxPatch[] = [];
  let cursor = start;
  for (const box of sorted) {
    const next = round2(cursor);
    const current = horizontal ? box.x : box.y;
    if (Math.abs(next - current) > EPSILON) patches.push(horizontal ? { id: box.id, x: next } : { id: box.id, y: next });
    cursor += (horizontal ? box.width : box.height) + gap;
  }
  return patches;
}

export function intersects(
  box: Box,
  rect: { left: number; top: number; right: number; bottom: number }
): boolean {
  return box.x < rect.right && box.x + box.width > rect.left && box.y < rect.bottom && box.y + box.height > rect.top;
}
