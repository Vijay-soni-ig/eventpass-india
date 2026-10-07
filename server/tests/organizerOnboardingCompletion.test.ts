import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

const ts = Date.now();
let baseUrl: string;
let stop: () => Promise<void>;
let categoryId = "";
const userEmails: string[] = [];

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
  const category = await prisma.eventCategory.create({ data: { name: `Onboarding ${ts}`, slug: `onboarding-${ts}`, active: true } });
  categoryId = category.id;
});

after(async () => {
  try {
    await prisma.eventCategory.updateMany({ where: { id: categoryId }, data: { active: false } });
  } finally {
    await stop();
  }
});

async function signup(label: string, userType: "organizer" | "exhibitor" | "visitor") {
  const email = `onb-complete-${label}-${ts}@example.com`;
  userEmails.push(email);
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": `onb-complete-${label}` },
    body: JSON.stringify({ email, password: "TestPassword123!", fullName: `Onboarding ${label}`, userType }),
  });
  const body = await res.json();
  assert.equal(res.status, 201, JSON.stringify(body));
  return { token: body.token as string, userId: body.user.id as string };
}

const auth = (token: string) => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });

async function onboarding(token: string) {
  const res = await fetch(`${baseUrl}/api/onboarding`, { headers: auth(token) });
  assert.equal(res.status, 200);
  const { onboarding: summary } = (await res.json()) as { onboarding: { completed: boolean; nextStepKey: string | null; steps: Array<{ key: string; required: boolean; completed: boolean }> } };
  return summary;
}

const stepDone = (summary: Awaited<ReturnType<typeof onboarding>>, key: string) => summary.steps.find((s) => s.key === key)?.completed;

const profile = {
  businessType: "LLP",
  address: "12 Ashram Road, Navrangpura, Ahmedabad 380009",
  city: "Ahmedabad",
  state: "Gujarat",
  country: "India",
  description: "We run trade shows and conferences.",
  website: "https://example.com",
};

test("a new organizer can finish organizer onboarding without creating an event", async () => {
  const { token } = await signup("complete", "organizer");

  let summary = await onboarding(token);
  assert.equal(summary.completed, false);
  assert.equal(summary.nextStepKey, "organization-profile");
  assert.deepEqual(summary.steps.map((s) => s.key), [
    "organization-profile",
    "organization-branding",
    "organizer-insights",
    "organizer-page",
  ]);
  assert.equal(stepDone(summary, "organization-profile"), false);
  assert.equal(stepDone(summary, "organization-branding"), false);
  assert.equal(summary.steps.find((s) => s.key === "organizer-insights")?.required, false);
  assert.equal(stepDone(summary, "organizer-page"), false);

  const saved = await fetch(`${baseUrl}/api/organizer/profile`, {
    method: "PUT",
    headers: auth(token),
    body: JSON.stringify({
      ...profile,
      name: "Acme Events LLP",
      slug: `acme-events-${ts}`,
      publicProfileEnabled: false,
    }),
  });
  assert.equal(saved.status, 200, JSON.stringify(await saved.clone().json()));

  summary = await onboarding(token);
  assert.equal(stepDone(summary, "organization-profile"), true);
  assert.equal(stepDone(summary, "organization-branding"), true);
  assert.equal(stepDone(summary, "organizer-page"), true);
  assert.equal(summary.completed, true, "event creation is not an onboarding requirement");
  assert.equal(summary.nextStepKey, "organizer-insights");

  const reloaded = await fetch(`${baseUrl}/api/organizer/profile`, { headers: auth(token) }).then((r) => r.json());
  assert.equal(reloaded.organizer.slug, `acme-events-${ts}`);
  assert.equal(reloaded.organizer.description, profile.description);
  assert.equal(reloaded.organizer.onboardingProfile, null, "optional insights have not been collected");

  const insights = await fetch(`${baseUrl}/api/organizer/profile`, {
    method: "PUT",
    headers: auth(token),
    body: JSON.stringify({
      discoverySources: ["google", "linkedin"],
      eventFrequency: "monthly",
      typicalEventSize: "101_500",
      insightsSkipped: false,
    }),
  });
  assert.equal(insights.status, 200, JSON.stringify(await insights.clone().json()));

  summary = await onboarding(token);
  assert.equal(stepDone(summary, "organizer-insights"), true);
  assert.equal(summary.completed, true);

  const stored = await fetch(`${baseUrl}/api/organizer/profile`, { headers: auth(token) }).then((r) => r.json());
  assert.deepEqual(stored.organizer.onboardingProfile.discoverySources, ["google", "linkedin"]);
  assert.equal(stored.organizer.onboardingProfile.eventFrequency, "monthly");
  assert.equal(stored.organizer.onboardingProfile.typicalEventSize, "101_500");
});

