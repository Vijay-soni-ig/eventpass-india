# ExhibitTix Master Feature Inventory & Verification Register

**Audit date:** 2026-11-11  
**Repository:** `Vijay-soni-ig/eventpass-india`  
**Branch audited:** `main`  
**Audited commit:** `905608db123e6709f065f24a520cb5a08c7156b9`  
**Audit status:** Initial repository-backed inventory; detailed behavioral verification is still in progress.  
**Scope exclusion:** Payment-provider integration/configuration (including live Razorpay credentials and webhooks) is not part of the implementation scope for this audit. Existing internal payment, refund, booking and reconciliation code is still inventoried because it is already part of the product.

---

## 1. Executive summary

The current repository is a substantial multi-persona event platform, not a small exhibition-only application. It contains both the legacy Exhibition domain and a Universal Event domain, plus venue infrastructure, exhibitor participation, ticketing, lead management, platform administration, subscriptions/entitlements, notifications, personalization, and WhatsApp foundations.

### 1.1 Repository inventory snapshot

Counts below are reproducible structural counts from the audited commit, not counts of completed business features.

| Inventory item | Count | Counting basis |
|---|---:|---|
| Tracked repository files | 1,082 | Git tree blobs |
| Frontend page files | 109 | `src/pages/**/*.{ts,tsx}` |
| Backend route modules | 86 | `server/src/routes/*.ts` |
| Backend source files | 160 | `server/src/**/*.ts` |
| Automated test files | 293 | `server/tests/**/*.test.ts` and `e2e/**/*.spec.ts` |
| Prisma models | 94 | `model` declarations in `server/prisma/schema.prisma` |
| Prisma enums | 89 | `enum` declarations in `server/prisma/schema.prisma` |
| Documentation files | 142 | `docs/**` |

These numbers must not be added together as a feature total. A page, API module, model, and test can all represent the same capability.

### 1.2 Current audit conclusion

- **Code presence:** broad product coverage exists across all four personas.
- **Historical workflow evidence:** Phases 21B–21E report repairs and successful tests for major exhibitor, organizer, visitor, booking, check-in, refund, and cross-persona workflows.
- **Current verification:** the historical reports are not a substitute for a fresh exact-commit test run. Their claims are retained as historical evidence, not silently promoted to current PASS.
- **Existing UI action inventory:** 55 audit rows were identified: 42 PASS and 4 PARTIAL PASS, plus 9 P1 follow-up requirements without a final status. The inventory's own last verified main commit is `fd6d7b44a58aabd2878850e777544ef4d67e1434`, older than the currently audited `905608db123e6709f065f24a520cb5a08c7156b9`; these results are historical only.
- **Production readiness:** not established. A scheduled Dependency Audit on 2026-11-09 failed its high/critical gate due to a high-severity `follow-redirects` advisory in the server dependency tree. The scheduled production-monitoring workflow explicitly reports that production monitoring is not configured.
- **Documentation completeness:** the documentation index still lists multiple P0 architecture, security, QA, and operational documents as planned or in progress.

---

## 2. Status definitions and evidence rules

| Status | Meaning |
|---|---|
| IMPLEMENTED (CODE PRESENT) | Relevant page, route, model, service, or other implementation artifact exists. This alone does not prove a working workflow. |
| HISTORICALLY VERIFIED | A dated report or test record documents successful verification. The evidence is tied to that report/commit, not automatically to the current commit. |
| VERIFIED (CURRENT COMMIT) | A reproducible test or runtime check has been executed against the exact audited commit and its result is recorded. |
| PARTIAL | Some behavior is implemented or tested, but expected behavior, persona coverage, or evidence is incomplete. |
| PLANNED / NOT FOUND | No supporting implementation was found in the inspected source, or the documentation explicitly identifies it as planned. |
| BLOCKED | Verification or completion depends on unavailable environment, credentials, infrastructure, or another prerequisite. |
| NOT TESTED | No adequate evidence has been inspected for the behavior. |

**Important:** Do not label a feature PASS because its screen renders, an endpoint returns HTTP 200, a Prisma model exists, or a test file exists. A PASS requires assertions for the expected business outcome, authorization boundary, persistence, error handling, and relevant cross-persona effects.

---

## 3. Persona and product-surface inventory

### 3.1 Public / Visitor

| Feature area | Identified capability | Source locations | Initial assessment |
|---|---|---|---|
| Discovery | Public event/exhibition discovery, listing, search/filter/sort | `EventDiscovery.tsx`, `ExhibitionListing.tsx`, `/events`, `/exhibitions` | Code present; current behavior not fully re-run |
| Event detail | Event information and public participant profiles | `EventDetail.tsx`, `ParticipantPublicProfile.tsx`, `/event/:id` | Code present |
| Exhibition detail | Legacy exhibition detail, venue, ticket and stall information | `ExhibitionDetail.tsx`, `/exhibition/:id` | Code present; legacy compatibility surface |
| Registration | Event registration and visitor account flows | `EventRegistration.tsx`, `/event/:id/register`, `Auth.tsx` | Code present |
| Ticket purchase | Event ticket checkout, exhibition booking and ticket detail | `EventTicketCheckout.tsx`, `BookingFlow.tsx`, `/event/:id/tickets`, `/book/:id` | Code present |
| Ticket management | My tickets, ticket details, QR/ticket state | `MyTickets.tsx`, `TicketDetail.tsx`, `EventTicketDetail.tsx` | Code present |
| Saved events | Saved exhibition/event interaction | `savedExhibitions.ts`, `Dashboard.tsx`, `/saved-events` | Code present; validate naming and Universal Event mapping |
| Notifications | User notifications | `Notifications.tsx`, `notifications.ts` | Code present |
| Account | Account settings and onboarding | `AccountSettings.tsx`, `Onboarding.tsx` | Code present |
| Discovery personalization | Visitor preferences and interaction signals | `personalization.ts`, `VisitorPreference`, `VisitorEventInteraction` | Code present; scoring and consent need separate verification |
| Public content | About, contact, help, pricing, policies and informational pages | `AboutUs.tsx`, `ContactUs.tsx`, `HelpCenter.tsx`, `Pricing.tsx`, policy pages | Code present; legal and operational approval not established |

