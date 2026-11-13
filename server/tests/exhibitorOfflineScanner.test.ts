import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getScannerCheckInEndpoint,
  isOfflineTicketCacheFresh,
  getOfflineCheckInCacheKey,
} from "../../src/lib/exhibitorOfflineScanner";

test("exhibitor queued scans use the exhibitor-scoped check-in endpoint", () => {
  assert.equal(
    getScannerCheckInEndpoint("exhibitor", "booking-123"),
    "/api/exhibitor/scanner/tickets/booking-123/check-in"
  );
});

test("organizer queued scans retain the organizer-scoped check-in endpoint", () => {
  assert.equal(
    getScannerCheckInEndpoint("organizer", "booking-123"),
    "/api/bookings/tickets/booking-123/check-in"
  );
});

test("tenant routing rejects missing or invalid context instead of falling back", () => {
  assert.throws(() => getScannerCheckInEndpoint(undefined, "booking-123"), /tenant context/);
  assert.throws(() => getScannerCheckInEndpoint("visitor" as never, "booking-123"), /tenant context/);
});

test("queued booking IDs are URL encoded", () => {
  assert.equal(
    getScannerCheckInEndpoint("exhibitor", "booking/with space"),
    "/api/exhibitor/scanner/tickets/booking%2Fwith%20space/check-in"
  );
});

test("offline ticket cache accepts only non-future records within the freshness window", () => {
  const now = 1_800_000_000_000;
  assert.equal(isOfflineTicketCacheFresh(now - 60_000, now), true);
  assert.equal(isOfflineTicketCacheFresh(now - 24 * 60 * 60 * 1000, now), true);
  assert.equal(isOfflineTicketCacheFresh(now - 24 * 60 * 60 * 1000 - 1, now), false);
  assert.equal(isOfflineTicketCacheFresh(now + 1, now), false);
  assert.equal(isOfflineTicketCacheFresh(Number.NaN, now), false);
});

test("confirmed check-in cache keys are scoped by scanner context", () => {
  assert.equal(getOfflineCheckInCacheKey("exhibitor", "booking-123"), "checkin_exhibitor_booking-123");
  assert.equal(getOfflineCheckInCacheKey("organizer", "booking-123"), "checkin_organizer_booking-123");
});
