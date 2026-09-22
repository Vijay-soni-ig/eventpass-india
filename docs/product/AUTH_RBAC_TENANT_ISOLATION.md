# Authentication, RBAC & Tenant Isolation

Protect sessions/tokens, secure passwords/OTPs, expire/revoke sessions appropriately and avoid leaking authentication state.

Authorization is server-side and resource-based.

Every organizer/exhibitor-owned query must establish scope from authenticated identity and authoritative relationships.

Controls include rate limiting, request-size limits, CORS/security headers, input validation, secure cookies/tokens, secret management and safe audit logging.

Required regression tests:
- Cross-organizer access denied.
- Cross-exhibitor access denied.
- Unauthorized mutation denied.
- Role escalation denied.
- Direct API/URL access to hidden resources denied.
- Bulk operation scope violations denied.