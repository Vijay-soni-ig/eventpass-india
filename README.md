# ExhibitTix

**Exhibition & Event Management Platform**

ExhibitTix is a full-stack exhibition and event management platform designed to connect organizers, exhibitors, and visitors through one operational ecosystem.

The platform supports the complete exhibition lifecycle:

**Event → Venue/Hall → Stall → Exhibitor → Booking → Payment → Visitor → Ticket → QR Check-in → Lead Capture → Analytics**

> **Project status:** ExhibitTix is under active production-readiness work. The repository contains implemented production-oriented architecture and test coverage, but individual areas should be considered according to their verified status rather than assumed complete.

---

## Platform capabilities

### Event management

- Event creation and management
- Event discovery and public event information
- Venue and hall management
- Event capacity and operational configuration
- Event-level analytics and reporting

### Exhibitor management

- Exhibitor registration and applications
- Company profile management
- Stall selection and booking
- Booth allocation
- Exhibitor representatives and team management
- Payments and invoices
- Visitor lead capture
- Exhibitor performance analytics

### Stall management

- Hall and stall layouts
- Stall inventory and pricing
- Availability management
- Reservation and payment-pending states
- Confirmed stall bookings
- Cancellation and release rules
- Concurrency protection to prevent double booking

Recommended booking lifecycle:

**Available → Reserved → Payment Pending → Confirmed**

Payment failure or reservation expiry returns the stall to availability according to the applicable business rules.

### Visitor and ticketing

- Visitor registration and authentication
- Event discovery
- Ticket types and pricing
- Ticket capacity and availability
- Ticket orders and payments
- QR ticket generation
- Ticket cancellation and refund workflows where applicable
- Event check-in

### QR check-in

A check-in must validate that:

- The ticket exists
- The ticket belongs to the correct event
- The ticket is paid and valid
- The ticket has not been cancelled or refunded
- The ticket has not already been checked in

Duplicate check-in attempts are rejected and logged.

### Lead management

ExhibitTix connects visitor interactions with exhibitor performance:

**Visitor → Event → Exhibitor → Stall → Interaction → Lead → Follow-up → Analytics**

### Commercial and financial workflows

- Orders
- Payments
- Server-side payment verification
- Payment webhooks
- Idempotent payment processing
- Failed and pending payment states
- Refunds and partial refunds where supported by business rules
- Invoices
- Fees and taxes
- Financial auditability and reconciliation support
- Subscription and entitlement architecture

---

## User roles

### Super Admin

Platform-level administration across organizers, exhibitors, visitors, events, venues, halls, stalls, bookings, tickets, payments, refunds, leads, subscriptions, reports, notifications, settings, permissions, and audit logs.

### Organizer

Creates and manages events, venues, halls, stall layouts, stall pricing, exhibitors, bookings, tickets, payments, check-ins, leads, team members, notifications, refunds, and analytics.

### Exhibitor

Manages the company profile, exhibition applications, stall bookings, payments, invoices, representatives, visitor leads, follow-ups, and performance analytics.

### Visitor

Discovers events, registers or signs in, purchases tickets, completes payment, receives QR tickets, manages tickets, requests cancellation or refund where applicable, and checks in at events.

---

## Architecture

ExhibitTix uses a separate frontend and backend application architecture.

### Frontend

- React 18
- TypeScript
- Vite
- React Router
- TanStack Query
- Tailwind CSS
- shadcn/ui and Radix UI
- React Hook Form
- Zod
- Recharts
- Leaflet
- QR scanning support

### Backend

- Node.js
- Express
- TypeScript
- Prisma ORM
- PostgreSQL-compatible database
- JWT-based authentication
- Server-side sessions
- Zod validation
- Rate limiting
- Secure file upload handling
- QR code generation
- Razorpay payment integration

### Infrastructure

- Docker
- Nginx
- GitHub Actions / CI
- Environment-based configuration

The production frontend is containerized and served through Nginx. The repository also contains production Docker configuration and health-check support.

---

## Core architecture principles

### Multi-persona RBAC

