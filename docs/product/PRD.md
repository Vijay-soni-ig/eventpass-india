# ExhibitTix Product Requirements Document

Version: 1.0
Status: Working baseline
Last reviewed: 2026-09-22

## 1. Product definition
ExhibitTix is a multi-persona exhibition and event management platform connecting Super Admins, Organizers, Exhibitors, and Visitors through one operational lifecycle.

Core lifecycle:
Organizer creates Event -> configures Venue/Hall/Stalls -> Exhibitor registers/applies -> Stall booking/payment -> Visitor registration/ticket purchase/payment -> QR ticket -> Check-in -> Lead capture -> Analytics -> Refund/reconciliation.

The platform is evolving from an exhibition-first product toward a universal event model. The current repository contains universal Event foundations alongside legacy Exhibition workflows. This PRD distinguishes universal Event capabilities from exhibition-specific capabilities.

## 2. Personas
### Super Admin
Platform operator responsible for organizers, exhibitors, visitors, events, venues, halls, stalls, bookings, tickets, payments, refunds, leads, subscriptions, reports, notifications, settings, permissions, and audit operations.

### Organizer
Creates and operates events, configures venues/halls/stalls, manages exhibitors, tickets, payments, check-ins, leads, team members, refunds, notifications, and analytics.

### Exhibitor
Manages business profile, applications/participation, stall booking, payments/invoices, representatives, visitor leads, follow-ups, and performance analytics.

### Visitor
Discovers events, registers/logs in, purchases tickets, pays, receives QR tickets, manages tickets, requests cancellation/refund where applicable, and checks in.

## 3. Product goals
1. Provide a reliable end-to-end event operating system.
2. Prevent financial and inventory integrity failures.
3. Enforce server-side authorization and organizer tenant isolation.
4. Support exhibition-specific operations without making the universal Event root exhibition-only.
5. Give organizers and exhibitors measurable operational analytics.
6. Provide auditable payment, refund, booking, and access-control operations.
7. Reach production readiness through evidence-based QA, security, operations, and monitoring.

## 4. Core modules
- Universal Event
- Exhibition extension
- Registration
- Ticketing
- Exhibitor participation
- Leads and follow-ups
- Commercials: subscriptions, pricing, orders, payments, refunds, fees, taxes, invoices
- Notifications
- Administration

Universal Event modules are explicitly enabled where applicable. Exhibition-specific concepts include halls, stalls, floor plans, exhibitor participation, and stall booking.

## 5. Critical business workflows

### Stall booking
Lifecycle: Available -> Reserved -> Payment Pending -> Confirmed.
Failure/expiry: Payment failure or reservation expiry -> Available.
Cancellation/refund may return a stall to availability when business rules permit.

Requirements: server-side availability validation, concurrency-safe reservation, reservation expiry, no double booking, payment state not inferred from frontend UI, auditable changes.

### Ticket purchase
Requirements:
- Server-side ticket and capacity validation.
- Capacity boundaries safe under concurrent purchase.
- Order created before payment completion.
- Server-side/webhook payment verification.
- Idempotent payment handling.
- Failed, pending, successful, cancelled, and refunded states.
- Ticket issued only after the applicable successful payment state.
- Server-side cancellation/refund enforcement.

### QR check-in
A check-in is valid only when the ticket exists, belongs to the event, is paid/valid, is not cancelled/refunded, and has not already been checked in. Duplicate attempts must be rejected and logged.

### Lead capture
Lead records retain event context and, where applicable, exhibitor/stall/ticket/registration context. Duplicate prevention and follow-up history are governed by business rules.

## 6. Permissions and tenancy
Authorization is a backend responsibility. Organizer-owned resources must be filtered against the caller's permitted organizer set. Frontend hiding is not a security boundary.

The platform must prevent cross-organizer access, privilege escalation, unauthorized financial operations, unauthorized exhibitor access to another exhibitor's data, and unauthorized visitor access to private organizer data.

## 7. Data lifecycle
Important operational, financial, analytical, and audit records should be archived or soft-deleted where historical integrity is required.

Major entities should have stable IDs, ownership/tenant relationships, lifecycle status, timestamps, foreign keys, business-rule constraints, indexes, and audit context where sensitive.

## 8. Non-functional requirements
Security: authentication, authorization, RBAC, tenant isolation, validation, rate limiting, XSS/SQL-injection defenses, secure file handling, payment/webhook verification, secret management, audit logging, and IDOR/BOLA protection.

Reliability: transaction integrity, idempotency, duplicate-event handling, health checks, logging, backups, and recovery procedures.

Performance: indexed queries, pagination, bounded payloads, rate limiting, and performance testing for critical flows.

Accessibility: WCAG-aligned keyboard access, semantic labels, focus handling, readable contrast, error identification, and responsive behavior.

## 9. Analytics
Platform: events, organizers, exhibitors, visitors, tickets, stall bookings, GMV, revenue, refunds, fees, taxes, platform earnings.

Organizer: registrations, ticket sales, revenue, stall occupancy, exhibitors, visitors, check-ins, no-shows, leads, refunds.

Exhibitor: visitor interactions, leads, qualified leads, follow-ups, conversion/performance.

Financial analytics must distinguish gross revenue, refunds, fees, taxes, net revenue, and platform earnings.

## 10. Current-state constraints
The repository contains legacy Exhibition workflows and a universal Event foundation. Migration must be additive and compatibility-preserving until dependent workflows are verified.

Universal Event migration must not compromise payment correctness, stall concurrency, floor-plan publishing concurrency, ticket capacity, check-in integrity, lead integrity, or existing authorization boundaries.

## 11. Acceptance criteria
1. Every P0 module has a documented owner/persona and workflow.
2. Financial and inventory state transitions are explicit.
3. Authorization and tenant boundaries are explicit.
4. Critical entities and relationships are documented.
5. Critical retry, expiry, duplicate, and concurrency cases are documented.
6. Analytics definitions distinguish financial measures correctly.
7. Implementation gaps are tracked rather than hidden.
8. P0 documentation is cross-checked against repository evidence.

## 12. Out of scope
Advanced AI, recommendation engines, WhatsApp automation, SSO, multi-currency, and other future capabilities require separate requirements and implementation decisions before becoming product commitments.
