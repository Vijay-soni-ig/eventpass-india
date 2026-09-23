import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";

process.env.NODE_ENV = "test";
process.env.CORS_ORIGINS = "https://app.example.com";

test("production nginx security policy includes required browser protections", () => {
  const nginx = fs.readFileSync(path.join(process.cwd(), "..", "nginx.conf"), "utf8");
  const headers = fs.readFileSync(path.join(process.cwd(), "..", "nginx-security-headers.conf"), "utf8");

  assert.match(nginx, /include \/etc\/nginx\/nginx-security-headers\.conf;/g);
  assert.match(headers, /X-Content-Type-Options\s+"nosniff"/);
  assert.match(headers, /X-Frame-Options\s+"DENY"/);
  assert.match(headers, /Referrer-Policy\s+"no-referrer"/);
  assert.match(headers, /Permissions-Policy/);
  assert.match(headers, /Cross-Origin-Opener-Policy\s+"same-origin"/);
  assert.match(headers, /Cross-Origin-Resource-Policy\s+"same-origin"/);
  assert.match(headers, /X-Permitted-Cross-Domain-Policies\s+"none"/);
  assert.match(headers, /Strict-Transport-Security\s+"max-age=31536000; includeSubDomains"/);
  assert.match(headers, /Content-Security-Policy/);
  assert.match(headers, /default-src 'self'/);
  assert.match(headers, /object-src 'none'/);
  assert.match(headers, /frame-ancestors 'none'/);
  assert.match(headers, /script-src 'self'/);
});

test("API security middleware emits browser protections and request IDs", async () => {
  const { app } = await import("../src/app");
  const server = app.listen(0);
  await once(server, "listening");

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.equal(response.headers.get("permissions-policy"), "camera=(), microphone=(), geolocation=()");
    assert.equal(response.headers.get("content-security-policy"), "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    assert.match(response.headers.get("x-request-id") ?? "", /^[0-9a-f-]{36}$/i);
  } finally {
    server.close();
  }
});

test("API CORS does not reflect an origin outside the explicit allowlist", async () => {
  const { app } = await import("../src/app");
  const server = app.listen(0);
  await once(server, "listening");

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/health`, {
      headers: { Origin: "https://attacker.example.com" },
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  } finally {
    server.close();
  }
});

test("API CORS permits an origin explicitly present in the allowlist", async () => {
  const { app } = await import("../src/app");
  const server = app.listen(0);
  await once(server, "listening");

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/health`, {
      headers: { Origin: "https://app.example.com" },
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), "https://app.example.com");
  } finally {
    server.close();
  }
});
