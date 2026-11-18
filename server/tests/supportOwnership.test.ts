import assert from "node:assert/strict";
import { test } from "node:test";
import { prisma } from "../src/lib/prisma";
import {
  getSupportTicketOwnerContexts,
  hasExclusiveSupportTicketOwner,
  resolveSupportTicketOwnerContext,
  supportTicketOwnerWhere,
} from "../src/lib/supportOwnership";

test("support ticket owner selection enforces exclusive tenant ownership", () => {
  assert.equal(hasExclusiveSupportTicketOwner(null, null), true, "public intake may be unowned");
  assert.equal(hasExclusiveSupportTicketOwner("org-1", null), true);
  assert.equal(hasExclusiveSupportTicketOwner(null, "business-1"), true);
  assert.equal(hasExclusiveSupportTicketOwner("org-1", "business-1"), false);

  assert.deepEqual(supportTicketOwnerWhere({ type: "organizer", organizerId: "org-1" }), {
    organizerId: "org-1",
    exhibitorBusinessId: null,
  });
  assert.deepEqual(supportTicketOwnerWhere({ type: "exhibitor", exhibitorBusinessId: "business-1" }), {
    exhibitorBusinessId: "business-1",
    organizerId: null,
  });
});

test("support owner resolution accepts active memberships and business owners only", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({
    data: { email: `support-owner-${suffix}@example.test`, passwordHash: "test-only-hash" },
  });
  const invitedUser = await prisma.user.create({
    data: { email: `support-invited-${suffix}@example.test`, passwordHash: "test-only-hash" },
  });
  const organizer = await prisma.organizer.create({ data: { name: `Support Owner ${suffix}` } });
  const business = await prisma.exhibitorBusiness.create({
    data: { ownerId: user.id, address: "Test address", companyName: "Support Owner Business" },
  });

  try {
    await prisma.organizerMembership.create({
      data: { organizerId: organizer.id, userId: user.id, role: "owner", status: "active" },
    });
    await prisma.exhibitorMembership.create({
      data: { exhibitorBusinessId: business.id, userId: user.id, role: "admin", status: "active" },
    });
    await prisma.organizerMembership.create({
      data: { organizerId: organizer.id, userId: invitedUser.id, role: "owner", status: "invited" },
    });
    await prisma.exhibitorMembership.create({
      data: { exhibitorBusinessId: business.id, userId: invitedUser.id, role: "admin", status: "invited" },
    });

    const contexts = await getSupportTicketOwnerContexts(user);
    assert.ok(contexts.some((owner) => owner.type === "organizer" && owner.organizerId === organizer.id));
    assert.ok(contexts.some((owner) => owner.type === "exhibitor" && owner.exhibitorBusinessId === business.id));

    assert.deepEqual(await getSupportTicketOwnerContexts(invitedUser), []);
    assert.deepEqual(
      await resolveSupportTicketOwnerContext(user, { type: "organizer", organizerId: organizer.id }),
      { type: "organizer", organizerId: organizer.id },
    );
    assert.deepEqual(
      await resolveSupportTicketOwnerContext(user, { type: "exhibitor", exhibitorBusinessId: business.id }),
      { type: "exhibitor", exhibitorBusinessId: business.id },
    );
    assert.equal(
      await resolveSupportTicketOwnerContext(invitedUser, { type: "organizer", organizerId: organizer.id }),
      null,
    );
    assert.equal(
      await resolveSupportTicketOwnerContext(user, { type: "organizer", organizerId: "another-tenant" }),
      null,
    );
  } finally {
    await prisma.organizerMembership.deleteMany({ where: { organizerId: organizer.id } });
    await prisma.exhibitorMembership.deleteMany({ where: { exhibitorBusinessId: business.id } });
    await prisma.organizer.delete({ where: { id: organizer.id } });
    await prisma.exhibitorBusiness.delete({ where: { id: business.id } });
    await prisma.user.deleteMany({ where: { id: { in: [user.id, invitedUser.id] } } });
  }
});

test("support ownership migration preserves legacy tickets and protects new ownership", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({
    data: { email: `support-migration-${suffix}@example.test`, passwordHash: "test-only-hash" },
  });
  const organizer = await prisma.organizer.create({ data: { name: `Legacy Support Org ${suffix}` } });
  const business = await prisma.exhibitorBusiness.create({
    data: { ownerId: user.id, address: "Migration test address" },
  });
  const ticketIds: string[] = [];

  try {
    const publicTicket = await prisma.supportTicket.create({
      data: { subject: `Legacy public ${suffix}`, requesterEmail: "public@example.test" },
    });
    ticketIds.push(publicTicket.id);
    const organizerTicket = await prisma.supportTicket.create({
      data: { subject: `Legacy organizer ${suffix}`, organizerId: organizer.id },
    });
    ticketIds.push(organizerTicket.id);
    const exhibitorTicket = await prisma.supportTicket.create({
      data: { subject: `New exhibitor ${suffix}`, exhibitorBusinessId: business.id },
    });
    ticketIds.push(exhibitorTicket.id);

    await assert.rejects(
      prisma.supportTicket.create({
        data: {
          subject: `Invalid dual owner ${suffix}`,
          organizerId: organizer.id,
          exhibitorBusinessId: business.id,
        },
      }),
      "database CHECK constraint must reject tickets with both tenant owners",
    );

    await prisma.exhibitorBusiness.delete({ where: { id: business.id } });
    const preserved = await prisma.supportTicket.findMany({
      where: { id: { in: ticketIds } },
      orderBy: { subject: "asc" },
      select: { id: true, organizerId: true, exhibitorBusinessId: true },
    });
    assert.equal(preserved.length, 3, "legacy and new ticket history must remain");
    assert.equal(preserved.find((ticket) => ticket.id === publicTicket.id)?.organizerId, null);
    assert.equal(preserved.find((ticket) => ticket.id === organizerTicket.id)?.organizerId, organizer.id);
    assert.equal(preserved.find((ticket) => ticket.id === exhibitorTicket.id)?.exhibitorBusinessId, null);
  } finally {
    await prisma.supportTicket.deleteMany({ where: { id: { in: ticketIds } } });
    await prisma.organizer.delete({ where: { id: organizer.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});
