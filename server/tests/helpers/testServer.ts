import { app } from "../../src/app";
import type { Server } from "http";

/**
 * Starts the real, fully-configured Express app (server/src/app.ts) on an
 * ephemeral port for the duration of a test file — the same app index.ts
 * runs in production, just not bound to the fixed :4000 port so multiple
 * test files (each Node test-runner file gets its own process) never
 * collide. Always call stop() in an `after()` hook.
 */
export function startTestServer(): Promise<{ baseUrl: string; stop: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server: Server = app.listen(0, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to determine test server port"));
        return;
      }
      resolve({
        baseUrl: `http://localhost:${address.port}`,
        stop: () => new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}
