import { test } from "node:test";
import assert from "node:assert/strict";
import { can, type Permission, type Role } from "../src/lib/permissions";

const permissions: Permission[] = [
  "exhibition:create", "exhibition:update", "exhibition:delete", "exhibition:view",
  "ticketType:manage", "stall:manage", "booking:view", "payment:view", "payment:manage",
  "scanner:use", "checkin:override", "organizerMember:manage", "organizerMember:view",
  "organizerProfile:manage", "organizerGallery:manage", "exhibitionExhibitor:manage",
  "exhibitionExhibitor:view", "exhibitorBusiness:manage", "exhibitorBusiness:view",
  "exhibitorMember:manage", "exhibitorMember:view", "lead:capture", "lead:view", "lead:export",
  "lead:analytics", "document:manage", "document:view", "platform:manage",
];

const expected: Record<Role, Permission[]> = {
  PLATFORM_ADMIN: permissions,
  ORGANIZER_OWNER: [
    "exhibition:create", "exhibition:update", "exhibition:delete", "exhibition:view", "ticketType:manage",
    "stall:manage", "booking:view", "payment:view", "payment:manage", "scanner:use", "checkin:override",
    "lead:analytics", "lead:view", "lead:export", "organizerMember:manage", "organizerMember:view",
    "organizerProfile:manage", "organizerGallery:manage", "exhibitionExhibitor:manage", "exhibitionExhibitor:view",
  ],
  ORGANIZER_ADMIN: [
    "exhibition:create", "exhibition:update", "exhibition:delete", "exhibition:view", "ticketType:manage",
    "stall:manage", "booking:view", "payment:view", "payment:manage", "scanner:use", "checkin:override",
    "lead:analytics", "lead:view", "lead:export", "organizerMember:manage", "organizerMember:view",
    "organizerProfile:manage", "organizerGallery:manage", "exhibitionExhibitor:manage", "exhibitionExhibitor:view",
  ],
  ORGANIZER_OPERATIONS: [
    "exhibition:create", "exhibition:update", "exhibition:delete", "exhibition:view", "ticketType:manage",
    "stall:manage", "booking:view", "scanner:use", "organizerMember:view", "exhibitionExhibitor:manage",
    "exhibitionExhibitor:view",
  ],
  ORGANIZER_FINANCE: ["exhibition:view", "booking:view", "payment:view", "payment:manage", "organizerMember:view", "exhibitionExhibitor:view"],
  ORGANIZER_MARKETING: ["exhibition:view", "organizerMember:view", "exhibitionExhibitor:view", "lead:analytics", "lead:view"],
  ORGANIZER_SCANNER: ["exhibition:view", "scanner:use"],
  EXHIBITOR_OWNER: [
    "exhibitorBusiness:manage", "exhibitorBusiness:view", "exhibitorMember:manage", "exhibitorMember:view",
    "exhibitionExhibitor:manage", "exhibitionExhibitor:view", "document:manage", "document:view", "lead:capture",
    "lead:view", "lead:export", "scanner:use", "checkin:override",
  ],
  EXHIBITOR_ADMIN: [
    "exhibitorBusiness:manage", "exhibitorBusiness:view", "exhibitorMember:manage", "exhibitorMember:view",
    "exhibitionExhibitor:manage", "exhibitionExhibitor:view", "document:manage", "document:view", "lead:capture",
    "lead:view", "lead:export", "scanner:use", "checkin:override",
  ],
  EXHIBITOR_STAFF: ["exhibitorBusiness:view", "exhibitionExhibitor:view", "document:view", "lead:capture", "lead:view", "scanner:use"],
  VISITOR: [],
};

test("Phase 26.7: every RBAC role matches the approved permission matrix", () => {
  for (const [role, allowed] of Object.entries(expected) as [Role, Permission[]][]) {
    const allowedSet = new Set(allowed);
    for (const permission of permissions) {
      assert.equal(can(role, permission), allowedSet.has(permission), `${role} / ${permission}`);
    }
  }
});

test("Phase 26.7: platform admin is the only wildcard role", () => {
  for (const role of Object.keys(expected) as Role[]) {
    if (role === "PLATFORM_ADMIN") continue;
    for (const permission of permissions) {
      assert.equal(can(role, permission), expected[role].includes(permission), `${role} must not bypass matrix`);
    }
  }
});
