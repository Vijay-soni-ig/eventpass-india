# Database & ERD Specification

Core entities: User, Organizer, Exhibitor, Visitor, Event, EventCategory, EventModuleEnablement, Venue, Hall, Stall, StallBooking, TicketType, Ticket, Order, Payment, Refund, CheckIn, Lead, LeadInteraction, LeadFollowUp, Notification, Subscription, Invoice, AuditLog.

Key relationships:
- Organizer 1:N Event
- Event 1:N halls/stalls
- Exhibitor 1:N StallBooking
- Event 1:N TicketType
- Order 1:N Ticket
- Order 1:N Payment
- Payment 1:N Refund where partial refunds are supported
- Ticket 1:0..1 CheckIn
- Event + Exhibitor + Visitor context → Lead
- Lead 1:N Interaction/FollowUp
- Exhibition 0..1:1 Event via nullable unique Exhibition.eventId

Major entities require stable PKs, FKs, status, timestamps, ownership, unique constraints and indexes. Important financial/operational records should be archived rather than hard-deleted.

Index tenant ownership, event IDs, booking inventory keys, payment/order provider references, statuses and reporting timestamps.

Use additive migrations and explicit backfills. Do not remove legacy reads until progressive cutover is verified.