### 3.2 Organizer

| Feature area | Identified capability | Source locations | Initial assessment |
|---|---|---|---|
| Dashboard | Organizer KPIs and dashboard widgets | `organizer/Dashboard.tsx`, `dashboards.ts`, analytics services | Code present; reconcile each KPI to source query |
| Universal Events | Create, edit, list, overview and lifecycle | `organizer/events/*`, `events.ts` | Code present; historical event creation/publishing E2E evidence exists |
| Legacy Exhibitions | Create/manage exhibition workspace | `organizer/exhibitions/*`, `exhibitions.ts` | Code present; compatibility with Universal Event must be checked |
| Venue management | Venues, buildings/floors, zones, spaces, maps, capacity and facilities | `organizer/venues/VenueManagement.tsx`, venue route modules | Broad code presence |
| Floor plans | Exhibition hall/floor plan layout and stall objects | `workspace/FloorPlan.tsx`, `floorPlanLayout.ts` | Code present; concurrency and editor regressions require exact-head checks |
| Exhibitors | Applications, approval, participation and exhibitor records | `workspace/Applications.tsx`, `organizer/exhibitors/Exhibitors.tsx` | Code present; historical cross-persona workflow evidence |
| Stalls | Stall inventory, availability, reservation and allocation | `organizer/stalls/Stalls.tsx`, `Stall`, `StallBooking` | Code present; concurrency is a critical business invariant |
| Visitors / registrations | Visitor and registration management | `organizer/visitors/Visitors.tsx`, `organizer/registrations/Registrations.tsx` | Code present; historical Phase 21C repair evidence |
| Tickets | Ticket types, sales and attendee/ticket operations | `organizer/tickets/Tickets.tsx`, `eventTickets.ts`, `eventTicketOrders.ts` | Code present |
| Check-in | Organizer QR scanner and check-in | `organizer/checkin/*`, `eventTicketCheckIn.ts`, `bookings.ts` | Code present; verify duplicate/refund/event/tenant rejection |
| Leads | Lead list, detail, export and analytics | `organizer/leads/*`, `organizerLeads.ts` | Code present; Phase 21C reports list/detail/export implementation |
| Payments | Organizer payment views and refund-related operations | `organizer/payments/Payments.tsx`, `organizerPayments.ts` | Code present; provider integration excluded |
| Team | Organizer memberships, invitations and role management | `organizer/team/Team.tsx`, `organizerMembers.ts`, `teamInvitations.ts` | Code present; permission matrix needs exact-current verification |
| Profile / gallery | Public organizer profile and media gallery | `organizer/profile/PublicProfile.tsx`, `organizer/gallery/Gallery.tsx` | Code present |
| Subscription / plan | Plan management and entitlement display | `PlanManagement.tsx`, `organizerSubscription.ts`, `Plan`, `Subscription` | Code present; payment collection and lifecycle must be distinguished |
| Marketing | Marketing workspace | `organizer/Marketing.tsx`, `whatsappCampaigns.ts` | Code present; depth and channel activation not yet established |
| Analytics | Event, exhibition, registration, ticket, lead and financial metrics | `organizer/analytics/*`, analytics route modules | Code present; reconcile gross/refunds/fees/tax/net/platform earnings |

### 3.3 Exhibitor

| Feature area | Identified capability | Source locations | Initial assessment |
|---|---|---|---|
| Dashboard | Exhibitor business and participation overview | `exhibitor/Dashboard.tsx` | Code present; Phase 21C specifically repaired dashboard scoping |
| Business profile | Company profile and business details | `business/CompanyProfile.tsx`, `business/MyBusiness.tsx` | Code present |
| Bank/tax details | Bank and tax information | `business/BankTax.tsx` | Code present; sensitive-data authorization/storage review required |
| Team | Exhibitor team roles and membership | `business/TeamRoles.tsx`, `exhibitorMembers.ts` | Code present; Phase 21D reports repair of dead legacy team system |
| Participation | Apply, view participation, approval and status | `participations/MyParticipations.tsx`, `exhibitorParticipations.ts` | Code present; Phase 21B–21D historical verification |
| Stall booking | Select/reserve stall and retry payment state | Participation flow and `Stall` / `StallBooking` | Code present; concurrency and expiry remain critical |
| Payment history | Stall payment history | `participations/PaymentHistory.tsx` | Code present |
| Documents | Upload, list and delete business documents | `documents/Documents.tsx`, `documents.ts` | Code present; upload security and private storage need environment checks |
| Leads | Lead list, detail, notes, assignment and export | `leads/Leads.tsx`, `leads/LeadDetail.tsx`, `leads.ts` | Code present; historical tests/reports document scoped workflows |
| Lead capture | Manual lead creation, optional ticket-booking reference | `leads/UniversalLeadCapture.tsx`, `leads.ts` | Code present |
| Scanner | Exhibitor-scoped ticket lookup and check-in | `scanner/Scanner.tsx`, `exhibitorScanner.ts` | Code present; Phase 21B/21D historical evidence |
| Analytics | Lead and participation performance | `analytics/Analytics.tsx`, `GET /api/leads/analytics` | Code present; current data and calculations require re-run |
| Sales | Exhibitor's own stall payments, not organizer ticket revenue | `sales/Sales.tsx`, exhibitor participation payment endpoint | Historical Phase 21B explicitly corrected semantics |
| Tickets | Informational limitation page; exhibitors do not own organizer ticket inventory | `tickets/Tickets.tsx` | Deliberate limitation, not a missing exhibitor ticket-sales feature |
| Attendees | Visitors encountered/managed as exhibitor leads | `attendees/Attendees.tsx` | Historical Phase 21B maps this to exhibitor-owned leads |

**Workflow distinction:** the Phase 21E report explicitly states that scanning/checking in a ticket does not automatically create a lead. Lead capture is a separate manual action, optionally linked to a ticket booking to populate visitor details. A scan-to-lead automatic workflow is not evidenced as implemented.

### 3.4 Super Admin / Platform Admin

