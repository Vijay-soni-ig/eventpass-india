import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import { signToken, verifyToken } from "../src/lib/jwt";

process.env.JWT_SECRET ??= "ci-test-secret";

test("JWTs contain a unique jti and required issuer/audience", () => {
  const token = signToken({ userId: "user-1" });
  const decoded = jwt.decode(token) as jwt.JwtPayload;
  assert.equal(decoded.userId, "user-1");
  assert.equal(typeof decoded.jti, "string");
  assert.equal(decoded.iss, process.env.JWT_ISSUER ?? "exhibittix");
  assert.equal(decoded.aud, process.env.JWT_AUDIENCE ?? "exhibittix-app");
  assert.deepEqual(verifyToken(token), { userId: "user-1", jti: decoded.jti });
});

test("JWT verification rejects wrong issuer and audience", () => {
  const token = signToken({ userId: "user-2" });
  const payload = jwt.decode(token) as jwt.JwtPayload;
  const forged = jwt.sign(
    { userId: "user-2", jti: payload.jti },
    process.env.JWT_SECRET ?? "ci-test-secret",
    { algorithm: "HS256", issuer: "wrong", audience: "wrong", expiresIn: "15m" },
  );
  assert.throws(() => verifyToken(forged));
});

test("expired JWTs are rejected", () => {
  const token = jwt.sign(
    { userId: "user-3" },
    process.env.JWT_SECRET ?? "ci-test-secret",
    {
      algorithm: "HS256",
      issuer: process.env.JWT_ISSUER ?? "exhibittix",
      audience: process.env.JWT_AUDIENCE ?? "exhibittix-app",
      jwtid: "expired-session",
      expiresIn: -1,
    },
  );
  assert.throws(() => verifyToken(token));
});
