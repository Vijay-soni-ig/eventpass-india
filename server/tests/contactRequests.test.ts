import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { ipKeyGenerator } from "express-rate-limit";
import { startTestServer } from "./helpers/testServer";
import { contactRequestRateLimit } from "../src/middleware/rateLimit";

const ts = Date.now();
let baseUrl: string;
let stop: () => Promise<void>;
const emails: string[] = [];

function validBody(label: string, overrides: Record<string, unknown> = {}) {
  const email = `contact-${label}-${ts}@example.com`;
  emails.push(email);
  return {
    userType: "exhibitor",
    name: "Asha Contact",
    email,
    phone: "+91 98765 43210",
    subject: "Question about stall booking",
    message: "I would like to know how stall booking and payment works for my company.",
    utmSource: "newsletter",
    utmCampaign: "launch",
    ...overrides,
  };
}

// Every request counts toward the per-IP allowance, so tests that are not about throttling start from a clean bucket.
async function resetLimiter() {
  for (const ip of ["127.0.0.1", "::1", "::ffff:127.0.0.1"]) await contactRequestRateLimit.resetKey(ipKeyGenerator(ip));
}

async function post(body: unknown, { keepLimiter = false } = {}) {
  if (!keepLimiter) await resetLimiter();
  return fetch(`${baseUrl}/api/public/contact-requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  try {
    const tickets = await prisma.supportTicket.findMany({ where: { requesterEmail: { in: emails.map((e) => e.toLowerCase()) } }, select: { id: true } });
    const ids = tickets.map((t) => t.id);
    if (ids.length) {
      await prisma.auditLog.deleteMany({ where: { entityType: "SupportTicket", entityId: { in: ids } } });
      await prisma.supportTicket.deleteMany({ where: { id: { in: ids } } });
    }
  } finally {
    await stop();
  }
});

test("contact request: a valid submission is persisted as a support ticket and acknowledged", async () => {
  const body = validBody("valid");
  const res = await post(body);
  assert.equal(res.status, 201);
  assert.deepEqual(await res.json(), { accepted: true });

  const ticket = await prisma.supportTicket.findFirstOrThrow({
    where: { requesterEmail: body.email },
    include: { messages: true },
  });
  assert.equal(ticket.kind, "support");
  assert.equal(ticket.category, "exhibitor");
  assert.equal(ticket.status, "open");
  assert.equal(ticket.source, "contact_page");
  assert.equal(ticket.subject, body.subject);
  assert.equal(ticket.requesterName, "Asha Contact");
  assert.equal(ticket.utmSource, "newsletter");
  assert.equal(ticket.utmCampaign, "launch");
  assert.equal(ticket.messages.length, 1);
  assert.match(ticket.messages[0].body, /stall booking and payment/);
  assert.match(ticket.messages[0].body, /\+91 98765 43210/);
  assert.equal(await prisma.auditLog.count({ where: { entityId: ticket.id, action: "marketing.contact_request_created" } }), 1);
});

test("contact request: the email is stored lower-cased and a visitor maps to the visitor category", async () => {
  const body = validBody("Case", { userType: "visitor", email: `Contact-Case-${ts}@Example.com` });
  emails.push(body.email);
  assert.equal((await post(body)).status, 201);
  const ticket = await prisma.supportTicket.findFirstOrThrow({ where: { requesterEmail: body.email.toLowerCase() } });
  assert.equal(ticket.category, "visitor");
});

test("contact request: every required field is enforced by the server", async () => {
  for (const field of ["userType", "name", "email", "subject", "message"]) {
    const body = validBody(`missing-${field}`) as Record<string, unknown>;
    delete body[field];
    const res = await post(body);
    assert.equal(res.status, 400, `missing ${field}`);
    assert.equal(await prisma.supportTicket.count({ where: { requesterEmail: String(body.email).toLowerCase() } }), 0);
  }
});

test("contact request: an invalid email, phone or user type is rejected", async () => {
  assert.equal((await post(validBody("bad-email", { email: "not-an-email" }))).status, 400);
  assert.equal((await post(validBody("bad-phone", { phone: "abc" }))).status, 400);
  assert.equal((await post(validBody("bad-type", { userType: "admin" }))).status, 400);
  assert.equal((await post(validBody("short-message", { message: "too short" }))).status, 400);
});

test("contact request: oversized input is rejected and nothing is stored", async () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ["long-name", { name: "n".repeat(101) }],
    ["long-subject", { subject: "s".repeat(151) }],
    ["long-message", { message: "m".repeat(2001) }],
    ["long-utm", { utmSource: "u".repeat(101) }],
  ];
  for (const [label, override] of cases) {
    const body = validBody(label, override);
    assert.equal((await post(body)).status, 400, label);
    assert.equal(await prisma.supportTicket.count({ where: { requesterEmail: body.email } }), 0, label);
  }
});

test("contact request: HTML in text fields is stored as plain text, never interpreted by the API", async () => {
  const body = validBody("html", { message: "<script>alert(1)</script> please call me about stalls" });
  const res = await post(body);
  assert.equal(res.status, 201);
  assert.equal((res.headers.get("content-type") ?? "").includes("application/json"), true);
  const ticket = await prisma.supportTicket.findFirstOrThrow({ where: { requesterEmail: body.email }, include: { messages: true } });
  assert.match(ticket.messages[0].body, /<script>alert\(1\)<\/script>/);
});

test("contact request: a honeypot submission looks successful but stores nothing", async () => {
  const body = validBody("honeypot", { website: "http://spam.example.com" });
  const res = await post(body);
  assert.equal(res.status, 202);
  assert.deepEqual(await res.json(), { accepted: true });
  assert.equal(await prisma.supportTicket.count({ where: { requesterEmail: body.email } }), 0);
});

test("contact request: a database failure answers 500 with a generic error, never a success", async () => {
  const body = validBody("dbfail");
  const original = prisma.supportTicket.create;
  (prisma.supportTicket as { create: unknown }).create = async () => {
    throw new Error("connection refused at 10.0.0.5:5432 (secret detail)");
  };
  const quiet = console.error;
  console.error = () => {};
  try {
    const res = await post(body);
    assert.equal(res.status, 500);
    const json = await res.json();
    assert.equal(json.accepted, undefined);
    assert.ok(typeof json.error === "string" && json.error.length > 0);
    assert.doesNotMatch(JSON.stringify(json), /10\.0\.0\.5|secret detail|connection refused/);
  } finally {
    console.error = quiet;
    (prisma.supportTicket as { create: unknown }).create = original;
  }
  assert.equal(await prisma.supportTicket.count({ where: { requesterEmail: body.email } }), 0);
});

test("contact request: sustained submissions from one address are rate limited", async () => {
  await resetLimiter();
  const statuses: number[] = [];
  for (let i = 0; i < 12; i += 1) {
    statuses.push((await post(validBody(`flood-${i}`), { keepLimiter: true })).status);
  }
  assert.ok(statuses.includes(429), `expected a 429, got ${statuses.join(",")}`);
  const stored = await prisma.supportTicket.count({ where: { requesterEmail: { startsWith: `contact-flood-` }, source: "contact_page" } });
  assert.ok(stored < 12, "throttled submissions must not be stored");
});