| Feature area | Identified capability | Source locations | Initial assessment |
|---|---|---|---|
| Platform dashboard | Cross-platform KPIs | `platform/Dashboard.tsx`, `platform.ts` | Code present |
| Organizer administration | List, detail, suspend/reactivate | `platform/organizers/*`, `platform.ts` | Historical Phase 21A live verification documented |
| Exhibition administration | Cross-tenant exhibition oversight | `platform/Exhibitions.tsx` | Code present |
| Event categories | Category create/archive/restore and filtering | `platform/EventCategories.tsx`, `eventCategories.ts` | Code present; historical browser coverage |
| Exhibitor administration | Exhibitor list and detail | `platform/Exhibitors.tsx`, detail page | Code present |
| Visitor administration | Visitor list and detail | `platform/Visitors.tsx`, detail page | Code present |
| Payments | Cross-platform payment oversight | `platform/Payments.tsx` | Code present |
| Subscriptions | Subscription oversight surface | `platform/Subscriptions.tsx` | Code present; historical audit describes this surface as an honest limitation/stub |
| Reports | Platform reports | `platform/Reports.tsx` | Code present; report calculations require verification |
| Support | Support tickets and messages | `platform/Support.tsx`, `SupportTicket`, `SupportTicketMessage` | Code present |
| Audit logs | Audit trail | `platform/AuditLogs.tsx`, `AuditLog` | Code present; completeness and tamper-resistance not established |
| Settings | Platform configuration | `platform/Settings.tsx`, `PlatformSettings` | Code present |
| RBAC | Super-admin route and API authorization | `PlatformRoute`, `platform.ts`, permission helpers | Code present; negative authorization tests required |

---

## 4. Universal Event feature domain

The repository contains a Universal Event domain alongside the legacy Exhibition domain. The following event module families are represented in the source tree:

| Domain | Models / route families |
|---|---|
| Event core | `Event`, `EventCategory`, `EventModuleEnablement`, `events.ts`, `eventCategories.ts` |
| Participants | `EventParticipant`, participant contacts, activity, documents and media |
| Speakers | `EventSession`, `EventSessionSpeaker`, `eventSpeakers.ts`, `eventSessions.ts` |
| Sponsors | Sponsor profile, sponsor package, sponsor routes |
| Vendors | Vendor profile, service, specialization routes |
| Partners | Partner profile, specialization routes |
| Staff | Staff profile, specialization routes |
| Venue allocation | `EventVenueAllocation`, venue allocation routes |
| Ticketing | `EventTicketType`, `EventTicketReservation`, `EventTicketOrder`, `EventTicket`, `EventTicketCheckIn` |
| Registration | `EventRegistrationSettings`, `EventRegistration`, registration routes |
| Leads | `EventLead`, interactions, follow-ups and capture contexts |
| Public discovery | Public event, participant, session, sponsor, vendor and partner routes |

**Verification gap:** presence of module models and route files does not prove that every event category enables the correct module set, that disabled modules are inaccessible through every API, or that each module has complete create/read/update/archive workflows. Independent module-gate enforcement and public API visibility require exact-current tests.

---

## 5. Venue and spatial-management feature domain

The Prisma schema includes the following venue model families:

- Venue, venue building and venue floor.
- Venue zone and venue space.
- Venue capacity rules.
- Venue entrances and parking areas.
- Venue facilities and seating areas.
- Venue maps and map objects.
- Venue availability blocks and maintenance blocks.
- Event-to-venue allocations.

The route inventory includes separate modules for venues, zones, spaces, capacity, entrances, parking, facilities, seating, maps, availability/maintenance, and event venue allocations.

**Business rules requiring explicit verification:** capacity cannot be exceeded; disabled/maintenance spaces cannot be allocated; allocation scopes must be respected; overlapping reservations must be prevented; time-zone/date boundaries must be correct; organizer tenant ownership must be enforced on every nested mutation.

---

## 6. Commercial, booking and financial domain (provider integration excluded)

Existing internal code/data domains include:

- Plans, subscriptions, pricing versions and entitlement checks.
- Payments, payment events and refunds.
- Ticket bookings, ticket orders and reservations.
- Stall bookings and participation payment state.
- Check-ins and financial audit records.

Historical reports describe a server-side pricing engine, subscription lifecycle, entitlement enforcement, idempotent refund behavior, ticket booking idempotency, stock enforcement, and cross-persona refund effects.

**Scope boundary:** this audit inventories and verifies internal business rules and test coverage. It does not configure or activate a payment provider. Real-money production transactions remain a separate launch gate and must not be implied by mock-payment tests.

---

## 7. Notification, marketing and platform operations domains

| Domain | Source evidence | Initial assessment |
|---|---|---|
| In-app notifications | `Notification`, `NotificationPreference`, `NotificationIntent`, `NotificationDelivery`, notification routes/pages | Code present |
| Push subscriptions | `NotificationPushSubscription`, `notificationPush.ts` | Code present; provider/browser delivery needs verification |
| WhatsApp consent | `WhatsAppConsent`, `whatsappConsent.ts` | Code present |
| WhatsApp campaigns | `WhatsAppCampaign`, recipients, `whatsappCampaigns.ts` | Code present; campaign delivery activation not established |
| WhatsApp webhook | `whatsappWebhook.ts` | Code present; signature and replay protection need tests |
| SEO | Sitemap, robots, SEO health routes | Code present; production domain/DNS/canonical output need environment verification |
| Demo/contact requests | Demo and contact request routes/pages | Code present; persistence, spam controls and notifications need verification |
| Support | Support tickets/messages | Code present; operational ownership/SLA not established |
| Observability | Request IDs, structured request logs, health/readiness endpoints | Code present; alert delivery and operational dashboards not established |
| Storage | Storage route and local/S3 code paths | Code present; production object storage configuration not established |

---

## 8. Backend route-module inventory

The audited source tree contains 86 route modules. They are grouped below by domain; the module name is not a guarantee that every CRUD operation is present.

**Identity and account:** `auth`, `authSessions`, `onboarding`, `teamInvitations`, `business`, `organizerMembers`, `exhibitorMembers`.

