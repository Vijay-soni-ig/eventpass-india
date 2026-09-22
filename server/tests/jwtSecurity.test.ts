import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";

process.env.JWT_SECRET ??= "test-jwt-secret";

const { getJwtLifetimeSeconds, signToken, verifyToken } = await import("../src/lib/jwt");

test("JWT lifetime accepts bounded production-safe durations", () => {
  assert.equal(getJwtLifetimeSeconds("8h"), 8 * 60 * 60);
  assert.equal(getJwtLifetimeSeconds("24h"), 24 * 60 * 60);
  assert.equal(getJwtLifetimeSeconds("30m"), 30 * 60);
});

test("JWT lifetime rejects values longer than 24 hours or malformed values", () => {
  assert.throws(() => getJwtLifetimeSeconds("24h1m"));
  assert.throws(() => getJwtLifetimeSeconds("25h"));
  assert.throws(() => getJwtLifetimeSeconds("2d"));
  assert.throws(() => getJwtLifetimeSeconds("0h"));
});

test("signed JWTs retain issuer, audience, algorithm and unique jti claims", () => {
  const token = signToken({ userId: "jwt-security-test-user" });
  const decoded = jwt.decode(token, { complete: true });
  assert.ok(decoded && typeof decoded === "object");
  assert.equal(decoded.header.alg, "HS256");
  assert.equal(decoded.payload.iss, "exhibittix");
  assert.equal(decoded.payload.aud, "exhibittix-app");
  assert.equal(typeof decoded.payload.jti, "string");
  assert.equal(verifyToken(token).userId, "jwt-security-test-user");
});
