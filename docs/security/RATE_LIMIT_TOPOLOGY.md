# Rate-Limit Topology Contract

## Current implementation

ExhibitTix uses `express-rate-limit` with its default in-process memory store. Endpoint coverage is broad, but counters are local to each API process.

### Production rule

Until a shared external rate-limit store is implemented:

- Production MUST run as a single API instance/process.
- Production MUST set `RATE_LIMIT_TOPOLOGY=single-instance`.
- Horizontal API scaling MUST NOT be enabled.
- `RATE_LIMIT_TOPOLOGY=shared-store` is intentionally rejected because no shared store is currently configured.

The application now fails closed at startup when production does not explicitly declare the supported topology.

## Why this matters

With multiple API instances, the same attacker can send requests to different instances and receive separate in-memory rate-limit buckets. That weakens abuse protection and can make security limits materially less effective.

This is a deployment constraint, not a replacement for a future distributed rate-limit architecture.

## Future scaling requirement

Before enabling horizontal API scaling, implement and verify a shared rate-limit store such as Redis or another supported external store, then add:

1. shared counter correctness across instances;
2. failover behavior;
3. connection/security configuration;
4. TTL consistency;
5. load/concurrency tests;
6. deployment-level verification through the real proxy/load balancer.

## Verification

Repository tests verify:

- production requires an explicit supported topology;
- development/test defaults safely to single-instance;
- unsupported shared-store mode fails closed;
- invalid topology values fail closed.
