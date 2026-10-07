import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { getOnboardingSummary } from "../src/lib/onboarding";
import type { User } from "@prisma/client";

const users: string[] = [];
const organizers: string[] = [];

function roleContext(organizerId: string) {
  return {
    platformAdmin: false,
    organizer: [{ organizerId, name: "Test Organizer", role: "ORGANIZER_OWNER" as const }],
    exhibitor: [],
  };
}

function fakeUser(id: string): User {
  return {
    id,
    email: `onboarding-activation-${id}@example.com`,
    passwordHash: "test",
    fullName: "Test Organizer",
    phone: null,
    userType: "organizer",
    platformRole: null,
    suspended: false,
    suspendedReason: null,
    suspendedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("organizer onboarding activation", () => {
  before(async () => {
    const user = await prisma.user.create({
      data: {
        email: `onboarding-activation-${Date.now()}@example.com`,
        passwordHash: "test",
        fullName: "Test Organizer",
        userType: "organizer",
      },
    });
    users.push(user.id);
  });

  after(async () => {
    if (organizers.length) {
      await prisma.organizer.deleteMany({ where: { id: { in: organizers } } });
    }
    if (users.length) {
      await prisma.user.deleteMany({ where: { id: { in: users } } });
    }
    await prisma.$disconnect();
  });

  it("does not require onboarding once activation is persisted", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: users[0] } });
    const organizer = await prisma.organizer.create({
      data: {
        name: "Legacy Organizer",
        memberships: { create: { userId: user.id, role: "owner", status: "active" } },
        onboardingProfile: { create: { completedAt: new Date() } },
      },
    });
    organizers.push(organizer.id);

    const result = await getOnboardingSummary(user, roleContext(organizer.id));
    assert.equal(result.required, false);
    assert.equal(result.completed, true);
  });

  it("requires onboarding for a new organizer without activation", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: users[0] } });
    const organizer = await prisma.organizer.create({
      data: {
        name: "New Organizer",
        memberships: { create: { userId: user.id, role: "owner", status: "active" } },
      },
    });
    organizers.push(organizer.id);

    const result = await getOnboardingSummary(user, roleContext(organizer.id));
    assert.equal(result.required, true);
    assert.equal(result.completed, false);
    assert.equal(result.nextStepKey, "organization-profile");
  });
});
