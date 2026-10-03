import assert from "node:assert/strict";
import test from "node:test";

import { alignBoxes, distributeBoxes, mergeDefined } from "../../src/components/organizer/floorplan/floorPlanGeometry";

// Four pillars like the browser E2E: same size, scattered, none on the same x.
const pillars = [
  { id: "a", x: 100, y: 500, width: 36, height: 36 },
  { id: "b", x: 330, y: 560, width: 36, height: 36 },
  { id: "c", x: 600, y: 470, width: 36, height: 36 },
  { id: "d", x: 900, y: 590, width: 36, height: 36 },
];

test("align left only changes x, so its patch has no y", () => {
  const patches = alignBoxes(pillars, "left");
  assert.deepEqual(
    patches.map((p) => p.id),
    ["b", "c", "d"],
  );
  for (const patch of patches) {
    assert.equal(patch.x, 100);
    assert.equal(patch.y, undefined);
  }
});

test("a plain spread of an align patch erases y; mergeDefined keeps it", () => {
  const [patch] = alignBoxes(pillars, "left");
  // The patch the editor builds is { x: p.x, y: p.y }, which carries an explicit undefined.
  const editorPatch = { x: patch.x, y: patch.y };
  const element = pillars[1];

  const spread = { ...element, ...editorPatch };
  assert.equal(spread.y, undefined, "this is the bug a plain spread causes");

  const merged = mergeDefined(element, editorPatch);
  assert.equal(merged.x, 100);
  assert.equal(merged.y, 560);
  assert.equal(merged.width, 36);
  assert.equal(merged.height, 36);
});

test("every element still has a numeric x and y after an align or distribute is applied locally", () => {
  const apply = (patches: Array<{ id: string; x?: number; y?: number }>) =>
    pillars.map((e) => {
      const p = patches.find((patch) => patch.id === e.id);
      return p ? mergeDefined(e, { x: p.x, y: p.y }) : e;
    });

  for (const mode of ["left", "right", "hcenter", "top", "bottom", "vcenter"] as const) {
    for (const e of apply(alignBoxes(pillars, mode))) {
      assert.equal(typeof e.x, "number", `${mode}: x`);
      assert.equal(typeof e.y, "number", `${mode}: y`);
    }
  }
  for (const axis of ["horizontal", "vertical"] as const) {
    for (const e of apply(distributeBoxes(pillars, axis))) {
      assert.equal(typeof e.x, "number", `${axis}: x`);
      assert.equal(typeof e.y, "number", `${axis}: y`);
    }
  }
});

test("mergeDefined applies defined values, including zero and null, and does not mutate its input", () => {
  const source = { x: 5, y: 7, label: "Gate" as string | null, rotation: 90 };
  const merged = mergeDefined(source, { x: 0, label: null, y: undefined, rotation: undefined });
  assert.deepEqual(merged, { x: 0, y: 7, label: null, rotation: 90 });
  assert.deepEqual(source, { x: 5, y: 7, label: "Gate", rotation: 90 });
});
