# Security Threat Model

Primary threats: IDOR/BOLA, privilege escalation, cross-tenant leakage, payment spoofing/webhook forgery, duplicate financial operations, SQL injection, XSS, malicious uploads, credential/session compromise, rate-limit abuse, sensitive data exposure and booking/inventory race conditions.

Mitigations:
- Centralized authorization.
- Parameterized database access.
- Strict validation.
- Provider signature verification.
- Idempotency.
- Transactional inventory updates.
- Upload type/size/content validation.
- Security headers/CORS.
- Rate limiting.
- Secret redaction.
- Audit logging.

Raw SQL in concurrency-sensitive floor-plan or inventory paths requires parameterization, review and regression tests.

No critical unresolved authorization, payment-integrity or tenant-isolation defect should pass launch.