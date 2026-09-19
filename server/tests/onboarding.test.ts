import { test, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { app } from "../src/app";

after(async () => {
  await prisma.$disconnect();
});

async function postSignup(baseUrl: string, userType: "organizer" | "exhibitor") {
  const email = `onboarding-${userType}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const response = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password: "ValidPassword!123",
      fullName: userType === "organizer" ? "Onboarding Organizer" : "Onboarding Exhibitor",
      userType,
    }),
  });
  return { response, email };
}

test("organizer signup bootstraps an owner workspace and requires onboarding", async () => {
  const server = app.listen(0);
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://localhost:${address.port}`;

  try {
    const { response, email } = await postSignup(baseUrl, "organizer");
    assert.equal(response.status, 201);

    const body = await response.json() as { token: string; user: { userType: string; roles: { organizer: unknown[] }; onboarding: { required: boolean; completed: boolean; role: string | null; nextStepKey: string | null } } };
    assert.ok(body.token);
    assert.equal(body.user.userType, "organizer");
    assert.equal(body.user.roles.organizer.length, 1);
    assert.equal(body.user.onboarding.required, true);
    assert.equal(body.user.onboarding.completed, false);
    assert.equal(body.user.onboarding.role, "organizer");
    assert.equal(body.user.onboarding.nextStepKey, "organization-profile");

    const organizer = await prisma.organizer.findUnique({ where: { bootstrappedByUserId: (await prisma.user.findUniqueOrThrow({ where: { email } })).id } });
    assert.ok(organizer);
    assert.equal(organizer!.name, "Onboarding Organizer");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("exhibitor signup bootstraps a business workspace and exposes exhibitor onboarding", async () => {
  const server = app.listen(0);
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://localhost:${address.port}`;

  try {
    const { response, email } = await postSignup(baseUrl, "exhibitor");
    assert.equal(response.status, 201);

    const body = await response.json() as { token: string; user: { userType: string; roles: { exhibitor: unknown[] }; onboarding: { required: boolean; completed: boolean; role: string | null; nextStepKey: string | null } } };
    assert.ok(body.token);
    assert.equal(body.user.userType, "exhibitor");
    assert.equal(body.user.roles.exhibitor.length, 0);
    assert.equal(body.user.onboarding.required, true);
    assert.equal(body.user.onboarding.completed, false);
    assert.equal(body.user.onboarding.role, "exhibitor");
    assert.equal(body.user.onboarding.nextStepKey, "company-profile");

    const token = body.token;
    const onboardingResponse = await fetch(`${baseUrl}/api/onboarding`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(onboardingResponse.status, 200);
    const onboardingBody = await onboardingResponse.json() as { onboarding: { required: boolean; completed: boolean; role: string | null; nextStepKey: string | null } };
    assert.equal(onboardingBody.onboarding.required, true);
    assert.equal(onboardingBody.onboarding.role, "exhibitor");
    assert.equal(onboardingBody.onboarding.nextStepKey, "company-profile");
    const meResponse = await fetch(`${baseUrl}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(meResponse.status, 200);
    const meBody = await meResponse.json() as { user: { roles: { exhibitor: unknown[] } } };
    assert.equal(meBody.user.roles.exhibitor.length, 1);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const business = await prisma.exhibitorBusiness.findUnique({ where: { ownerId: user.id } });
    assert.ok(business);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
