import "dotenv/config";
import { reconcilePayments } from "../src/lib/paymentReconciliation";
import { prisma } from "../src/lib/prisma";

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number`);
  return value;
}

async function main() {
  const days = readNumber("PAYMENT_RECONCILIATION_DAYS", 7);
  const limit = readNumber("PAYMENT_RECONCILIATION_LIMIT", 5000);
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

  const report = await reconcilePayments({ from, to, limit });

  console.log(JSON.stringify({
    generatedAt: report.generatedAt.toISOString(),
    window: {
      from: report.window.from.toISOString(),
      to: report.window.to.toISOString(),
    },
    scannedPayments: report.scannedPayments,
    summary: report.summary,
    findings: report.findings,
  }, null, 2));

  if (!report.summary.healthy) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
