# A1 Public Endpoint Policy Evidence

**Audit date:** 2026-09-24  
**Main baseline:** `1e1ab4e2c5fb9c4b3315024093df28a88c4aa928`

## Purpose

Close the repository-verifiable portion of the A1 **public endpoint policy reconciliation** item. This document records the current `server/src/routes/public.ts` public operations, their rate-limit class, and the abuse controls visible in the implementation.

This is repository evidence only. It does not verify production deployment configuration, TLS, CDN/WAF controls, or live traffic characteristics.

## Verified public operations

| Operation | Rate limit | Additional controls | Evidence status |
|---|---|---|---|
| `GET /api/public/exhibitions` | `publicReadRateLimit` | Fixed read shape; no caller-controlled filters/pagination; Event lifecycle/visibility gate; only public organizer fields selected | VERIFIED |
| `GET /api/public/exhibitions/:id` | `publicReadRateLimit` | Event-canonical visibility/lifecycle; 404 for hidden/missing linked events; legacy fallback only for unlinked exhibitions; bounded public ticket/stall/media payload | VERIFIED |
| `GET /api/public/exhibitions/:id/exhibitors` | `publicReadRateLimit` | Shared public visibility gate; page size capped at 24; confirmed participations only; public-safe business fields only | VERIFIED |
| `GET /api/public/exhibitions/:id/floor-plan` | `publicSearchRateLimit` | Shared public visibility gate; published-floor-plan requirement; public-safe floor-plan payload; expired reservations released before read | VERIFIED |
| `GET /api/public/events/:id/participants` | `publicSearchRateLimit` | Published/public/active event gate; enabled-module filter; active/public participant filter; bounded selected fields | VERIFIED |
| `GET /api/public/organizers/:slug` | `publicReadRateLimit` | Public-profile and non-suspended gate; public-safe organizer projection; active social links only | VERIFIED |
| `GET /api/public/organizers/:slug/events` | `publicReadRateLimit` | Public-profile/non-suspended gate; Event-canonical lifecycle; page size capped at 20; paginated query | VERIFIED |
| `GET /api/public/organizers/:slug/gallery` | `publicReadRateLimit` | Public-profile/non-suspended gate; active/non-archived media only; public-safe fields | VERIFIED |
| `GET /api/public/discover` | `publicSearchRateLimit` | Zod validation; page limit capped at 50; candidate fetch capped at 1000; bounded geographic radius <= 200 km; parameterized Prisma filters | VERIFIED |

## Policy conclusions

1. Every currently reviewed public operation has an explicit rate-limit policy. No reviewed public operation is intentionally unbounded.
2. Read endpoints with potentially expensive search/filter behavior use the stricter `publicSearchRateLimit` class.
3. Public resource endpoints use non-enumerating 404 behavior for hidden/private/nonexistent resources where applicable.
4. Public payloads use explicit field selection and avoid sensitive organizer/business/payment fields.
5. Pagination and candidate limits are enforced on collection/search endpoints.
6. The public discovery route validates query parameters and bounds geographic search input.
7. Public exhibition identity/lifecycle now follows the Universal Event canonical state for linked exhibitions, with legacy Exhibition fallback only when no Event link exists.

## Remaining external verification

The following cannot be proven by this repository document:

- production rate-limit store/distribution behavior across multiple application instances;
- CDN/WAF limits and bot protection;
- production CORS origin values and TLS/domain configuration;
- production S3/object-storage access configuration;
- monitoring/alerting for public endpoint abuse;
- observed production latency and traffic capacity.

Those remain deployment-level production gates and must not be marked PASS from repository evidence alone.

## Source of truth

Implementation reviewed: `server/src/routes/public.ts` on the baseline above. The A1 endpoint inventory remains the canonical list of mounted route families; this document supplies the operation-level evidence for the public router's rate-limit and abuse-control policy.
