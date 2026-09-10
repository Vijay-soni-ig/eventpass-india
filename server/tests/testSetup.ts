// Legacy integration fixtures historically used `testpass123` for setup users.
// Phase 26.6 intentionally tightened production signup validation, so keep the
// compatibility shim strictly inside the test runner instead of weakening the
// production auth policy. Explicit Phase 26.6 auth tests use their own inputs
// and do not depend on this fixture password.
const TEST_FIXTURE_PASSWORD = "TestPassword123!";

const originalFetch = globalThis.fetch;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  if (init?.body && typeof init.body === "string" && typeof input === "string" && input.includes("/api/auth/signup")) {
    try {
      const body = JSON.parse(init.body) as Record<string, unknown>;
      if (body.password === "testpass123") {
        return originalFetch(input, {
          ...init,
          body: JSON.stringify({ ...body, password: TEST_FIXTURE_PASSWORD }),
        });
      }
    } catch {
      // Let the real request/parser surface the original error for malformed bodies.
    }
  }
  return originalFetch(input, init);
}) as typeof fetch;
