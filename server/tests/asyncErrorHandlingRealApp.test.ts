import assert from "node:assert/strict";
import { test } from "node:test";
import { app } from "../src/app";

// Deliberately does not import lib/asyncErrors: the app itself must install the patch before it
// creates any router, otherwise this fails (importing it here would hide that).
const ASYNC_SAFE = Symbol.for("exhibittix.asyncSafeHandler");

test("every handler of the real app was registered through the patch", () => {
  type Layer = { route?: { stack: Array<{ handle: Record<symbol, unknown> }> }; name: string; handle: Record<symbol, unknown> & { stack?: Layer[] } };
  const unwrapped: string[] = [];
  const visit = (stack: Layer[], where: string) => {
    for (const layer of stack) {
      if (layer.route) {
        for (const inner of layer.route.stack) if (!inner.handle[ASYNC_SAFE]) unwrapped.push(`${where} route handler`);
      } else if (layer.handle.stack) {
        visit(layer.handle.stack, where + "/" + layer.name);
      } else if (!layer.handle[ASYNC_SAFE]) {
        unwrapped.push(`${where} ${layer.name}`);
      }
    }
  };
  visit((app as unknown as { _router: { stack: Layer[] } })._router.stack, "app");
  // Express's own built-ins (query, expressInit) and third-party middleware are created before the
  // patch can matter or are not async; only a route handler or router escaping it would be a problem.
  const handlersMissed = unwrapped.filter((entry) => entry.endsWith("route handler"));
  assert.deepEqual(handlersMissed, [], "route handlers registered before lib/asyncErrors was imported");
});
