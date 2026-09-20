-- Enforce universal ticket lead idempotency at the database level.
-- PostgreSQL permits multiple NULLs in a unique constraint, so this only
-- constrains ticket-backed leads and does not change manual/other lead flows.
CREATE UNIQUE INDEX "event_leads_eventId_exhibitorBusinessId_ticketId_key"
ON "event_leads"("eventId", "exhibitorBusinessId", "ticketId");