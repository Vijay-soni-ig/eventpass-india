import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ROLE_PERMISSIONS,
  can,
  exhibitorRoleToRole,
  organizerRoleToRole,
  type Permission,
  type Role,
} from "../src/lib/permissions";

const sensitive: Permission[] = [
  "payment:view",
  "payment:manage",
  "ticketType:manage",
  "stall:manage",
  "organizerMember:manage",
  "exhibitorMember:manage",
  "document:manage",
  "lead:export",
  "checkin:override",
];

test("permission matrix has every non-platform role explicitly represented", () => {
  const roles: Role[] = [
    "ORGANIZER_OWNER",
    "ORGANIZER_ADMIN",
    "ORGANIZER_OPERATIONS",
    "ORGANIZER_FINANCE",
    "ORGANIZER_MARKETING",
    "ORGANIZER_SCANNER",
    "EXHIBITOR_OWNER",
    "EXHIBITOR_ADMIN",
    "EXHIBITOR_STAFF",
    "VISITOR",
  ];
  assert.deepEqual(Object.keys(ROLE_PERMISSIONS).sort(), roles.sort());
});

test("platform admin remains a wildcard while visitor remains least privileged", () => {
  for (const permission of sensitive) {
    assert.equal(can("PLATFORM_ADMIN", permission), true, `platform admin lost ${permission}`);
    assert.equal(can("VISITOR", permission), false, `visitor gained ${permission}`);
  }
});

test("organizer financial and operational boundaries are explicit", () => {
  assert.equal(can("ORGANIZER_FINANCE", "payment:view"), true);
  assert.equal(can("ORGANIZER_FINANCE", "payment:manage"), true);
  assert.equal(can("ORGANIZER_FINANCE", "stall:manage"), false);
  assert.equal(can("ORGANIZER_FINANCE", "ticketType:manage"), false);
  assert.equal(can("ORGANIZER_FINANCE", "scanner:use"), false);
  assert.equal(can("ORGANIZER_OPERATIONS", "stall:manage"), true);
  assert.equal(can("ORGANIZER_OPERATIONS", "payment:view"), false);
  assert.equal(can("ORGANIZER_OPERATIONS", "payment:manage"), false);
  assert.equal(can("ORGANIZER_OPERATIONS", "organizerMember:manage"), false);
  assert.equal(can("ORGANIZER_MARKETING", "lead:analytics"), true);
  assert.equal(can("ORGANIZER_MARKETING", "payment:view"), false);
  assert.equal(can("ORGANIZER_SCANNER", "scanner:use"), true);
  assert.equal(can("ORGANIZER_SCANNER", "checkin:override"), false);
});

test("exhibitor staff cannot escalate to business, team, export, document-write, or override access", () => {
  assert.equal(can("EXHIBITOR_STAFF", "exhibitorBusiness:view"), true);
  assert.equal(can("EXHIBITOR_STAFF", "lead:capture"), true);
  assert.equal(can("EXHIBITOR_STAFF", "lead:view"), true);
  assert.equal(can("EXHIBITOR_STAFF", "scanner:use"), true);
  for (const permission of [
    "exhibitorBusiness:manage",
    "exhibitorMember:manage",
    "document:manage",
    "lead:export",
    "checkin:override",
  ] as Permission[]) {
    assert.equal(can("EXHIBITOR_STAFF", permission), false, `staff gained ${permission}`);
  }
});

test("membership role adapters map every persisted role to the canonical matrix", () => {
  assert.equal(organizerRoleToRole("owner"), "ORGANIZER_OWNER");
  assert.equal(organizerRoleToRole("admin"), "ORGANIZER_ADMIN");
  assert.equal(organizerRoleToRole("operations"), "ORGANIZER_OPERATIONS");
  assert.equal(organizerRoleToRole("finance"), "ORGANIZER_FINANCE");
  assert.equal(organizerRoleToRole("marketing"), "ORGANIZER_MARKETING");
  assert.equal(organizerRoleToRole("scanner"), "ORGANIZER_SCANNER");
  assert.equal(exhibitorRoleToRole("owner"), "EXHIBITOR_OWNER");
  assert.equal(exhibitorRoleToRole("admin"), "EXHIBITOR_ADMIN");
  assert.equal(exhibitorRoleToRole("staff"), "EXHIBITOR_STAFF");
});
