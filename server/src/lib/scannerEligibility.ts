/**
 * Ticket check-in is an operational action, not just a payment check.
 * Only live exhibitions may admit attendees; draft, paused and completed
 * exhibitions must not accept scans.
 */
export function canCheckInForExhibitionStatus(status: string): boolean {
  return status === "live";
}