Access is controlled by role and ownership boundaries. Administrative, organizer, exhibitor, and visitor operations must remain isolated according to the application's authorization rules.

### Tenant isolation

Organizer-owned data must not be accessible across unauthorized tenants. Authorization is enforced server-side rather than relying on frontend visibility alone.

### Transaction-safe bookings

Stall and ticket availability are treated as server-side business rules. Concurrent requests must not create duplicate reservations or exceed configured capacity.

### Payment integrity

Frontend payment success is never treated as the final source of truth. Payment workflows support server-side verification, webhook processing, signature validation, idempotency, pending states, failure states, refunds, and auditability.

### Auditability

Important operational and financial changes should be traceable through audit records, including actor, action, target, timestamp, and relevant change context.

### Soft deletion

Important financial, operational, and analytical records should be archived or soft-deleted rather than physically removed when historical integrity is required.

---

## Payment lifecycle

Payment processing is designed around server-side verification rather than trusting the browser.

Typical lifecycle:

**Order Created → Payment Initiated → Pending → Server Verification / Webhook → Successful or Failed**

Payment handling should account for:

- Signature verification
- Webhook verification
- Idempotency
- Duplicate payment attempts
- Pending payments
- Failed payments
- Refunds
- Partial refunds
- Fees and taxes
- Invoice generation
- Reconciliation
- Audit trail

Razorpay credentials are configured through environment variables and are intentionally excluded from source control.

---

## Ticket capacity and check-in integrity

Ticket inventory is enforced on the server and must be safe under concurrent purchase attempts.

Check-in validation includes event ownership, ticket validity, payment state, cancellation/refund state, and duplicate check-in protection.

These workflows are treated as transactional business operations rather than UI-only interactions.

---

## Security

Production security considerations include:

- Authentication and session security
- Server-side authorization and RBAC
- Tenant isolation
- IDOR/BOLA protection
- Input validation
- Rate limiting
- XSS protection
- SQL injection protection through safe database access patterns
- Secure file upload validation
- Payment and webhook signature verification
- Sensitive configuration through environment variables
- Audit logging
- Privilege-escalation prevention

Never commit real credentials, API secrets, webhook secrets, private keys, production database credentials, or other sensitive configuration to the repository.

---

## Development setup

### Prerequisites

- Node.js 20+
- npm
- PostgreSQL or another database compatible with the configured Prisma datasource
- Razorpay credentials for testing payment flows

### Clone the repository

```bash
git clone https://github.com/Vijay-soni-ig/eventpass-india.git
cd eventpass-india
```

### Install frontend dependencies

```bash
npm install
```

### Configure environment variables

Copy the example configuration and update the values for your environment.

```bash
cp .env.example .env
```

At minimum, configure the database connection and authentication secret for local development. Razorpay credentials are required when testing payment flows.

### Install backend dependencies

```bash
cd server
npm install
cd ..
```

### Generate Prisma client

```bash
cd server
npm run prisma:generate
cd ..
```

### Run the applications

Run the frontend:

```bash
npm run dev
```

Run the backend in a separate terminal:

```bash
npm run dev:server
```

Or run both together:

```bash
npm run dev:all
```

The frontend and backend ports are controlled by the configured environment values. The example configuration uses the frontend at `http://localhost:5173` and backend API at `http://localhost:4000`.

---

## Database and Prisma

The backend uses Prisma for database access and schema management.

Common development commands:

