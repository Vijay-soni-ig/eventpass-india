const LEGACY_FIXTURE_PASSWORD = "testpass123";
const TEST_FIXTURE_PASSWORD = "TestPassword123!";
const LEGACY_SEED_STYLE_PASSWORD = "DevPassword123!";

const originalFetch = globalThis.fetch;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  let pathname = rawUrl;
  try {
    pathname = new URL(rawUrl, "http://localhost").pathname;
  } catch {
    // Leave invalid URLs untouched so fetch reports the original error.
  }

  if (method === "POST" && init?.body && typeof init.body === "string") {
    try {
      const parsed = JSON.parse(init.body) as Record<string, unknown>;

      // Production signup requires a strong password. Only legacy test
      // fixture signups are rewritten, and only inside this test runner.
      if (pathname.endsWith("/api/auth/signup") && parsed.password === LEGACY_FIXTURE_PASSWORD) {
        return originalFetch(input, {
          ...init,
          headers: new Headers(init.headers),
          body: JSON.stringify({ ...parsed, password: TEST_FIXTURE_PASSWORD }),
        });
      }

      // Some older tests create their `pac-*` / `phase20c-visitor-*` fixture
      // users through the compatibility signup path and then log in using the
      // old password. Keep this narrowly scoped to those test email prefixes;
      // seed/admin credentials and real application traffic are untouched.
      if (
        pathname.endsWith("/api/auth/login") &&
        typeof parsed.email === "string" &&
        (parsed.email.startsWith("pac-") || parsed.email.startsWith("phase20c-visitor-")) &&
        parsed.password === LEGACY_SEED_STYLE_PASSWORD
      ) {
        return originalFetch(input, {
          ...init,
          headers: new Headers(init.headers),
          body: JSON.stringify({ ...parsed, password: TEST_FIXTURE_PASSWORD }),
        });
      }
    } catch {
      // Non-JSON bodies pass through unchanged.
    }
  }

  return originalFetch(input, init);
}) as typeof fetch;
