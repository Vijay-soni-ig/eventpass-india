import { test } from "node:test";
import assert from "node:assert/strict";
import { loginPasswordSchema, strongPasswordSchema } from "../../src/lib/passwordPolicy";

test("login accepts existing passwords without applying the signup complexity policy", () => {
  assert.equal(loginPasswordSchema.safeParse("legacy").success, true);
  assert.equal(loginPasswordSchema.safeParse("").success, false);
  assert.equal(loginPasswordSchema.safeParse("x".repeat(129)).success, false);
});

test("signup requires the same 12-character complexity policy as the server", () => {
  assert.equal(strongPasswordSchema.safeParse("short").success, false);
  assert.equal(strongPasswordSchema.safeParse("alllowercase123!").success, false);
  assert.equal(strongPasswordSchema.safeParse("StrongPassword123!").success, true);
});
