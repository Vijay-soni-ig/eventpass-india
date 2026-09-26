# FD-10 — Dashboard Contract Hardening

## Objective
Make dashboard metric/widget definitions compile-time contracts rather than free-form strings.

## Changes
- Dashboard metric permissions use the centralized Permission union.
- Dashboard metric modules use Prisma's EventModule enum.
- Dashboard widget permissions use the centralized Permission union.
- Dashboard widget required modules use Prisma's EventModule enum.
- Regression tests verify persona alignment, required capabilities, valid module identifiers, and that platform widgets remain absent while platform data resolution is deferred.

## Security / correctness impact
This prevents a dashboard definition from silently introducing an unknown permission or Event module identifier. Runtime authorization remains enforced by the existing dashboard service and event-module checks.

## Not included
- Platform dashboard data resolution.
- Database-backed tenant-isolation tests.
- Trend-query performance optimization.
