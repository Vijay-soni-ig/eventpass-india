import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = path.resolve(__dirname, "..");
const routeRoot = path.join(root, "src", "routes");

const criticalRateLimitContracts: Array<{
  routeFile: string;
  requiredExports: string[];
}> = [
  { routeFile: "auth.ts", requiredExports: ["authRateLimit"] },
  { routeFile: "bookings.ts", requiredExports: ["bookingCreationRateLimit"] },
  { routeFile: "payments.ts", requiredExports: ["paymentVerifyRateLimit"] },
  {
    routeFile: "eventTicketReservations.ts",
    requiredExports: ["eventTicketReservationRateLimit", "eventTicketReservationCancelRateLimit"],
  },
  { routeFile: "eventTicketOrders.ts", requiredExports: ["eventTicketOrderRateLimit"] },
  { routeFile: "eventTicketCheckIn.ts", requiredExports: ["eventTicketCheckInRateLimit"] },
  { routeFile: "events.ts", requiredExports: ["eventMutationRateLimit"] },
  { routeFile: "eventParticipants.ts", requiredExports: ["eventMutationRateLimit"] },
  { routeFile: "floorPlanLayout.ts", requiredExports: ["floorPlanMutationRateLimit"] },
  { routeFile: "organizerPayments.ts", requiredExports: ["financialMutationRateLimit"] },
  { routeFile: "platform.ts", requiredExports: ["platformAdminMutationRateLimit"] },
  { routeFile: "exhibitorParticipations.ts", requiredExports: ["exhibitorParticipationMutationRateLimit"] },
  { routeFile: "exhibitorScanner.ts", requiredExports: ["exhibitorScannerMutationRateLimit"] },
  { routeFile: "documents.ts", requiredExports: ["uploadRateLimit", "documentDeleteRateLimit"] },
  { routeFile: "organizerGallery.ts", requiredExports: ["uploadRateLimit"] },
  { routeFile: "leads.ts", requiredExports: ["leadMutationRateLimit"] },
  { routeFile: "eventLeads.ts", requiredExports: ["leadMutationRateLimit"] },
  { routeFile: "eventLeadCaptureContexts.ts", requiredExports: ["leadMutationRateLimit"] },
];

test("PR-01 critical mutation rate-limit inventory remains wired", () => {
  const missing: string[] = [];

  for (const contract of criticalRateLimitContracts) {
    const source = fs.readFileSync(path.join(routeRoot, contract.routeFile), "utf8");

    for (const limiter of contract.requiredExports) {
      if (!source.includes(limiter)) {
        missing.push(`${contract.routeFile}: missing ${limiter}`);
      }
    }
  }

  assert.deepEqual(
    missing,
    [],
    `Critical rate-limit wiring drift detected: ${missing.join("; ")}`,
  );
});

test("PR-01 critical rate-limit inventory covers the intended high-risk families", () => {
  assert.ok(
    criticalRateLimitContracts.length >= 18,
    `Expected at least 18 critical route-family contracts, found ${criticalRateLimitContracts.length}`,
  );
});
