const baseUrl = (process.argv[2] || process.env.PRODUCTION_API_URL || "").replace(/\/$/, "");

if (!baseUrl) {
  console.error("PRODUCTION_API_URL is required");
  process.exit(2);
}

async function check(path) {
  const started = Date.now();
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  const durationMs = Date.now() - started;
  const body = await response.json().catch(() => null);
  return { path, status: response.status, durationMs, body };
}

try {
  const checks = await Promise.all([
    check("/api/health"),
    check("/api/health/ready"),
  ]);

  const live = checks[0];
  const ready = checks[1];

  if (live.status !== 200 || live.body?.ok !== true) {
    throw new Error(`Health check failed: HTTP ${live.status}`);
  }

  if (ready.status !== 200 || ready.body?.ok !== true || ready.body?.database !== "ready") {
    throw new Error(`Readiness check failed: HTTP ${ready.status}`);
  }

  console.log(JSON.stringify({ ok: true, baseUrl, checks }));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
