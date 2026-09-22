# Audit Logging

Audit authentication/security events, role/permission changes, organizer membership changes, event publishing, stall booking changes, payment/refund mutations, ticket/check-in operations, lead access/export, subscription/billing changes and administrative configuration.

Minimum fields: actorId, actorRole, tenant/organizer context, action, entityType, entityId, timestamp, result/status, request/correlation ID and safe metadata.

Never log passwords, payment secrets, access tokens or unnecessary personal data.

Audit records should be append-oriented and protected from ordinary tenant users.