**Exhibition and floor plan:** `exhibitions`, `exhibitionContent`, `floorPlanLayout`, `exhibitorParticipations`, `exhibitorScanner`, `bookings`.

**Universal Event:** `events`, `eventCategories`, `eventCategoryRead`, `eventVenueAllocations`, `eventParticipants`, `eventParticipantActivity`, `eventParticipantContacts`, `eventParticipantDocuments`, `eventParticipantMedia`, `eventSpeakers`, `eventSessions`, `eventSponsors`, `eventSponsorPackages`, `eventSponsorProfile`, `eventVendors`, `eventVendorSpecialization`, `eventPartners`, `eventPartnerSpecialization`, `eventStaff`, `eventStaffSpecialization`.

**Ticketing and registration:** `registrations`, `organizerRegistrations`, `eventTickets`, `eventTicketOrders`, `eventTicketReservations`, `eventTicketsIssued`, `eventTicketCheckIn`.

**Leads and analytics:** `leads`, `organizerLeads`, `eventLeads`, `eventLeadCaptureContexts`, `organizerAnalytics`, `organizerEventAnalytics`, `dashboards`, `personalization`.

**Finance and subscriptions:** `payments`, `organizerPayments`, `paymentWebhooks`, `pricing`, `organizerSubscription`.

**Venue infrastructure:** `venues`, `venueZones`, `venueSpaces`, `venueCapacity`, `venueEntrances`, `venueParking`, `venueFacilities`, `venueSeating`, `venueAvailabilityMaintenance`, `venueMaps`.

**Engagement and operations:** `notifications`, `notificationPush`, `organizerProfile`, `organizerGallery`, `organizerFollows`, `savedExhibitions`, `documents`, `storage`, `platform`, `contactRequests`, `demoRequests`, `whatsappConsent`, `whatsappWebhook`, `whatsappCampaigns`, `public`, `publicEventSessions`, `publicEventSponsors`, `publicEventVendors`, `publicEventPartners`, `publicParticipantSessions`, `sitemap`, `robots`, `seoHealth`.

**Next extraction required:** enumerate each router's concrete HTTP method/path pairs, middleware, permission helper, validation schema, Prisma operation, and matching tests. This document does not yet claim an endpoint-level CRUD inventory.

---


### 8.1 Concrete endpoint extraction — first pass

Concrete HTTP method/path pairs have now been inspected in **all 86 of the 86 route modules** (100%). The following examples are extracted from the route source and mounted prefixes in `server/src/app.ts`. This is an endpoint inventory, not yet a complete middleware/schema/test trace.

| Domain | Mounted API examples | Operations observed |
|---|---|---|
| Authentication | `/api/auth` | POST signup/login/logout/logout-all/change-password; GET/PATCH profile; workspace recovery |
| Auth sessions | `/api/auth/sessions` | GET sessions; DELETE one session; POST revoke others |
| Universal Events | `/api/events` | GET list/detail/modules; POST create/publish; PATCH update; DELETE; POST restore; PUT module enablement |
| Legacy Exhibitions | `/api/exhibitions` | GET list/detail/exhibitors; POST create/tickets/stalls; PUT update/ticket/stall; PATCH participation; DELETE exhibition/ticket/stall |
| Exhibitor participation | `/api/exhibitor/participations` | GET list/payments; POST apply/stall/payment; PATCH cancel; GET floor plans/payment history |
| Exhibitor scanner | `/api/exhibitor/scanner` | GET ticket lookup; PATCH check-in |
| Visitor legacy booking | `/api/bookings` | POST ticket booking; GET mine/detail/QR/lookup/check-ins; PATCH check-in |
| Event registrations | `/api/registrations`, `/api/organizer/registrations` | POST registration; GET settings/list/analytics; PUT settings; PATCH status |
| Event ticket inventory | `/api/organizer/event-tickets` | GET/POST/PATCH/DELETE ticket types |
| Event ticket orders | `/api/event-ticket-orders` | POST order; GET mine |
| Event ticket reservations | `/api/event-ticket-reservations` | GET mine; POST reserve; POST cancel |
| Issued event tickets | `/api/event-tickets` | GET mine/detail/QR |
| Event ticket check-in | `/api/event-ticket-check-ins` | GET summary; POST check-in |
| Exhibitor leads | `/api/leads` | GET list/export/analytics/detail; POST create; PATCH update |
| Organizer leads | `/api/organizer/leads` | GET list/export/analytics/detail |
| Universal Event leads | `/api/event-leads` | GET list/detail; POST create/from-ticket/interactions/follow-ups; PATCH update/follow-up; DELETE |
| Platform administration | `/api/platform` | GET dashboard/entities/payments/audit/support/settings; PATCH organizer/exhibitor/visitor/settings; POST support/reconciliation actions |
| Event categories | `/api/platform/event-categories`, `/api/event-categories` | GET list/detail; POST/PATCH/DELETE category |
| Venues | `/api/venues` and `/api/venue-*` | GET/POST/PATCH/DELETE and restore for venue, building, floor, zone, space, capacity, entrance, parking, facility, seating, availability, maintenance and map records |
| Event modules | `/api/events/:eventId/participants` and module subroutes | GET/POST/PATCH/DELETE/restore for participants, contacts, documents, media, speakers, sessions, sponsors, vendors, partners and staff; reorder/bulk operations exist for selected media/gallery surfaces |
| Team | `/api/organizer-members`, `/api/exhibitor-members`, `/api/team-invitations` | GET/POST/PATCH/DELETE memberships; invitation token GET and accept POST |
| Documents | `/api/documents` | GET list/download; POST upload; DELETE; POST restore |
| Notifications | `/api/notifications` | GET list/unread/preferences; PATCH read/read-all/preferences; PUT channel preferences |
| Push notifications | `/api/notifications/push` | GET subscriptions; POST subscribe; DELETE subscription |
| Analytics | `/api/organizer/analytics`, `/api/organizer/event-analytics` | GET dashboard/event/participant analytics |
| Subscription | `/api/organizer/subscription` | GET current organizer subscription |
| Internal payments/refunds | `/api/organizer/payments`, `/api/payments` | GET payment/refund records; PATCH payment operations; POST refund/verify/mock-complete |
| Pricing | `/api/pricing` | GET quote |
| Personalization | `/api/personalization` | POST interaction; GET/PUT preferences; GET recommendations/analytics |
| WhatsApp | `/api/whatsapp`, `/api/organizer/whatsapp-campaigns`, `/api/webhooks/whatsapp` | GET/POST consent/webhook/campaign; POST opt-in/opt-out/send/cancel |
| Public discovery | `/api/public` | GET public events/exhibitions/organizers/participants/venue maps/tickets/sessions/sponsors/vendors/partners |