test("organizer insights can be skipped and remain non-blocking", async () => {
  const { token } = await signup("skip-insights", "organizer");

  const saved = await fetch(`${baseUrl}/api/organizer/profile`, {
    method: "PUT",
    headers: auth(token),
    body: JSON.stringify({
      ...profile,
      slug: `skip-insights-${ts}`,
    }),
  });
  assert.equal(saved.status, 200);

  let summary = await onboarding(token);
  assert.equal(summary.completed, true);
  assert.equal(stepDone(summary, "organizer-insights"), false);

  const skipped = await fetch(`${baseUrl}/api/organizer/profile`, {
    method: "PUT",
    headers: auth(token),
    body: JSON.stringify({ insightsSkipped: true }),
  });
  assert.equal(skipped.status, 200);

  summary = await onboarding(token);
  assert.equal(stepDone(summary, "organizer-insights"), true);
  assert.equal(summary.completed, true);
});
 
test("a first save works with the empty fields the profile form always sends", async () => {
  const { token } = await signup("first-save", "organizer");
  const put = (body: unknown) => fetch(`${baseUrl}/api/organizer/profile`, { method: "PUT", headers: auth(token), body: JSON.stringify(body) });

  // This is what the profile page sends for an organizer who has only filled in the business details:
  // every other field is present but empty, and there is no slug yet.
  const res = await put({
    slug: "",
    description: "",
    website: "",
    city: "",
    state: "",
    country: "",
    businessType: "Proprietorship",
    address: "7 Station Road, Vadodara 390001",
    publicEmail: "",
    publicPhone: "",
    publicProfileEnabled: false,
  });
  assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
  const { organizer } = await res.json();
  assert.equal(organizer.businessType, "Proprietorship");
  assert.equal(organizer.slug, null, "an empty slug is ignored, not stored");
  assert.equal(organizer.city, null);
  assert.equal(organizer.state, null);

  // Empty locations clear a value, and a later save with a slug still works.
  assert.equal((await put({ city: "Vadodara", state: "Gujarat" })).status, 200);
  assert.equal((await put({ city: "" })).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/organizer/profile`, { headers: auth(token) }).then((r) => r.json())).organizer.city, null);
  assert.equal((await put({ slug: `first-save-${ts}` })).status, 200);
  assert.equal((await put({ slug: "" })).status, 200, "an empty slug later does not wipe the chosen one");
  assert.equal((await fetch(`${baseUrl}/api/organizer/profile`, { headers: auth(token) }).then((r) => r.json())).organizer.slug, `first-save-${ts}`);

  // Real mistakes are still rejected, with the specific message.
  const reserved = await put({ slug: "admin" });
  assert.equal(reserved.status, 400);
  assert.match((await reserved.json()).error, /reserved/);
  const badSlug = await put({ slug: "Bad Slug!" });
  assert.equal(badSlug.status, 400);
  assert.match((await badSlug.json()).error, /lowercase letters/);
  assert.equal((await put({ slug: "ab" })).status, 400, "too short");
  assert.equal((await put({ city: "<script>" })).status, 400);
  assert.equal((await put({ state: "x".repeat(101) })).status, 400);
});

test("business details are validated on the server", async () => {
  const { token } = await signup("validate", "organizer");
  const put = (body: unknown) => fetch(`${baseUrl}/api/organizer/profile`, { method: "PUT", headers: auth(token), body: JSON.stringify(body) });

  assert.equal((await put({ address: "x".repeat(301) })).status, 400, "address too long");
  assert.equal((await put({ address: "abc" })).status, 400, "address too short");
  assert.equal((await put({ businessType: "x".repeat(101) })).status, 400, "business type too long");
  assert.equal((await put({ businessType: "L" })).status, 400, "business type too short");
  assert.equal((await put({ address: "12 Road\u0000Ahmedabad 380009" })).status, 400, "control characters");

  // Nothing invalid was stored.
  const current = await fetch(`${baseUrl}/api/organizer/profile`, { headers: auth(token) }).then((r) => r.json());
  assert.equal(current.organizer.address, null);
  assert.equal(current.organizer.businessType, null);

  // An empty value clears a field, which reopens the onboarding step.
  assert.equal((await put({ ...profile })).status, 200);
  assert.equal(stepDone(await onboarding(token), "organization-profile"), true);
  assert.equal((await put({ address: "" })).status, 200);
  assert.equal(stepDone(await onboarding(token), "organization-profile"), false);
});

test("only the signed-in organizer's own profile can change, and other roles cannot change it", async () => {
  const a = await signup("owner-a", "organizer");
  const b = await signup("owner-b", "organizer");
  const exhibitor = await signup("exhibitor", "exhibitor");
  const visitor = await signup("visitor", "visitor");
  const put = (token: string, body: unknown) => fetch(`${baseUrl}/api/organizer/profile`, { method: "PUT", headers: auth(token), body: JSON.stringify(body) });

  assert.equal((await put(a.token, { address: "Organizer A address, Ahmedabad 380001" })).status, 200);
  assert.equal((await put(b.token, { address: "Organizer B address, Surat 395001" })).status, 200);

  const readAddress = async (token: string) => (await fetch(`${baseUrl}/api/organizer/profile`, { headers: auth(token) }).then((r) => r.json())).organizer.address;
  assert.equal(await readAddress(a.token), "Organizer A address, Ahmedabad 380001", "B's save did not touch A");
  assert.equal(await readAddress(b.token), "Organizer B address, Surat 395001");

  assert.equal((await put(exhibitor.token, { address: "Not an organizer, Mumbai 400001" })).status, 403);
  assert.equal((await put(visitor.token, { address: "Not an organizer, Mumbai 400001" })).status, 403);
  assert.equal((await fetch(`${baseUrl}/api/organizer/profile`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: "{}" })).status, 401);
});

test("business details stay private and the change is audited without recording the values", async () => {
  const { token, userId } = await signup("private", "organizer");
  const slug = `onb-private-${ts}`;
  const saved = await fetch(`${baseUrl}/api/organizer/profile`, {
    method: "PUT",
    headers: auth(token),
    body: JSON.stringify({ ...profile, slug, publicProfileEnabled: true }),
  });
  assert.equal(saved.status, 200, JSON.stringify(await saved.clone().json()));

  const publicRes = await fetch(`${baseUrl}/api/public/organizers/${slug}`);
  assert.equal(publicRes.status, 200);
  const publicOrganizer = (await publicRes.json()).organizer as Record<string, unknown>;
  assert.equal(publicOrganizer.city, "Ahmedabad", "public location is still shown");
  assert.equal("address" in publicOrganizer, false);
  assert.equal("businessType" in publicOrganizer, false);

  const log = await prisma.auditLog.findFirst({ where: { actorUserId: userId, action: "organizer.profile_updated" }, orderBy: { createdAt: "desc" } });
  assert.ok(log, "the update is audited");
  const metadata = JSON.stringify(log.metadata);
  assert.match(metadata, /address/);
  assert.doesNotMatch(metadata, /Navrangpura/);
});
