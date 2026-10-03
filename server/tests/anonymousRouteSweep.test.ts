import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { app } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

/**
 * Every registered route is called with no credentials. A route answers 401 unless it is listed in
 * `publicRoutes`. This reads the router the running app actually uses, so it also catches a route
 * mounted before its auth middleware or one added to a new file without any.
 */

type Layer = {
  route?: { path: string; methods: Record<string, boolean> };
  name: string;
  regexp: RegExp & { fast_slash?: boolean };
  handle: { stack?: Layer[] };
};

function mountPath(layer: Layer): string {
  if (layer.regexp.fast_slash) return "";
  const source = layer.regexp.source.replace(/^\^/, "").replace("\\/?(?=\\/|$)", "").split("\\/").join("/");
  if (/[()[\]*+?\\]/.test(source)) throw new Error(`Cannot read mount path from ${layer.regexp.source}`);
  return source;
}

function collectRoutes(stack: Layer[], prefix: string, into: Array<{ method: string; path: string }>) {
  for (const layer of stack) {
    if (layer.route) {
      for (const method of Object.keys(layer.route.methods)) {
        if (layer.route.methods[method]) into.push({ method: method.toUpperCase(), path: prefix + String(layer.route.path) });
      }
    } else if (layer.name === "router" && layer.handle.stack) {
      collectRoutes(layer.handle.stack, prefix + mountPath(layer), into);
    }
  }
}

function registeredRoutes(): Array<{ method: string; path: string }> {
  const routes: Array<{ method: string; path: string }> = [];
  collectRoutes((app as unknown as { _router: { stack: Layer[] } })._router.stack, "", routes);
  return routes;
}

/** Routes that are meant to answer without a login, grouped by the reason. */
const publicRouteGroups: Array<{ reason: string; routes: string[] }> = [
  { reason: "Sign in and sign up", routes: ["POST /api/auth/login", "POST /api/auth/signup"] },
  { reason: "Health probes", routes: ["GET /api/health", "GET /api/health/ready"] },
  { reason: "Crawler files", routes: ["GET /robots.txt", "GET /sitemap.xml"] },
  {
    reason: "Provider webhooks: authenticated by signature, not by login",
    routes: ["POST /api/webhooks/payments/:provider", "GET /api/webhooks/whatsapp/"],
  },
  { reason: "Public object storage for published media", routes: ["GET /api/storage/public/:key(*)"] },
  {
    reason: "Public forms and quotes visitors use before they have an account",
    routes: ["POST /api/registrations/", "POST /api/public/demo-requests", "GET /api/pricing/quote"],
  },
  {
    reason: "Anonymous visitor personalization",
    routes: ["POST /api/personalization/interactions", "GET /api/personalization/recommendations"],
  },
  {
    reason: "Public discovery and profile pages",
    routes: [
      "GET /api/public/discover",
      "GET /api/public/event-categories",
      "GET /api/public/events",
      "GET /api/public/events/:id",
      "GET /api/public/events/:id/participants",
      "GET /api/public/events/:id/participants/:participantId/media",
      "GET /api/public/events/:id/participants/:participantId/profile",
      "GET /api/public/events/:id/participants/:participantId/sessions",
      "GET /api/public/events/:id/partners/specialized",
      "GET /api/public/events/:id/sessions",
      "GET /api/public/events/:id/sponsors",
      "GET /api/public/events/:id/tickets",
      "GET /api/public/events/:id/vendors/specialized",
      "GET /api/public/events/:id/venue-maps",
      "GET /api/public/exhibitions",
      "GET /api/public/exhibitions/:id",
      "GET /api/public/exhibitions/:id/exhibitors",
      "GET /api/public/exhibitions/:id/floor-plan",
      "GET /api/public/exhibitions/:id/floor-plans",
      "GET /api/public/organizers/:slug",
      "GET /api/public/organizers/:slug/events",
      "GET /api/public/organizers/:slug/gallery",
    ],
  },
];
const publicRoutes = new Set(publicRouteGroups.flatMap((group) => group.routes));

let baseUrl: string;
let stop: () => Promise<void>;

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await stop();
  await prisma.$disconnect();
});

function concretePath(path: string): string {
  return path.replace(/:[A-Za-z0-9_]+(\([^)]*\))?\*?/g, "00000000-0000-4000-8000-000000000000");
}

test("every route that is not listed as public rejects a request with no credentials", async () => {
  const routes = registeredRoutes();
  assert.ok(routes.length > 300, `expected to find the whole API, found ${routes.length} routes`);

  const open: string[] = [];
  for (const { method, path } of routes) {
    const key = `${method} ${path}`;
    if (publicRoutes.has(key)) continue;
    try {
      const response = await fetch(baseUrl + concretePath(path), {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "GET" || method === "HEAD" ? undefined : "{}",
        // A handler that runs without a user and crashes never answers; count that as open too.
        signal: AbortSignal.timeout(5000),
      });
      await response.arrayBuffer();
      if (response.status !== 401) open.push(`${key} -> ${response.status}`);
    } catch {
      open.push(`${key} -> no response`);
    }
  }

  assert.deepEqual(open, [], `Routes that answered without credentials. Protect them, or list them as public with a reason:\n${open.join("\n")}`);
});

test("every route listed as public still exists", () => {
  const registered = new Set(registeredRoutes().map(({ method, path }) => `${method} ${path}`));
  const stale = [...publicRoutes].filter((key) => !registered.has(key));
  assert.deepEqual(stale, [], `Listed as public but not registered (remove them): ${stale.join(", ")}`);
});

/** Admin-only prefixes: a signed-in user who is not a platform admin must be refused. */
const adminOnly = (method: string, path: string) =>
  path.startsWith("/api/platform/") || (method === "GET" && path === "/api/personalization/analytics");

test("a signed-in user who is not a platform admin is refused on every admin route", async () => {
  const email = `route-sweep-${Date.now()}@example.com`;
  const signup = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fullName: "Route Sweep", email, password: "SweepPassw0rd!x", userType: "visitor" }),
  });
  const body = await signup.json();
  assert.equal(signup.status, 201, JSON.stringify(body));
  try {
    const wrong: string[] = [];
    let checked = 0;
    for (const { method, path } of registeredRoutes().filter((route) => adminOnly(route.method, route.path))) {
      checked += 1;
      try {
        const response = await fetch(baseUrl + concretePath(path), {
          method,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${body.token}` },
          body: method === "GET" || method === "HEAD" ? undefined : "{}",
          signal: AbortSignal.timeout(5000),
        });
        await response.arrayBuffer();
        if (response.status !== 403) wrong.push(`${method} ${path} -> ${response.status}`);
      } catch {
        wrong.push(`${method} ${path} -> no response`);
      }
    }
    assert.ok(checked > 20, `expected to check the admin API, only found ${checked} routes`);
    assert.deepEqual(wrong, [], `Admin routes that did not answer 403 to an ordinary user:\n${wrong.join("\n")}`);
  } finally {
    await prisma.user.deleteMany({ where: { email } });
  }
});
