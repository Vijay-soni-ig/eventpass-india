# A1 Security Endpoint Inventory

**Audit baseline:** current main at the start of the A1 full route-level audit.

This inventory is derived from server/src/app.ts. It lists every mounted API prefix plus direct health/webhook endpoints. Multiple routers intentionally share /api/events, /api/exhibitions, and /api/public.

## Mounted API prefixes

| Prefix | Route family / trust boundary |
|---|---|
| /api/storage | Storage access; public/private object policy |
| /api/auth | Authentication/account identity |
| /api/onboarding | Authenticated onboarding |
| /api/registrations | Visitor registration/ownership |
| /api/organizer/registrations | Organizer tenant |
| /api/organizer/event-tickets | Organizer event/ticket inventory |
| /api/event-ticket-reservations | Visitor reservation ownership |
| /api/event-ticket-orders | Visitor order ownership |
| /api/event-tickets | Organizer issued-ticket inventory |
| /api/event-ticket-check-ins | Scanner permission + event ownership |
| /api/organizer/event-analytics | Organizer event ownership |
| /api/personalization | Visitor personalization and recommendation profile |
| /api/business | Exhibitor business tenant |
| /api/organizer-members | Organizer tenant membership |
| /api/exhibitor-members | Exhibitor business membership |
| /api/exhibitions | Organizer-owned Exhibition compatibility module |
| /api/events | Organizer-owned canonical Event and event modules |
| /api/event-categories | Canonical category reads |
| /api/platform/event-categories | Super-admin category management |
| /api/bookings | Organizer booking ownership + buyer ownership |
| /api/exhibitor/participations | Exhibitor participation ownership |
| /api/exhibitor/scanner | Exhibitor scanner/event boundary |
| /api/organizer/payments | Organizer financial ownership |
| /api/payments | Authenticated buyer payment ownership |
| /api/documents | Exhibitor-business private documents |
| /api/leads | Exhibitor lead ownership |
| /api/organizer/leads | Organizer lead ownership |
| /api/event-leads/capture-contexts | Event/exhibitor participation ownership |
| /api/event-leads | Exhibitor lead ownership |
| /api/organizer/analytics | Organizer analytics ownership |
| /api/organizer/subscription | Organizer subscription ownership |
| /api/organizer/profile | Organizer profile ownership |
| /api/organizer/gallery | Organizer media ownership |
| /api/organizers | Public organizer/follow relationship |
| /api/saved-exhibitions | Visitor-owned saved state |
| /api/notifications | User-owned notification state |
| /api/platform | Super-admin platform boundary |
| /api/public | Deliberately public event/discovery operations |
| /api/pricing | Public/platform pricing reads |
| /api/venues | Organizer-owned reusable venue infrastructure |
| /api/health | Public liveness endpoint |
| /api/health/ready | Public readiness endpoint |
| /api/webhooks/payments | Provider webhook signature/idempotency boundary |

## Reconciliation rule

The repository test server/tests/a1RouteInventory.test.ts parses server/src/app.ts and asserts that every mounted /api prefix is present in this document. This prevents future route-surface drift.

## Security verification rule

For every route family, A1 reviews:

1. authentication;
2. RBAC/permission boundary;
3. tenant/owner scoping;
4. mutation rate limiting;
5. input validation;
6. sensitive-data exposure;
7. financial/inventory idempotency and concurrency;
8. security-sensitive audit logging;
9. unauthorized/cross-tenant 4xx behavior;
10. high-risk regression coverage.

Repository evidence and deployment-level evidence are kept separate.
