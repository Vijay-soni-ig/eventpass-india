// Phase 21B (P1-1): a stable key per ticket-booking INTENT, not per HTTP
// request. Persisted in sessionStorage (survives a page refresh/back-button,
// unlike component state) and keyed by exactly the fields that define "the
// same purchase attempt" — exhibition, ticket type, quantity, and visit
// date. Changing any of those is a genuinely different intent and gets a
// new key; resubmitting the same combination (refresh, double-click,
// network retry) reuses the same one, so the server can safely deduplicate
// it (see server/src/routes/bookings.ts POST /tickets).
export function getBookingIntentKey(exhibitionId: string, ticketTypeId: string, quantity: number, visitDate: string): string {
  const storageKey = `booking-intent:${exhibitionId}:${ticketTypeId}:${quantity}:${visitDate}`;
  try {
    const existing = sessionStorage.getItem(storageKey);
    if (existing) return existing;
    const key = crypto.randomUUID();
    sessionStorage.setItem(storageKey, key);
    return key;
  } catch {
    // sessionStorage unavailable (private mode, etc.) — fall back to a
    // fresh key every call. This only degrades back to "no dedup across a
    // refresh," never to a security or correctness issue.
    return crypto.randomUUID();
  }
}

interface BookingDraft {
  quantity: number;
  visitDate: string;
}

// Phase 23.4 — a logged-out visitor who picks a ticket, sets quantity/date,
// then hits the auth requirement (moved earlier in this phase, see
// BookingFlow.tsx's tickets->details transition) must not lose that
// selection across the /auth redirect. quantity/visitDate are plain
// component state today with no URL representation, so this persists them
// the same way getBookingIntentKey already persists the idempotency key —
// sessionStorage, keyed per exhibition+ticket, degrading silently to "just
// re-enter it" if storage is unavailable, never a hard failure.
export function saveBookingDraft(exhibitionId: string, ticketTypeId: string, draft: BookingDraft): void {
  try {
    sessionStorage.setItem(`booking-draft:${exhibitionId}:${ticketTypeId}`, JSON.stringify(draft));
  } catch {
    // Best-effort only — see rationale above.
  }
}

export function loadBookingDraft(exhibitionId: string, ticketTypeId: string): BookingDraft | null {
  try {
    const raw = sessionStorage.getItem(`booking-draft:${exhibitionId}:${ticketTypeId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.quantity !== "number" || typeof parsed?.visitDate !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}
