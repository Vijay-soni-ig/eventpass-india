# 001E Progressive Read Cutover Audit

## Scope
Final 001E audit of the public read surface on `main`, after the Universal Event listing, card, detail, homepage and URL compatibility cutovers.

## Current status

**Estimated completion: ~90%.**

The generic public Event identity/lifecycle read migration is effectively complete. The remaining work is deliberately concentrated in legacy operational domains where Exhibition is still the source of truth.

Completed in the current 001E sequence:
- Universal public Event listing uses `Event`.
- Homepage discovery now uses the Universal Event API through the compatibility adapter.
- Public Event cards route linked records to `/events/:eventId`.
- Universal Event detail preserves linked Exhibition ticket purchase where the legacy ticket catalog is still authoritative.
- Linked Exhibition regression coverage exists for the canonical Event detail flow.
- `/events` is the canonical public discovery page; `/exhibitions` remains a compatibility URL.
- Legacy `search` and `category` query parameters are still accepted and converge to the Universal Event query contract when filters change.
- Public organizer event listings and public organizer event counts are Event-canonical.

## Classification

### A. Event-canonical and already migrated

These should remain Event-backed:
- Public Event listing/discovery identity, lifecycle, visibility, dates, venue, location, cover image and organizer.
- Public Event detail universal identity/lifecycle fields.
- Homepage event discovery source.
- Public organizer event listing/counts.
- Event module configuration and public module availability.
- Event-owned universal ticketing for standalone Universal Events.
- Event-owned registrations, participants, analytics and check-in where the corresponding module is enabled.

### B. Legitimate Exhibition-module operational reads

These are **not 001E defects** and should remain Exhibition-backed until universal operational models exist:
- Stall and floor-plan management.
- Exhibition exhibitor participation and booth assignment.
- Exhibition-specific public exhibitor directory.
- Public floor plans and published floor-plan objects.
- Exhibition-specific media, schedules, highlights, audiences and FAQs.
- Legacy Exhibition workspace operations.
- Exhibition-owned ticket types, bookings, orders and related legacy payment/check-in paths.
- Lead capture that validates Exhibition participation/stall relationships.

### C. Compatibility reads

These should remain temporarily:
- `GET /api/public/exhibitions/:id`: Event is authoritative for linked public identity/lifecycle, while the response retains the legacy Exhibition contract for operational data.
- `usePublicExhibition()`: still required by the legacy `/exhibition/:id` route and linked Exhibition ticket compatibility.
- `usePublicFloorPlan()`, `usePublicFloorPlans()` and `usePublicExhibitionExhibitors()`: required by the Exhibition operational detail surface.
- Homepage `usePublicExhibitions()`: the name and returned TypeScript shape are legacy-compatible, but its source is already `/api/public/events`.
- Legacy `GET /api/public/exhibitions`: retained as an external/public compatibility endpoint; the current frontend no longer uses it for homepage discovery.
- Legacy `GET /discover?type=events`: retained as a compatibility API. Its Event branch still requires a linked Exhibition because its response contract exposes Exhibition-owned ticket data.

### D. Remaining migration work

1. **Legacy public Event discovery API contract**
   - Decide whether `GET /discover?type=events` still has a supported consumer.
   - If it is still supported, migrate its response contract to Universal Event semantics while preserving price filtering only where a ticket catalog exists.
   - If no supported consumer remains, deprecate it first, then remove it only after an explicit compatibility decision.

2. **Legacy Exhibition detail route**
   - Keep `/exhibition/:id` for unlinked legacy Exhibitions.
   - Linked Exhibition records should continue resolving to canonical Event detail for normal discovery flows.
   - Do not remove the route until bookmark/backward-compatibility requirements are explicitly closed.

3. **Universal operational parity**
   - Universal stall/participation/floor-plan models are prerequisite work for removing those remaining Exhibition reads.
   - Universal ticketing parity is prerequisite for migrating linked Exhibition ticket catalog/order/check-in reads.
   - Universal lead/stall participation is prerequisite for removing Exhibition dependencies from lead capture.

## Important architectural decision

**Do not perform a blanket `prisma.exhibition` → `prisma.event` replacement.**

That would incorrectly migrate operational ownership and risk breaking:
- stall availability and booking,
- floor plans,
- exhibitor participation,
- legacy ticket inventory,
- ticket orders/check-in,
- lead validation.

001E is a **progressive read cutover**, not a schema-wide rename.

## Recommended completion sequence

### P0/P1
1. Verify whether the legacy `/discover?type=events` API has any supported frontend or external consumer.
2. If unused, mark it deprecated and stop treating it as a blocker for Universal Event public discovery.
3. Add a final browser/API regression matrix covering:
   - standalone Universal Event,
   - linked Exhibition Event,
   - unlinked legacy Exhibition,
   - private/unpublished Event,
   - completed Event,
   - disabled modules.

### P1
4. Migrate any remaining generic public consumer from Exhibition-shaped data to `UniversalEventDetail`.
5. Keep operational Exhibition reads behind explicit module/compatibility boundaries.

### Later phases
6. Build universal participation/stall/floor-plan parity.
7. Build universal ticketing parity and migrate linked Exhibition ticketing.
8. Migrate lead capture after participation/stall ownership is universal.
9. Remove deprecated Exhibition public APIs only after consumer and bookmark compatibility sign-off.

## Acceptance criteria

- No generic public Event identity/lifecycle field is sourced from Exhibition.
- Standalone Universal Events never require an Exhibition relation.
- Linked Exhibition Events continue to support their required operational modules.
- Disabled modules remain inaccessible through direct APIs.
- Legacy public URLs remain intentionally compatible.
- Floor-plan, stall, exhibitor participation, ticketing, lead and check-in regression tests remain green.
- CI, Browser E2E and dependency audit pass before merge.

## 001E completion estimate

**Remaining implementation risk: ~10%.**

The remaining percentage is not a reason to remove more Exhibition code immediately. Most of it is dependency work that belongs to later universal operational models.

**Practical target:** complete the final public-read verification/deprecation decision first, then close 001E. After that, move to the next roadmap phase instead of spending time rewriting legitimate Exhibition operational reads.
