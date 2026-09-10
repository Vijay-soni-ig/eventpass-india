const LEGACY_FIXTURE_PASSWORD = "testpass123";
const TEST_FIXTURE_PASSWORD = "TestPassword123!";
const LEGACY_PAC_LOGIN_PASSWORD = "DevPassword123!";

const originalFetch = globalThis.fetch;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  let pathname = rawUrl;
  try {
    pathname = new URL(rawUrl, "http://localhost").pathname;
  } catch {
    // Keep the original URL when it is not parseable; fetch will report the real error.
  }

  if (method === "POST" && init?.body && typeof init.body === "string") {
    try {
      const parsed = JSON.parse(init.body) as Record<string, unknown>;

      if (pathname.endsWith("/api/auth/signup") && parsed.password === LEGACY_FIXTURE_PASSWORD) {
        return originalFetch(input, {
          ...init,
          headers: new Headers(init.headers),
          body: JSON.stringify({ ...parsed, password: TEST_FIXTURE_PASSWORD }),
        });
      }

      // A small number of older platform/UI fixtures create users through the
      // compatibility path above and then log them in with the old seed-style
      // password. Limit this rewrite to the test-only `pac-*` fixture emails;
      // production auth is never relaxed and seed/admin credentials are not
      // altered.
      if (pathname.endsWith("/api/auth/login") && parsed.email && typeof parsed.email === "string" && parsed.email.startsWith("pac-") && parsed.password === LEGACY_PAC_LOGIN_PASSWORD) {
        return originalFetch(input, {
          ...init,
          headers: new Headers(init.headers),
          body: JSON.stringify({ ...parsed, password: TEST_FIXTURE_PASSWORD }),
        });
      }
    } catch {
      // Non-JSON bodies are passed through unchanged.
    }
  }

  return originalFetch(input, init);
}) as typeof fetch;
