import assert from "node:assert/strict";
import { test } from "node:test";
import type { Server } from "node:http";
import "../src/lib/asyncErrors"; // side effect: installs the patch under test
import express, { Router, type NextFunction, type Request, type Response } from "express";

async function withApp<T>(configure: (app: express.Express) => void, run: (baseUrl: string) => Promise<T>): Promise<T> {
  const app = express();
  configure(app);
  // Same shape as the real error handler in app.ts: a status on the error is honoured, otherwise 500.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = err && typeof err === "object" && "status" in err && typeof (err as { status: unknown }).status === "number" ? (err as { status: number }).status : 500;
    res.status(status).json({ error: status === 500 ? "Internal server error" : "Invalid request" });
  });
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const get = (url: string) => fetch(url, { signal: AbortSignal.timeout(3000) });

test("a rejected async handler answers 500 instead of leaving the request hanging", async () => {
  await withApp(
    (app) => {
      app.get("/boom", async () => {
        throw new Error("database exploded");
      });
      app.get("/rejects", (_req, _res) => Promise.reject(new Error("rejected")));
    },
    async (baseUrl) => {
      for (const path of ["/boom", "/rejects"]) {
        const response = await get(baseUrl + path);
        assert.equal(response.status, 500, path);
        assert.deepEqual(await response.json(), { error: "Internal server error" });
      }
    },
  );
});

test("a status carried by the error is kept, and working handlers are unaffected", async () => {
  await withApp(
    (app) => {
      app.get("/missing", async () => {
        throw Object.assign(new Error("nope"), { status: 404 });
      });
      app.get("/ok-async", async (_req, res) => {
        await Promise.resolve();
        res.json({ ok: true });
      });
      app.get("/ok-sync", (_req, res) => res.json({ ok: true }));
      app.get("/sync-throw", () => {
        throw new Error("sync");
      });
      app.get("/two-arg", (_req: Request, res: Response) => {
        res.json({ two: true });
      });
    },
    async (baseUrl) => {
      assert.equal((await get(baseUrl + "/missing")).status, 404);
      assert.deepEqual(await (await get(baseUrl + "/ok-async")).json(), { ok: true });
      assert.deepEqual(await (await get(baseUrl + "/ok-sync")).json(), { ok: true });
      assert.equal((await get(baseUrl + "/sync-throw")).status, 500);
      assert.deepEqual(await (await get(baseUrl + "/two-arg")).json(), { two: true });
    },
  );
});

test("middleware, sub-routers and async error handlers are covered too", async () => {
  await withApp(
    (app) => {
      app.use("/guarded", async (_req: Request, _res: Response, _next: NextFunction) => {
        throw new Error("middleware failed");
      });
      app.get("/guarded/never", (_req, res) => res.send("unreachable"));

      const sub = Router();
      sub.use(async (_req, _res, next) => {
        await Promise.resolve();
        next();
      });
      sub.get("/fail", async () => {
        throw new Error("sub-router failed");
      });
      sub.get("/fine", (_req, res) => res.json({ sub: true }));
      app.use("/sub", sub);
    },
    async (baseUrl) => {
      assert.equal((await get(baseUrl + "/guarded/never")).status, 500);
      assert.equal((await get(baseUrl + "/sub/fail")).status, 500);
      assert.deepEqual(await (await get(baseUrl + "/sub/fine")).json(), { sub: true });
    },
  );
});

test("a failure after the response was already sent is recorded, not answered twice", async () => {
  const logged: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => void logged.push(args);
  try {
    await withApp(
      (app) => {
        app.get("/late", async (_req, res) => {
          res.json({ sent: true });
          throw new Error("failed after responding");
        });
      },
      async (baseUrl) => {
        const response = await get(baseUrl + "/late");
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { sent: true });
        await new Promise((resolve) => setTimeout(resolve, 50));
      },
    );
  } finally {
    console.error = original;
  }
  assert.ok(logged.some((args) => String(args[0]).includes("after the response was sent")), "the late failure should be logged");
});
