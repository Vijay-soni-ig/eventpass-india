export function formatEventDate(dateString: string | null | undefined): string {
  if (!dateString) return "TBA";
  return new Date(dateString).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Whole-day span between two ISO dates, inclusive (same day = 1). Null if either date is missing/invalid. */
export function eventDurationDays(startDate: string | null, endDate: string | null): number | null {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  return Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
}