| Additional domain | Mounted API examples | Operations observed |
|---|---|---|
| Exhibitor business | `/api/business` | GET/PUT business profile; POST logo upload |
| Exhibition content | `/api/exhibitions/:exhibitionId` | GET/POST/PATCH/DELETE media, schedule, FAQs, highlights and audience; reorder actions |
| Floor-plan layouts | `/api/exhibitions/:exhibitionId/floor-plan-layouts` | GET/POST/PATCH layouts; POST objects/elements bulk create/update/delete, generate stalls, clone, publish; hall GET/POST/PATCH/DELETE |
| Dashboard builder | `/api/dashboards` | GET/POST dashboard; GET data; PUT/DELETE/restore; POST/PUT/DELETE widgets |
| Onboarding | `/api/onboarding` | GET onboarding state |
| Public partner/sponsor/vendor | `/api/public` | GET specialized partners, sponsors and specialized vendors |
| Public participant sessions | `/api/public` | GET participant-specific sessions |
| Contact/demo requests | `/api/public` | POST contact request and demo request |
| SEO | `/robots.txt`, `/sitemap.xml`, `/api/platform/seo-health` | GET robots, sitemap and admin SEO health |

**CRUD observations from this pass:**
- Several domains implement soft-delete/restore routes, especially venues, participants, media, categories and documents. Verify that restore rechecks ownership, uniqueness, status, and dependent records.
- Some surfaces are intentionally read-only (e.g. organizer subscription read, organizer lead read/export/analytics in the extracted route file); do not assume UI actions exist for unsupported mutations.
- Event ticket order/issued-ticket routes are not the same as organizer ticket-inventory CRUD. Keep inventory, order, reservation, issued ticket, and check-in as separate entities and lifecycles.
- The API path prefix above is the mount prefix plus the router-local path; where a route file is mounted more than once, inspect the exact mount before documenting a client contract.
- Route method/path extraction is complete for all 86 route modules. The next API pass is to reconcile actual mount prefixes, middleware, validation schemas, authorization helpers, Prisma operations and matching tests.

## 9. Database model inventory

The 94 Prisma models are grouped below. This is a schema inventory, not a data-quality or relationship-integrity pass.

| Domain | Models |
|---|---|
| Identity and access | `User`, `AuthSession`, `OrganizerMembership`, `ExhibitorMembership`, `TeamMember` |
| Organizer and business | `Organizer`, `OrganizerOnboardingProfile`, `OrganizerSocialLink`, `ExhibitorBusiness` |
| Venue | `Venue`, `VenueBuilding`, `VenueFloor`, `VenueZone`, `VenueSpace`, `VenueCapacityRule`, `VenueEntrance`, `VenueParkingArea`, `VenueFacility`, `VenueSeatingArea`, `VenueMap`, `VenueMapObject`, `VenueAvailabilityBlock`, `VenueMaintenanceBlock`, `EventVenueAllocation` |
| Exhibition | `Exhibition`, `ExhibitionMedia`, `ExhibitionSchedule`, `ExhibitionFAQ`, `ExhibitionHighlight`, `ExhibitionAudience`, `ExhibitionExhibitor`, `ExhibitionHall`, `Stall`, `FloorPlan`, `FloorPlanObject`, `FloorPlanElement` |
| Universal Event | `Event`, `EventCategory`, `EventModuleEnablement`, `EventParticipant`, `EventParticipantContact`, `EventParticipantMedia`, `EventParticipantDocument`, `EventPartnerProfile`, `EventStaffProfile`, `EventVendorProfile`, `EventVendorService`, `EventVendorProfileService`, `EventSponsorPackage`, `EventSponsorProfile`, `EventSession`, `EventSessionSpeaker` |
| Ticketing and registration | `TicketType`, `TicketBooking`, `EventTicketType`, `EventTicketReservation`, `EventTicket`, `EventTicketOrder`, `EventTicketCheckIn`, `EventRegistrationSettings`, `EventRegistration` |
| Leads | `Lead`, `EventLead`, `EventLeadInteraction`, `EventLeadFollowUp` |
| Finance | `Plan`, `Subscription`, `PricingVersion`, `Payment`, `Refund`, `PaymentEvent`, `StallBooking` |
| Check-in | `CheckIn` |
| Platform and support | `PlatformSettings`, `AuditLog`, `SupportTicket`, `SupportTicketMessage` |
| Visitor engagement | `VisitorPreference`, `VisitorEventInteraction`, `SavedExhibition`, `OrganizerFollow` |
| Notifications and messaging | `Notification`, `NotificationPreference`, `NotificationIntent`, `NotificationDelivery`, `NotificationPushSubscription`, `NotificationChannelPreference`, `WhatsAppConsent`, `WhatsAppCampaign`, `WhatsAppCampaignRecipient` |
| Files and dashboards | `Document`, `OrganizerGalleryMedia`, `Dashboard`, `DashboardWidget` |

### 9.1 Database review still required

For each model, the next pass must record: primary key, foreign keys, owner/tenant key, unique constraints, indexes, status/state fields, timestamps, audit fields, delete/archive behavior, and relation cardinality. The schema model count alone does not establish tenant isolation or safe deletion.

---


### 9.1 Relationship and ownership samples extracted from schema

The following relationships and constraints were inspected directly in `schema.prisma`. They are representative anchors for the deeper ERD review, not a complete model-by-model sign-off.

