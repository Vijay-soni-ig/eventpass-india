const baseUrl = process.argv[2] || process.env.STAGING_API_URL;

if (!baseUrl) {
  console.error("Usage: node scripts/verify-staging.mjs <staging-api-url>");
  process.exit(2);
}

const normalized = baseUrl.replace(/\\/$/, "");

async function check(path, expectedStatus = 200) {
  const response = await fetch(`${normalized}${path}`, {
    headers: { Accept: "application/json" },
  });

  if (response.status !== expectedStatus) {
    throw new Error(`${path}: expected HTTP ${expectedStatus}, received ${response.status}`);
  }

  return response.json().catch(() => null);
}

try {
  const live = await check("/api/health");
  const ready = await check("/api/health/ready");

  if (live?.ok !== true) throw new Error("/api/health did not return ok=true");
  if (ready?.ok !== true || ready?.database !== "ready") {
    throw new Error("/api/health/ready did not report database=ready");
  }

  console.log(JSON.stringify({
    ok: true,
    checks: ["health", "readiness"],
    baseUrl: normalized,
  }));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
