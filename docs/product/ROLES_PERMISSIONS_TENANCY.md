# Roles, Permissions & Tenant Isolation

Roles: Super Admin, Organizer, Exhibitor, Visitor.

Principles:
- Least privilege.
- Server-side authorization on every protected operation.
- Tenant scope comes from authenticated identity and authoritative database relationships.
- Never trust client-supplied tenant IDs.
- Prevent IDOR/BOLA and privilege escalation.

Organizer: own event and operational scope.
Exhibitor: own company, participation, bookings, invoices/payments, representatives and permitted lead data.
Visitor: own account, tickets, orders and permitted registration data.
Super Admin: platform-wide administration with auditability.

| Capability | Super Admin | Organizer | Exhibitor | Visitor |
|---|---|---|---|---|
| Platform administration | Yes | No | No | No |
| Own event management | Yes | Yes | No | No |
| Stall management | Yes | Yes | Own booking | No |
| Own company | Yes | Limited | Yes | No |
| Ticket purchase | Yes/testing | Yes/testing | Yes/testing | Yes |
| Check-in | Yes | Yes | Limited if granted | No |
| Own leads | Yes | Event scope | Own leads | No |
| Subscription/billing | Yes | Own scope | No | No |

UI visibility is not a security boundary.