| Entity | Ownership / relationship evidence | Integrity controls observed |
|---|---|---|
| User | Root identity; referenced by organizer/exhibitor memberships, bookings, check-ins, leads and notifications | Unique email; UUID primary key |
| Organizer | Bootstrapped from a user; owns Events, Exhibitions, Venues and organizer memberships | Unique slug; unique nullable bootstrappedByUserId; index on public-profile/suspended |
| OrganizerMembership | Links Organizer ↔ User | Unique organizerId/userId; invitationTokenHash unique; indexes on both FK fields |
| ExhibitorBusiness | Owned by User | ownerId unique; FK to User with cascade |
| ExhibitorMembership | Links ExhibitorBusiness ↔ User | Unique business/user; unique invitationTokenHash; indexes on both FK fields |
| Event | Owned by User and Organizer; optional Venue and EventCategory | Indexes on organizer, owner, venue, status/visibility, type, category and startDate |
| Exhibition | Owned by User and Organizer; optional one-to-one Event link | eventId unique nullable; Event deletion uses SetNull; owner and organizer indexes |
| ExhibitionExhibitor | Links Exhibition ↔ ExhibitorBusiness | Unique exhibition/business pair; indexes on both FKs |
| Stall | Belongs to Exhibition; optional allocation to ExhibitionExhibitor | Indexes on exhibition, participation and status/reservation time |
| TicketBooking | Belongs to Exhibition; optional TicketType, User, Payment and EventRegistration | Unique QR code; unique paymentId; unique buyerUserId/idempotencyKey; FK indexes |
| EventTicketOrder | Belongs to Event, User, Reservation and Payment | Unique reservationId, paymentId and userId/idempotencyKey; event/user status indexes |
| EventTicket | Belongs to Event, Order, TicketType and User | Unique ticketCode and qrTokenHash; indexes by user/event/order |
| EventTicketReservation | Belongs to Event, TicketType and User | Unique userId/idempotencyKey; expiry/status indexes for inventory queries |
| EventRegistration | Belongs to Event; optional User | Unique event/email, event/idempotencyKey and event/user; indexes for status and email |
| Lead | Belongs to ExhibitionExhibitor; optional ticket booking, capture user and assignee | Indexes on participation, booking, capturedBy, assignedTo and status |
| EventLead | Belongs to Event; optional exhibitor business, participation, stall, visitor, registration, ticket and users | Unique event/exhibitor/ticket; indexes for event/status, business/status, visitor contact and linked ticket/registration |
| Payment | Owns payment identity and links to PricingVersion; can be linked to ticket/stall/event orders | Unique provider order/payment IDs; status and pricing indexes |
| Refund | Belongs to Payment; optional requesting User | Unique providerRefundId; unique paymentId/idempotencyKey; payment/status indexes |
| Venue | Belongs to Organizer | Unique organizer/name and organizer/code; indexes on organizer/status and organizer/city |
| EventVenueAllocation | Links Event ↔ Venue and optional building/floor/zone/space | Indexes by event and each allocated spatial level/status |
| AuditLog | Optional actor User plus entity type/id | Indexes on actor and entityType/entityId |
| Document | Belongs to ExhibitorBusiness; optional uploader User | Business/archivedAt and business indexes |
| Notification | Belongs to User; optional Organizer | Unique user/entity/type/sourceVersion; user/readAt/createdAt index |
| WhatsAppCampaign | Belongs to User creator, Event and Organizer | Event/status and organizer/status/createdAt indexes |

### 9.2 Integrity risks to verify — not yet confirmed defects

1. **Parent delete semantics:** several important relations use `onDelete: Cascade`. Verify delete/archive handlers cannot unintentionally hard-delete financial, ticket, lead, audit or reconciliation history. Confirm Restrict/SetNull/Cascade behavior is intentional per entity.
2. **Nullable composite uniqueness:** membership and idempotency constraints contain nullable columns. Verify intended Postgres NULL semantics and ensure business rules prevent multiple active records where NULL values would bypass a composite unique index.
3. **Cross-domain links:** the nullable unique `Exhibition.eventId` supports a one-to-one legacy Exhibition ↔ Event link. Verify backfill, detach, deletion and restore behavior do not orphan event-specific records.
4. **Stall allocation:** unique exhibition/business participation does not by itself prevent two concurrent stall allocations. Confirm conditional updates/transaction locks protect the stall state transition and stale reservation expiry.
5. **Ticket inventory:** verify reservation/order/ticket state transitions and capacity counts are consistent under concurrent requests, expiry, refund and cancellation.
6. **Lead deduplication:** `EventLead` has a unique event/exhibitor/ticket tuple; `Lead` has no equivalent ticket-based unique constraint in the inspected schema lines. Confirm legacy lead duplicate policy is enforced in service logic or explicitly accepted.
7. **Audit retention:** `AuditLog.actorUser` uses SetNull. Verify actor identity snapshots and immutable audit payloads preserve enough evidence when a user is deleted or anonymized.
8. **Private documents/media:** verify all download endpoints enforce tenant ownership and private object keys cannot be fetched through public storage routes.

## 10. CRUD and lifecycle verification matrix

This is the required verification matrix for each feature family. It is deliberately not marked PASS until the exact route and test evidence has been extracted.

| Feature family | Create | Read | Update | Delete/archive | Search/filter/sort/page | Approve/reject/status | Bulk | Current evidence |
|---|---|---|---|---|---|---|---|---|
| Events/categories | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | Historical event/category E2E exists; exact current run pending |
| Venues and spaces | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | Route/model families present |
| Exhibitions/floor plans | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | Historical floor-plan and booking evidence exists |
| Exhibitor participation/stalls | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | HISTORICALLY VERIFIED | NOT TESTED | Phases 21B–21E document core transitions and isolation |
| Visitor registrations/tickets | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | HISTORICALLY VERIFIED | NOT TESTED | Phase 21E documents capacity, refund and cross-persona flow |
| Check-in | NOT TESTED | NOT TESTED | NOT TESTED | N/A | NOT TESTED | HISTORICALLY VERIFIED | N/A | Duplicate/refunded/unpaid rejection historically tested |
| Leads | HISTORICALLY VERIFIED | HISTORICALLY VERIFIED | HISTORICALLY VERIFIED | NOT TESTED | HISTORICALLY VERIFIED | HISTORICALLY VERIFIED | NOT TESTED | Phase 21C/21E evidence; verify current commit |
| Team and permissions | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | Historical Phase 21D repair; full role matrix pending |
| Payments/refunds | HISTORICALLY VERIFIED | HISTORICALLY VERIFIED | NOT TESTED | N/A | NOT TESTED | HISTORICALLY VERIFIED | N/A | Internal/mock lifecycle evidence only; provider integration excluded |
| Notifications/WhatsApp | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | Code/model presence only |
| Platform administration | NOT TESTED | HISTORICALLY VERIFIED | HISTORICALLY VERIFIED | NOT TESTED | PARTIAL | HISTORICALLY VERIFIED | NOT TESTED | Historical suspend/reactivate and category browser tests |

