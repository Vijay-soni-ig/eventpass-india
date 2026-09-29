/**
 * Idempotency keys are scoped to the caller identity.
 * Anonymous callers may replay only an anonymous registration; authenticated
 * callers may replay only their own registration. This prevents an idempotency
 * key collision from becoming a cross-user registration disclosure.
 */
export function canReplayRegistration(existingUserId: string | null, requestUserId: string | null): boolean {
  return existingUserId === requestUserId;
}
