export type RateLimitTopology = "single-instance" | "shared-store";

export function assertRateLimitTopology(env: NodeJS.ProcessEnv = process.env): RateLimitTopology {
  const mode = env.RATE_LIMIT_TOPOLOGY?.trim() || (env.NODE_ENV === "production" ? "" : "single-instance");

  if (mode === "single-instance") return mode;

  if (mode === "shared-store") {
    throw new Error(
      "RATE_LIMIT_TOPOLOGY=shared-store is not implemented yet. Keep production on a single API instance until a shared rate-limit store is configured.",
    );
  }

  throw new Error(
    "RATE_LIMIT_TOPOLOGY must be explicitly set to single-instance in production. Distributed rate limiting is not supported until a shared store is implemented.",
  );
}