**Interpretation:** HISTORICALLY VERIFIED is not a current-commit PASS. NOT TESTED means the master inventory has not yet inspected adequate evidence; it does not automatically mean the feature is absent.

---

## 11. Historical workflow evidence reviewed

### Phase 21B — Exhibitor workflow repair

The report states that it fixed four P0 defects and one P1 defect from Phase 21A:

- Payment retry for `payment_pending` participation.
- Exhibitor pages incorrectly using organizer-scoped endpoints.
- Exhibitor scanner authorization and endpoints.
- Exhibitor analytics endpoint wiring.
- Visitor ticket booking idempotency using an `Idempotency-Key`.

The report records 17 new tests, 105 total tests passing at that phase, and live browser/API verification. Treat as historical evidence.

### Phase 21C — Organizer workflow completion

The report states:

- Organizer Visitors and organizer lead management were implemented.
- Exhibitor stall scoping was repaired.
- Organizer exhibitor KPI labels/counts were corrected.
- Ticket inventory capacity enforcement was added with race-safe locking.
- Unsupported upload types were changed to return 4xx responses.
- Two regressions were found and fixed during live verification.

The report records 16 new tests and 121 total tests passing at that phase. Treat as historical evidence.

### Phase 21D — Exhibitor workflow completion

The report documents a further audit of exhibitor team and scanner behavior, including owner/admin/staff distinctions and the removal/replacement of a legacy team system. The full report must be reconciled against current route and permission code before a current PASS is assigned.

### Phase 21E — Cross-persona integration

The report records a continuous Organizer → Exhibitor → Visitor → Check-in → Lead → Refund integration flow, including cross-persona API and database comparisons. It reports zero P0/P1 findings, one P2 cache invalidation fix, and 126 tests passing at that phase.

Important limitation from that report: check-in does not automatically create a lead. Lead capture is a separate action. The test used mock payment completion and does not establish live payment-provider operation.

---

## 12. Current repository-level release signals

### 12.1 Existing UI action inventory — PARTIAL / STALE

The existing `docs/PHASE_3_UI_ACTION_INVENTORY.md` contains 55 audit rows: 42 marked PASS, 4 marked PARTIAL PASS, and 9 P1 closure requirements that are listed without a completed result. Its recorded latest verified `main` commit is `fd6d7b44a58aabd2878850e777544ef4d67e1434`, while this audit inspects `905608db123e6709f065f24a520cb5a08c7156b9`. The old PASS results must not be represented as fresh verification of the newer commit. The four partial areas include broader role/action authorization, lazy-route loading, accessibility-affordance coverage, and dashboard API error/retry coverage.

### 12.2 Dependency audit — FAIL

A scheduled Dependency Audit run on **2026-11-09**, against commit `905608db123e6709f065f24a520cb5a08c7156b9`, failed its high/critical vulnerability gate.

- Frontend dependency gate: passed.
- Backend dependency gate: failed.
- The server lockfile resolves `follow-redirects` to **1.16.1**. The dependency chain in the lockfile is `razorpay@2.9.8 → axios@1.20.0 → follow-redirects@1.16.1`. `server/package.json` has an override range `^1.16.1`, which permits the patched 1.16.2 but the committed lockfile did not yet select it.
- Reported advisory: GHSA-mrwp-f3q8-3g9p / CVE-2026-116689. Affected versions are 1.16.0–1.16.1; patched version is 1.16.2.
- The backend audit gate rejected this high-severity advisory as not covered by an allowed exception. The public advisory describes cross-realm `sensitiveHeaders` arrays being discarded, potentially allowing a custom credential header to follow a cross-origin redirect. Exploitability depends on the caller/options and redirect conditions; do not assume the Axios path is exploitable without verifying the actual call sites.
- This is a P1 security/release issue. The least disruptive likely remediation is a lockfile-only update to 1.16.2 (within the existing override range), followed by dependency-tree inspection, backend tests/build, and a fresh audit gate.

Workflow evidence: https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/42597982083

Do not use `npm audit fix --force` blindly. Trace the dependency chain, select a compatible patched version through the owning dependency where possible, run the backend tests/build, then rerun the dependency gate.

### 12.3 Production monitoring — BLOCKED / NOT CONFIGURED

The scheduled workflow is explicitly named `Production Monitoring — NOT CONFIGURED`. The 2026-11-11 scheduled run completed successfully because it reported the missing configuration; its actual health-check job was skipped.

Workflow evidence: https://github.com/Vijay-soni-ig/eventpass-india/actions/runs/42996730601

A successful workflow conclusion here is not proof that production is healthy or monitored.

### 12.4 Production readiness documentation is stale

`docs/PRODUCTION_READINESS_CURRENT_STATE.md` states its last verification was 2026-10-09 and describes historical external deployment blockers. It must be refreshed against current deployment targets and current configuration before any launch decision. Do not assume the October DNS, deployment, database, storage, or backup state is still current.

---

## 13. Priority register

