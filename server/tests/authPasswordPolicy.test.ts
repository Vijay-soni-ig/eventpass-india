import { test } from "node:test";
import assert from "node:assert/strict";
import { getStrongPasswordErrors, isLoginPasswordValid } from "../../src/lib/passwordRules";

test("login accepts existing passwords without applying the signup complexity policy", () => {
  assert.equal(isLoginPasswordValid("legacy"), true);
  assert.equal(isLoginPasswordValid(""), false);
  assert.equal(isLoginPasswordValid("x".repeat(129)), false);
});

test("signup requires the same 12-character complexity policy as the server", () => {
  assert.ok(getStrongPasswordErrors("short").length > 0);
  assert.ok(getStrongPasswordErrors("alllowercase123!").length > 0);
  assert.deepEqual(getStrongPasswordErrors("StrongPassword123!"), []);
});
