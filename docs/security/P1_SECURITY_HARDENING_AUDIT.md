# P1 Security Hardening Audit

## Scope

Repository-verifiable production security hardening for:

1. IDOR / BOLA / RBAC
2. Rate-limit coverage
3. File-upload security
4. Authentication / session edge cases

Audit basis: current main state used to create this branch, plus the existing security regression suite and production-readiness documents.

## Findings

### 1. IDOR / BOLA / RBAC

**Status: PASS - repository-verifiable**

The existing A2 tenant-isolation audit records direct authorization checks and targeted regressions across Organizer, ExhibitorBusiness, Event, Exhibition, Stall, Booking/TicketBooking, Ticket/TicketType, Lead/EventLead, Payment/Refund, Document, Analytics, and Event registration/participant surfaces.

Additional RBAC regression coverage exists for organizer/exhibitor boundaries, owner/admin membership rules, suspended memberships, scanner permissions, and payment authorization.

This pass did not identify a new repository-level tenant-isolation defect from the inspected evidence.

**Remaining verification:** deployment-level penetration testing and authenticated multi-role API testing against the deployed environment are still required before security sign-off.

### 2. Rate-limit coverage

**Status: PASS for critical route coverage; PARTIAL for production topology**

Current repository evidence includes authentication, booking, payment verification, ticket reservation/order/check-in, event and participant mutation, floor-plan, organizer/platform financial, lead/QR, upload/document deletion, and public discovery/search/asset rate limits. Automated route inventory tests protect the coverage contract.

Payment and provider webhook endpoints are intentionally excluded because provider retries must not be lost and signatures are the primary authenticity control.

**Gap:** rate-limit instances currently do not explicitly configure a shared external store. Therefore distributed/multi-instance rate-limit enforcement is NOT VERIFIED. Production deployment must either remain single-process/single-instance or add a shared rate-limit store before horizontal scaling.

### 3. Upload security

**Status: PASS baseline; PARTIAL defense-in-depth**

Verified controls include allowlisted MIME types, server-generated UUID filenames, a 5 MB file limit, multipart limits, magic-byte validation for JPEG/PNG/WebP/PDF, private document paths blocked from public static serving, authenticated parent-resource authorization for private downloads, S3 production storage requirement, upload rate limiting, and regression tests for unsupported MIME, content/MIME mismatch, oversized files, valid uploads, and public/private storage boundaries.

This branch additionally hardens public S3 asset responses with X-Content-Type-Options: nosniff.

**Remaining gap:** no malware/antivirus scanning or content-disarm pipeline is implemented. Treat this as a production defense-in-depth requirement for untrusted documents if the launch threat model requires it.

### 4. Authentication / session edge cases

**Status: PASS baseline; PARTIAL automated edge coverage**

Verified controls include bcrypt password hashing, strong password policy, JWT HS256 allowlist, issuer and audience validation, unique JWT JTI, JWT lifetime capped at 24 hours, database-backed auth sessions, token-hash validation, session expiry, explicit session revocation, logout-all, password-change session revocation, suspended-user rejection, authentication rate limiting, and password-change rate limiting.

This branch adds explicit regression coverage for JWT lifetime parser boundaries.

**Remaining verification:** add/retain integration coverage for revoked-session rejection, logout-all invalidation, password-change invalidation of prior sessions, and suspended-user access across representative protected endpoints.

## Priority

| Item | Priority | Status |
|---|---|---|
| IDOR/BOLA/RBAC tenant isolation | P1 | PASS, repository-verifiable |
| Critical endpoint rate limits | P1 | PASS |
| Distributed rate-limit enforcement | P1 | NOT VERIFIED |
| Upload type/size/storage controls | P1 | PASS baseline |
| Malware/AV scanning | P1/P2 depending launch threat model | NOT IMPLEMENTED |
| JWT/session baseline | P1 | PASS baseline |
| Revoked-session integration regressions | P1 | Strengthen coverage |
| Deployment penetration test | P1 | External dependency |

## Acceptance rule

This workstream is not considered fully production-ready until repository controls pass CI and deployment-level verification covers tenant isolation, authentication/session invalidation, rate-limit behavior through the real proxy topology, and malicious upload handling.

## External reference

The upload controls follow the defense-in-depth direction recommended by OWASP: allowlisted extensions/types, content validation, generated filenames, size limits, authorization, controlled storage, and optional malware/CDR scanning for applicable files.
