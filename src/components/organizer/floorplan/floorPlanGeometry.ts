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

/**
 * Where a new block of stalls should start: below everything already on the
 * canvas, so generated stalls never land on top of existing ones.
 */
export function blockOrigin(existing: Box[], margin = 20): { x: number; y: number } {
  if (existing.length === 0) return { x: margin, y: margin };
  return { x: margin, y: round2(boundsOf(existing).bottom + margin) };
}

export interface BlockLayout {
  rows: number;
  totalWidth: number;
  totalHeight: number;
  fits: boolean;
}

/** Size of a `count`-stall block laid out in `columns`, and whether it fits on the canvas. */
export function blockLayout(
  count: number,
  columns: number,
  width: number,
  height: number,
  gap: number,
  origin: { x: number; y: number },
  canvasWidth: number,
  canvasHeight: number
): BlockLayout {
  const cols = Math.max(1, Math.min(columns, count));
  const rows = Math.ceil(count / cols);
  const totalWidth = cols * width + (cols - 1) * gap;
  const totalHeight = rows * height + (rows - 1) * gap;
  return {
    rows,
    totalWidth,
    totalHeight,
    fits: origin.x + totalWidth <= canvasWidth && origin.y + totalHeight <= canvasHeight,
  };
}

/**
 * Lays `count` square stalls out in a grid in the free area below everything
 * already on the canvas, shrinking the cells until they all fit. Returns null
 * when there is no room, so the caller can say so instead of placing stalls
 * outside the canvas (the server rejects out-of-bounds objects).
 */
export function layoutUnmapped(
  count: number,
  canvasWidth: number,
  canvasHeight: number,
  existing: Box[]
): Array<{ x: number; y: number; size: number }> | null {
  const margin = 20;
  const gap = 10;
  const top = blockOrigin(existing, margin).y;
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

/** Aligns every box to the selection's bounding box. Only boxes that actually move are returned. */
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