| Priority | Finding / work item | Why it matters | Required closure evidence |
|---|---|---|---|
| P1 | Backend `follow-redirects` high advisory | Security and CI gate failure | Dependency path/version identified; patched compatible dependency; backend tests/build and audit gate pass |
| P1 | Production monitoring not configured | No demonstrated alerting/health monitoring | Real production target configured; alert path exercised; health and failure behavior documented |
| P1 | Exact-current-commit full verification | Historical tests are not evidence for later code | CI, backend tests, frontend checks, E2E and migration gate tied to exact commit |
| P1 | Tenant isolation/RBAC matrix | Cross-organizer/exhibitor data leakage risk | Positive and negative API tests across owner/admin/staff/read-only and cross-tenant IDs |
| P1 | Database relationship and deletion review | Integrity, privacy and auditability | Model-by-model FK, unique/index, cascade, archive and ownership review |
| P1 | Payment-provider production readiness | Mock flows do not prove real-money settlement | Separate provider credentials, webhook signature, idempotency, reconciliation and refund certification |
| P1 | Backup/restore and object storage | Data loss and single-host storage risk | Production backup restore drill and object storage lifecycle test |
| P1 | P0 documentation consolidation | Product behavior and operational requirements must be unambiguous | PRD, RBAC, architecture, DB, API, security, QA, E2E and production runbooks reconciled |
| P2 | Universal Event module matrix | Category/module configuration may expose incorrect features | Every category/module combination tested in UI, API and public read surfaces |
| P2 | Exhibitor offline scanner integration | Lookup occurs before offline branch; queued sync calls organizer-scoped endpoint | Fix cache-first/known-ticket offline rules and tenant-aware queue processor; add reconnect E2E tests |
| P2 | Scan-to-lead workflow decision | Current process requires separate manual lead capture | Product decision; if required, approved UX, duplicate rules and E2E tests |
| P2 | Dashboard/analytics reconciliation | Financial and operational metrics must be trustworthy | UI/API/DB reconciliation with gross, refunds, fees, taxes, net and platform earnings separated |
| P2 | Accessibility/responsive coverage | Broad screen coverage is not equivalent to full WCAG verification | Critical persona flows keyboard/screen-reader/viewport tests |

---


### 13.1 Source-level finding — Exhibitor offline scanner is not end-to-end wired

**Status: PARTIAL / SOURCE-CONFIRMED DEFECT**

**Affected surface:** `src/pages/exhibitor/scanner/Scanner.tsx`, `src/hooks/exhibitor/use-offline-sync.ts`.

**Evidence from current source:**

1. The shared scanner's `processCheckIn()` calls `lookupBooking.mutateAsync(code)` before it checks `isOnline`. When the device is already offline, the online lookup fails before the offline queue branch is reached. The offline branch therefore cannot accept a previously unseen QR code while disconnected.
2. `use-offline-sync.ts` processes queued items using `PATCH /api/bookings/tickets/:id/check-in`. That is the organizer-axis scanner endpoint. Exhibitors have a separate authorized endpoint at `PATCH /api/exhibitor/scanner/tickets/:id/check-in`, scoped to confirmed exhibitor participations. The queued sync path does not preserve/use the scanner's tenant context.
3. The inspected automated test filenames include exhibitor scanner RBAC and scanner lifecycle suites, but no offline scanner E2E/test suite was found by filename. The inspected Phase 21D scanner test verifies staff scanning and override authorization, not offline queue/reconciliation.

**Assessment:** the UI and local queue plumbing exist, but the offline exhibitor scanner capability is not demonstrated end-to-end and has two source-level integration gaps. This is a **P2 functional defect** unless offline gate operation is a contractual launch requirement, in which case it becomes P1 for that deployment.

**Required fix and acceptance tests:**

- Separate online lookup from offline behavior. An offline flow must only claim a ticket is valid if it has a previously synchronized, securely cached ticket/QR record; an unknown QR must be reported as unverified, not accepted.
- Persist the tenant axis in the queue item (organizer vs exhibitor) or provide separate queue processors with strict role/tenant authorization.
- For exhibitor queue items, sync through `/api/exhibitor/scanner/tickets/:id/check-in`; never silently fall back to organizer authorization.
- Server remains authoritative. Reconcile queued scans idempotently; handle duplicate 409, refunded/unpaid ticket, revoked participation, changed event access, and expired local cache.
- Add offline tests: cached valid ticket queued while offline; unknown ticket rejected while offline; exhibitor sync after reconnect succeeds only for confirmed participation; unrelated exhibition/business is denied; duplicate sync is safely reconciled; organizer queue continues using organizer route.
- UI must distinguish **queued locally / pending server verification** from **server-confirmed check-in**. Do not display a final success state before the server accepts the check-in.

## 14. Next audit execution plan

1. **Dependency security triage:** inspect `server/package.json`, lockfile and dependency chain for `follow-redirects`; confirm the patched compatible resolution and test it on an isolated branch.
2. **Concrete API inventory:** enumerate every router method/path, middleware, permission helper, validation schema and Prisma operation.
3. **UI-to-API mapping:** map every routed page and important action to the concrete hooks/API calls and backend handler.
4. **CRUD verification:** fill Create/Read/Update/Delete/archive/search/filter/sort/pagination/bulk/approve/reject columns per feature, marking unsupported operations as N/A rather than assuming them.
5. **Database ERD/ownership audit:** map FK edges, owner columns, unique constraints, indexes, cascade behavior and soft-delete/archive policy.
6. **Test traceability:** map each critical behavior to unit/API/integration/E2E test names and latest exact-commit CI run.
7. **Cross-persona regression:** rerun organizer → exhibitor → visitor → ticket → check-in → lead → analytics/refund with DB-level assertions.
8. **Production gate refresh:** verify only supplied/authorized staging and production targets; do not expose secrets or infer deployment state from source.

---

## 15. Definition of completion

The master inventory is complete only when:

- Every user-facing route and important UI action has an identified persona and purpose.
- Every important action is mapped to an API handler and database operation, or explicitly documented as frontend-only/external.
- Every entity has ownership, relationships, uniqueness, indexing, status, audit and deletion behavior recorded.
- CRUD/lifecycle operations are explicitly supported, unsupported, or not applicable.
- Every critical permission boundary has positive and negative tests.
- Every critical workflow has exact-commit test evidence and cross-persona consistency checks.
- Known defects, blocked environment checks and planned features remain visible in the final register.
- Historical PASS claims are not presented as current verification without re-running or matching exact commit evidence.

**This document is an initial source-backed inventory, not a declaration that all features are complete or production-ready.**
