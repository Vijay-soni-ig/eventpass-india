export type ScannerTenantContext = "organizer" | "exhibitor";

export function getScannerCheckInEndpoint(
  context: ScannerTenantContext | undefined,
  bookingId: string
): string {
  if (context !== "organizer" && context !== "exhibitor") {
    throw new Error("Queued check-in has no valid tenant context and requires manual review");
  }
  if (!bookingId.trim()) {
    throw new Error("Queued check-in is missing its booking ID");
  }

  const id = encodeURIComponent(bookingId);
  return context === "exhibitor"
    ? `/api/exhibitor/scanner/tickets/${id}/check-in`
    : `/api/bookings/tickets/${id}/check-in`;
}

export function isOfflineTicketCacheFresh(
  timestamp: number,
  now = Date.now(),
  maxAgeMs = 24 * 60 * 60 * 1000
): boolean {
  return Number.isFinite(timestamp) && timestamp <= now && now - timestamp <= maxAgeMs;
}
