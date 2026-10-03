/**
 * Express 4 does not look at the promise an async handler returns, so when one rejects (a failed
 * query, an unexpected null) nothing answers the request: the client waits until it times out and
 * the error only reaches the "Unhandled promise rejection" log line. This forwards a rejection to
 * `next(error)` like a thrown error, so the shared error handler logs it with the request id and
 * replies 500 immediately.
 *
 * Every handler goes through Express's `Layer` constructor, so patching it here covers all routes
 * without touching them. It must be imported before any router is created (first import of app.ts).
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Layer = require("express/lib/router/layer") as { prototype: Record<string, unknown> };

/** Marks a wrapped handler, so tests can verify nothing was registered before the patch ran. */
export const ASYNC_SAFE = Symbol.for("exhibittix.asyncSafeHandler");

type AnyHandler = ((...args: unknown[]) => unknown) & { [ASYNC_SAFE]?: boolean; stack?: unknown; handle?: unknown };
type NextFn = (error?: unknown) => void;
type ResponseLike = { headersSent?: boolean };

// A router or mounted app is middleware too, but its own layers are wrapped individually.
function isRouterLike(fn: AnyHandler): boolean {
  return Array.isArray(fn.stack) || typeof fn.handle === "function";
}

function forwardRejection(result: unknown, res: ResponseLike, next: NextFn) {
  if (!result || typeof (result as Promise<unknown>).catch !== "function") return;
  (result as Promise<unknown>).catch((error: unknown) => {
    if (res.headersSent) {
      // The client already has an answer; a second one is impossible, so only record it.
      console.error("Async handler failed after the response was sent:", error);
      return;
    }
    next(error);
  });
}

function wrap(fn: unknown): unknown {
  if (typeof fn !== "function") return fn;
  const handler = fn as AnyHandler;
  if (handler[ASYNC_SAFE] || isRouterLike(handler)) return fn;

  // Express tells error handlers apart by their arity, so the wrapper keeps it.
  const wrapped: AnyHandler =
    handler.length === 4
      ? function (err: unknown, req: unknown, res: unknown, next: unknown) {
          const result = handler(err, req, res, next);
          forwardRejection(result, res as ResponseLike, next as NextFn);
          return result;
        }
      : function (req: unknown, res: unknown, next: unknown) {
          const result = handler(req, res, next);
          forwardRejection(result, res as ResponseLike, next as NextFn);
          return result;
        };
  wrapped[ASYNC_SAFE] = true;
  return wrapped;
}

Object.defineProperty(Layer.prototype, "handle", {
  enumerable: true,
  configurable: true,
  get(this: { __handle?: unknown }) {
    return this.__handle;
  },
  set(this: { __handle?: unknown }, fn: unknown) {
    this.__handle = wrap(fn);
  },
});
