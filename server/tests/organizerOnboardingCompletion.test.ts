import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { startTestServer } from "./helpers/testServer";

let baseUrl: string;
let stop: () => Promise<void>;

before(async () => {
  ({ baseUrl, stop } = await startTestServer());
});

after(async () => {
  await stop();
});

async function signup(label: string) {
  const email = "onb-v2-" + label + "-" + Date.now() + "-" + Math.random().toString(36).slice(2) + "@example.com";
  const response = await fetch(baseUrl + "/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-Rate-Limit-Key": "onb-v2-" + label },
    body: JSON.stringify({ email, password: "TestPassword123!", fullName: "Onboarding " + label, userType: "organizer" }),
  });
  const body = await response.json();
  assert.equal(response.status, 201, JSON.stringify(body));
  return { token: body.token as string, userId: body.user.id as string };
}

const auth = (token: string) => ({ "Content-Type": "application/json", Authorization: "Bearer " + token });

async function getSummary(token: string) {
  const response = await fetch(baseUrl + "/api/onboarding", { headers: auth(token) });
  assert.equal(response.status, 200);
  return (await response.json()).onboarding as {
    completed: boolean;
    nextStepKey: string | null;
    steps: Array<{ key: string; required: boolean; completed: boolean }>;
  };
}

test("organizer onboarding is organizer-first and does not require an event", async () => {
  const { token, userId } = await signup("flow");
  let summary = await getSummary(token);

  assert.deepEqual(summary.steps.map((step) => step.key), [
    "organization-profile",
    "organization-branding",
    "organizer-experience",
    "organizer-page",
  ]);
  assert.equal(summary.steps.find((step) => step.key === "organization-profile")?.required, true);
  assert.equal(summary.steps.find((step) => step.key === "organization-branding")?.required, true);
  assert.equal(summary.steps.find((step) => step.key === "organizer-experience")?.required, false);
  assert.equal(summary.steps.find((step) => step.key === "organizer-page")?.required, true);
  assert.equal(summary.nextStepKey, "organization-profile");

  const profile = await fetch(baseUrl + "/api/organizer/profile", {
    method: "PUT",
    headers: auth(token),
    body: JSON.stringify({
      name: "Acme Events India",
      businessType: "Proprietorship",
      address: "12 Ashram Road, Ahmedabad 380009",
      city: "Ahmedabad",
      state: "Gujarat",
      country: "India",
      publicEmail: "hello@acme.example",
      publicPhone: "+919999999999",
    }),
  });
  assert.equal(profile.status, 200);

  const organizer = await prisma.organizer.findUniqueOrThrow({ where: { bootstrappedByUserId: userId } });
  await prisma.organizer.update({
    where: { id: organizer.id },
    data: { logoUrl: "/uploads/test-logo.png", description: "We organize exhibitions and professional events across India." },
  });

  summary = await getSummary(token);
  assert.equal(summary.steps.find((step) => step.key === "organization-profile")?.completed, true);
  assert.equal(summary.steps.find((step) => step.key === "organization-branding")?.completed, true);
  assert.equal(summary.nextStepKey, "organizer-page");
  assert.equal(summary.completed, false);

  const experience = await fetch(baseUrl + "/api/organizer/profile", {
    method: "PUT",
    headers: auth(token),
    body: JSON.stringify({
      discoverySource: "Google / Search",
      eventFrequency: "Monthly",
      averageEventSize: "101–500 people",
    }),
  });
  assert.equal(experience.status, 200);

  summary = await getSummary(token);
  assert.equal(summary.steps.find((step) => step.key === "organizer-experience")?.completed, true);
  assert.equal(summary.nextStepKey, "organizer-page");

  const page = await fetch(baseUrl + "/api/organizer/profile", {
    method: "PUT",
    headers: auth(token),
    body: JSON.stringify({ slug: "acme-events-" + Date.now(), publicProfileEnabled: true }),
  });
  assert.equal(page.status, 200);

  summary = await getSummary(token);
  assert.equal(summary.completed, true);
  assert.equal(summary.nextStepKey, null);

  const organizerPage = await fetch(baseUrl + "/api/organizer/profile", { headers: auth(token) });
  assert.equal(organizerPage.status, 200);
  const saved = (await organizerPage.json()).organizer;
  assert.equal(saved.discoverySource, "Google / Search");
  assert.equal(saved.eventFrequency, "Monthly");
  assert.equal(saved.averageEventSize, "101–500 people");
  assert.equal(saved.publicProfileEnabled, true);
});

test("organizer experience step can be skipped without blocking the required flow", async () => {
  const { token } = await signup("skip");
  const organizer = await getSummary(token);

  await fetch(baseUrl + "/api/organizer/profile", {
    method: "PUT",
    headers: auth(token),
    body: JSON.stringify({
      name: "Skip Test Events",
      businessType: "LLP",
      address: "7 Station Road, Vadodara 390001",
      city: "Vadodara",
      state: "Gujarat",
      country: "India",
      description: "We organize professional events and exhibitions for businesses.",
    }),
  });

  const dbOrganizer = await prisma.organizer.findFirstOrThrow({ where: { name: "Skip Test Events" } });
  await prisma.organizer.update({ where: { id: dbOrganizer.id }, data: { logoUrl: "/uploads/test-logo.png" } });

  const before = await getSummary(token);
  assert.equal(before.steps.find((step) => step.key === "organizer-experience")?.completed, false);

  const page = await fetch(baseUrl + "/api/organizer/profile", {
    method: "PUT",
    headers: auth(token),
    body: JSON.stringify({ slug: "skip-test-" + Date.now(), publicProfileEnabled: true }),
  });
  assert.equal(page.status, 200);

  const after = await getSummary(token);
  assert.equal(after.steps.find((step) => step.key === "organizer-experience")?.completed, false);
  assert.equal(after.completed, true);
  assert.equal(after.nextStepKey, null);
});

test("organizer onboarding fields are validated and tenant scoped", async () => {
  const a = await signup("tenant-a");
  const b = await signup("tenant-b");

  const invalid = await fetch(baseUrl + "/api/organizer/profile", {
    method: "PUT",
    headers: auth(a.token),
    body: JSON.stringify({ discoverySource: "x".repeat(101) }),
  });
  assert.equal(invalid.status, 400);

  assert.equal((await fetch(baseUrl + "/api/organizer/profile", {
    method: "PUT",
    headers: auth(a.token),
    body: JSON.stringify({ discoverySource: "Social media", eventFrequency: "Weekly", averageEventSize: "51–100 people" }),
  })).status, 200);

  const bProfile = await fetch(baseUrl + "/api/organizer/profile", { headers: auth(b.token) });
  assert.equal(bProfile.status, 200);
  const bBody = await bProfile.json();
  assert.equal(bBody.organizer.discoverySource, null);
  assert.equal(bBody.organizer.eventFrequency, null);
  assert.equal(bBody.organizer.averageEventSize, null);
});
