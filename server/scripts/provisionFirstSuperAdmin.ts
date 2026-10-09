/**
 * Controlled first production Super Admin provisioning.
 *
 * This script is intentionally one-time: it refuses to run unless the database
 * has zero existing Super Admins, the target ID/email match, and explicit
 * production/change/reviewer confirmations are supplied. Never use seed.ts.
 */
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function main() {
  if (process.env.NODE_ENV !== "production") {
    throw new Error("Refusing to run unless NODE_ENV=production is explicitly set.");
  }

  const targetUserId = required("ADMIN_GRANT_TARGET_USER_ID");
  const expectedEmail = required("ADMIN_GRANT_EXPECTED_EMAIL").toLowerCase();
  const operator = required("ADMIN_GRANT_OPERATOR");
  const reviewer = required("ADMIN_GRANT_APPROVED_BY");
  const changeId = required("ADMIN_GRANT_CHANGE_ID");
  const confirmation = required("CONFIRM_PRODUCTION_ADMIN_GRANT");

  if (operator.toLowerCase() === reviewer.toLowerCase()) {
    throw new Error("Operator and independent approver must be different people.");
  }
  if (confirmation !== `GRANT_SUPER_ADMIN_TO:${targetUserId}`) {
    throw new Error("Explicit target confirmation does not match the requested user ID.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(expectedEmail)) {
    throw new Error("ADMIN_GRANT_EXPECTED_EMAIL must be a valid email address.");
  }

  const result = await prisma.$transaction(async (tx) => {
    // Serialize first-admin attempts so two concurrent runs cannot bootstrap
    // separate first admins. Transaction-scoped lock releases on commit/rollback.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(731904226, 1)`;

    const existingAdmins = await tx.user.count({ where: { platformRole: "super_admin" } });
    if (existingAdmins !== 0) {
      throw new Error(`First-admin bootstrap refused: found ${existingAdmins} existing Super Admin(s).`);
    }

    const target = await tx.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, email: true, platformRole: true, suspended: true },
    });
    if (!target) throw new Error("Target user ID was not found.");
    if (target.email.toLowerCase() !== expectedEmail) {
      throw new Error("Target email does not match the independently verified expected email.");
    }
    if (target.platformRole !== null) {
      throw new Error("Target already has a platform role; refusing to overwrite it.");
    }
    if (target.suspended) throw new Error("Suspended accounts cannot be promoted.");

    const updated = await tx.user.updateMany({
      where: { id: target.id, email: target.email, platformRole: null, suspended: false },
      data: { platformRole: "super_admin" },
    });
    if (updated.count !== 1) {
      throw new Error("Target changed during provisioning; no role was granted.");
    }

    // actorUserId is null because the out-of-band operator is not necessarily
    // an application user. Identity, reviewer, change ID and target are recorded
    // explicitly in metadata. Failure to write this record rolls back the grant.
    await tx.auditLog.create({
      data: {
        actorUserId: null,
        action: "platform.super_admin_provisioned",
        entityType: "User",
        entityId: target.id,
        metadata: {
          method: "controlled_out_of_band_first_admin",
          operator,
          approvedBy: reviewer,
          changeId,
          targetUserId: target.id,
          targetEmail: target.email,
          previousPlatformRole: target.platformRole,
          newPlatformRole: "super_admin",
        } as Prisma.InputJsonValue,
      },
    });

    return { id: target.id, email: target.email };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  console.log("First Super Admin provisioned successfully.");
  console.log(`Target user ID: ${result.id}`);
  console.log(`Target email: ${result.email}`);
  console.log(`Change record: ${changeId}`);
  console.log("Next: verify a fresh login, admin-route authorization, and the audit record.");
}

main()
  .catch((error: unknown) => {
    console.error("First-admin provisioning failed:", error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
