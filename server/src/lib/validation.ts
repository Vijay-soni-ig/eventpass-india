import { z } from "zod";

// A plain z.string() accepts any string, including values like "not-a-date"
// that later crash when passed to `new Date(...)` and on into a Prisma
// query — an unhandled throw inside an async route handler that Express 4
// cannot route to error middleware. This rejects unparseable dates with a
// clean 400 before they ever reach `new Date(...)`.
export const dateString = z.string().refine((v) => !Number.isNaN(Date.parse(v)), { message: "Invalid date" });
