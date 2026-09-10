import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

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
