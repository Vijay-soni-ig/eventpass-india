import { z } from "zod";

// A plain z.string() accepts any string, including values like "not-a-date"
// that later crash when passed to `new Date(...)` and on into a Prisma
// query — an unhandled throw inside an async route handler that Express 4
// cannot route to error middleware. This rejects unparseable dates with a
// clean 400 before they ever reach `new Date(...)`.
export const dateString = z.string().refine((v) => !Number.isNaN(Date.parse(v)), { message: "Invalid date" });

/**
 * Treat a date-only analytics `to` filter as inclusive of the full calendar
 * day. JavaScript parses YYYY-MM-DD as midnight UTC, which otherwise excludes
 * every record later on that date from queries using an inclusive <= bound.
 * Explicit timestamps retain their caller-specified precision.
 */
export function dateRangeEnd(value?: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    date.setUTCHours(23, 59, 59, 999);
  }
  return date;
}
