import { test } from "node:test";
import assert from "node:assert/strict";
import { hasExhibitorPermissionForBusiness, type RoleContext } from "../../src/lib/permissions";

const roles: RoleContext = {
  platformAdmin: false,
  organizer: [],
  exhibitor: [
    { exhibitorBusinessId: "business-owner", name: "Owner Business", role: "EXHIBITOR_OWNER" },
    { exhibitorBusinessId: "business-staff", name: "Staff Business", role: "EXHIBITOR_STAFF" },
  ],
};

test("active business permission uses the selected membership, not any membership", () => {
  assert.equal(hasExhibitorPermissionForBusiness(roles, "business-owner", "document:manage"), true);
  assert.equal(hasExhibitorPermissionForBusiness(roles, "business-staff", "document:manage"), false);
  assert.equal(hasExhibitorPermissionForBusiness(roles, "business-staff", "lead:capture"), true);
});

test("missing active business never grants a business-scoped permission", () => {
  assert.equal(hasExhibitorPermissionForBusiness(roles, undefined, "exhibitorBusiness:manage"), false);
});

test("platform administrators retain scoped permission access when a business is selected", () => {
  assert.equal(
    hasExhibitorPermissionForBusiness({ ...roles, platformAdmin: true }, "business-staff", "document:manage"),
    true
  );
});
