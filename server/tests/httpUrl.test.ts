import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test, before, after } from "node:test";
import { prisma } from "../src/lib/prisma";
import { httpUrl, httpUrlOrEmpty, normalizeHttpUrl } from "../src/lib/httpUrl";
import { safeHref } from "../../src/lib/safeHref";
import { startTestServer } from "./helpers/testServer";
import { bootstrapOrganizer, cleanupOrganizers } from "./helpers/entitlementFixtures";

test("normalizeHttpUrl accepts web addresses and rejects every other scheme", () => {
  assert.equal(normalizeHttpUrl("https://example.com/a?b=1"), "https://example.com/a?b=1");
  assert.equal(normalizeHttpUrl("http://example.com"), "http://example.com");
  assert.equal(normalizeHttpUrl("  example.com/path "), "https://example.com/path");
  assert.equal(normalizeHttpUrl("HTTPS://Example.com"), "HTTPS://Example.com");

  for (const bad of [
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "ftp://example.com",
    "//example.com",
    String.fromCharCode(92, 92) + "example.com",
    "https://",
    "https://exa mple.com",
    "https://example.com/\u0000",
    "java\nscript:alert(1)",
    "not a url",
    "",
    "   ",
    "localhost-without-dot",
  ]) {
    assert.equal(normalizeHttpUrl(bad), null, `should reject ${JSON.stringify(bad)}`);
  }
});

test("httpUrl enforces the length limit and httpUrlOrEmpty lets a blank value through", () => {
  assert.equal(httpUrl(30).safeParse("https://example.com/" + "a".repeat(40)).success, false);
  assert.equal(httpUrl().safeParse("javascript:alert(1)").success, false);
  assert.deepEqual(httpUrl().safeParse("example.com"), { success: true, data: "https://example.com" });
  assert.equal(httpUrlOrEmpty().safeParse("").success, true);
  assert.equal(httpUrlOrEmpty().safeParse("javascript:alert(1)").success, false);
});

test("route schemas never use zod's .url(), which accepts javascript: and data: links", () => {
  const routeRoot = path.resolve(__dirname, "..", "src", "routes");
  const offenders = fs
    .readdirSync(routeRoot)
    .filter((name) => name.endsWith(".ts"))
    .filter((name) => /\.url\(\)/.test(fs.readFileSync(path.join(routeRoot, name), "utf8")));
  assert.deepEqual(offenders, [], `Use httpUrl()/httpUrlOrEmpty() from lib/httpUrl.ts instead of .url() in: ${offenders.join(", ")}`);
});

let baseUrl: string;
let stop: () => Promise<void>;
const organizerIds: string[] = [];

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await cleanupOrganizers(organizerIds);
  await stop();
  await prisma.$disconnect();
});

test("the organizer profile rejects a javascript: website and stores a normalized one", async () => {
  const organizer = await bootstrapOrganizer(baseUrl, "http-url", Date.now());
  organizerIds.push(organizer.organizerId);
  const put = (website: string) =>
    fetch(`${baseUrl}/api/organizer/profile`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${organizer.token}` },
      body: JSON.stringify({ website }),
    });

  assert.equal((await put("javascript:alert(document.cookie)")).status, 400);
  assert.equal((await put("data:text/html,<script>alert(1)</script>")).status, 400);

  const ok = await put("organizer.example.com");
  assert.equal(ok.status, 200, JSON.stringify(await ok.clone().json()));
  const stored = await prisma.organizer.findUnique({ where: { id: organizer.organizerId }, select: { website: true } });
  assert.equal(stored?.website, "https://organizer.example.com");
});

test("the frontend safeHref keeps web, mail and phone links and drops everything else", () => {
  assert.equal(safeHref("https://example.com/a"), "https://example.com/a");
  assert.equal(safeHref("  http://example.com "), "http://example.com");
  assert.equal(safeHref("mailto:hello@example.com"), "mailto:hello@example.com");
  assert.equal(safeHref("tel:+911234567890"), "tel:+911234567890");

  for (const bad of ["javascript:alert(1)", " JavaScript:alert(1)", "java	script:alert(1)", "data:text/html,x", "vbscript:x", "file:///etc/passwd", "example.com", "/relative", "", "   ", null, undefined]) {
    assert.equal(safeHref(bad), undefined, `should drop ${JSON.stringify(bad)}`);
  }
});
