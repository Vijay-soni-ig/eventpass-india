import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const table = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'team_members'
    ) AS "exists";
  `;

  if (!table[0]?.exists) {
    console.log(JSON.stringify({
      tableExists: false,
      teamMemberCount: 0,
      linkedUserCount: 0,
      action: "SAFE_TO_REMOVE_LEGACY_SCHEMA"
    }, null, 2));
    return;
  }

  const counts = await prisma.$queryRaw<Array<{
    teamMemberCount: bigint;
    linkedUserCount: bigint;
  }>>`
    SELECT
      COUNT(*)::bigint AS "teamMemberCount",
      COUNT("userId")::bigint AS "linkedUserCount"
    FROM "team_members";
  `;

  const teamMemberCount = Number(counts[0]?.teamMemberCount ?? 0);
  const linkedUserCount = Number(counts[0]?.linkedUserCount ?? 0);

  console.log(JSON.stringify({
    tableExists: true,
    teamMemberCount,
    linkedUserCount,
    action:
      teamMemberCount === 0
        ? "SAFE_TO_REMOVE_LEGACY_SCHEMA"
        : "DO_NOT_REMOVE_SCHEMA; MIGRATION_OR_ARCHIVE_REQUIRED"
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