```bash
cd server
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

Database migrations must be reviewed before applying them to production. Production deployments should use the appropriate migration strategy for the deployment environment rather than running development-only database commands blindly.

---

## Testing

Testing covers more than frontend behavior. Production readiness requires verification across the application, API, database, permissions, payments, and cross-persona workflows.

Backend tests can be run with:

```bash
cd server
npm test
```

The broader verification strategy includes:

- Unit testing
- API testing
- Integration testing
- Database testing
- UI testing
- End-to-end testing
- RBAC and permission testing
- Security testing
- Payment-flow testing
- Concurrency testing
- Regression testing

### Critical cross-persona workflow

The highest-value integration path is:

**Organizer → Event → Exhibitor → Stall → Payment → Visitor → Ticket → Payment → QR → Check-in → Lead → Analytics**

Verification should cross-check UI state, API responses, and database state throughout this lifecycle.

Important edge cases include:

- Stall double-booking attempts
- Reservation expiry
- Payment failure and retry
- Duplicate payment callbacks
- Ticket capacity boundaries
- Concurrent ticket purchases
- Refunded tickets
- Cancelled tickets
- Duplicate QR check-ins
- Unauthorized cross-tenant access
- Invalid or expired sessions

---

## Production deployment

The repository includes Docker and Nginx configuration for production-oriented frontend deployment.

Build the frontend:

```bash
npm run build
```

The frontend can also be built using Docker:

```bash
docker build -t exhibittix-frontend .
```

Production deployments should provide:

- Secure environment variables
- Production database configuration
- HTTPS/TLS
- Correct CORS origins
- Secure JWT/session configuration
- Payment credentials and webhook configuration
- Database migrations
- Application health checks
- Logging and monitoring
- Backups and recovery procedures
- Error tracking
- CI/CD verification

Do not treat a successful frontend build as proof of production readiness. Application behavior, payments, authorization, data integrity, security, and operational recovery must also be verified.

---

## Environment configuration

The repository provides `.env.example` as the configuration reference for local and deployment environments.

Key configuration areas include:

- `VITE_API_URL`
- `PORT`
- `NODE_ENV`
- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `JWT_ISSUER`
- `JWT_AUDIENCE`
- `CORS_ORIGINS`
- Razorpay credentials and webhook secret

Use different secrets and credentials for development, staging, and production.

---

## Project structure

The repository is organized around the frontend application, backend service, database layer, deployment configuration, documentation, and CI configuration.

```text
eventpass-india/
├── .github/                    # CI and repository automation
├── docs/                       # Project documentation
├── public/                     # Public frontend assets
├── server/                     # Express API and Prisma backend
│   ├── prisma/                 # Prisma schema, migrations and seed data
│   ├── src/                    # Backend application source
│   └── tests/                  # Backend tests
├── src/                        # React frontend
├── Dockerfile                  # Frontend production image
├── docker-compose.production.yml
├── nginx.conf                  # Nginx configuration
├── .env.example                # Environment configuration reference
└── README.md
```

---

## Product lifecycle

ExhibitTix is designed around the following operational lifecycle:

1. Organizer creates an event
2. Organizer configures venue, halls, and stalls
3. Exhibitor registers or applies
4. Exhibitor selects and reserves a stall
5. Stall payment is initiated and verified
6. Stall booking is confirmed
7. Visitors discover and register for the event
8. Visitors purchase tickets
9. Ticket payments are verified
10. QR tickets are issued
11. Visitors check in at the event
12. Exhibitors capture visitor leads
13. Exhibitors follow up with leads
14. Organizers and exhibitors review analytics
15. Payments, refunds, fees, and operational records are reconciled

---

## Production-readiness philosophy

A feature is not considered complete merely because its UI works.

A production-ready feature requires appropriate verification of:

- UI/UX
- API behavior
- Database integrity
- Permissions and RBAC
- Business rules
- Validation
- Loading, empty, error, and success states
- Security
- Audit logging
- Analytics
- Performance
- Accessibility
- End-to-end workflows

For financial and booking workflows, data integrity and concurrency behavior are especially critical.

---

## Contributing

Changes should preserve existing business rules, security boundaries, and data integrity.

Before submitting a significant change:

1. Review the affected product workflow.
2. Verify frontend and backend behavior.
3. Run relevant tests.
4. Check authorization and tenant isolation.
5. Review database and migration impact.
6. Test loading, empty, error, and success states.
7. Test important edge cases.
8. Confirm that existing workflows have not regressed.

---

## License

License information should be added here when the project's distribution and licensing policy is finalized.

---

**ExhibitTix**

Exhibition and event operations, from event setup to visitor check-in and exhibitor analytics.