import { prisma } from "../../src/lib/prisma";

export type OrganizerMembershipChange = "revoke" | "downgrade";

export async function holdOrganizerMembershipChange(
  organizerId: string,
  membershipId: string,
  change: OrganizerMembershipChange,
) {
  let releaseLock!: () => void;
  let signalLockAcquired!: () => void;
  let blockerPid: number | undefined;
  const lockAcquired = new Promise<void>((resolve) => { signalLockAcquired = resolve; });
  const hold = new Promise<void>((resolve) => { releaseLock = resolve; });

  const transaction = prisma.$transaction(async (tx) => {
    const backend = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
    blockerPid = backend[0]?.pid;
    if (blockerPid === undefined) throw new Error("Could not identify organizer-lock transaction backend");

    await tx.$queryRaw`SELECT "id" FROM "organizers" WHERE "id" = ${organizerId} FOR UPDATE`;
    signalLockAcquired();
    await hold;

    if (change === "revoke") {
      await tx.organizerMembership.delete({ where: { id: membershipId } });
    } else {
      await tx.organizerMembership.update({ where: { id: membershipId }, data: { role: "marketing" } });
    }
  });

  await lockAcquired;
  return { blockerPid: blockerPid!, release: releaseLock, transaction };
}

export async function waitForBlockedOrganizerAccess(blockerPid: number, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const waiting = await prisma.$queryRaw<Array<{ pid: number }>>`
      SELECT pid
      FROM pg_stat_activity
      WHERE pid <> pg_backend_pid()
        AND wait_event_type = 'Lock'
        AND state = 'active'
        AND ${blockerPid} = ANY(pg_blocking_pids(pid))
        AND query ILIKE '%FROM "organizers"%'
    `;
    if (waiting.length > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for the protected Event operation to block on organizer membership lock");
}
