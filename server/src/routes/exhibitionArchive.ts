import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { organizerIdsWithPermission } from "../lib/access";
import { exhibitionMutationRateLimit } from "../middleware/rateLimit";
import { logAudit } from "../lib/audit";

const router = Router();

router.use(requireAuth, requireOrganizerAccess);

// Reversible exhibition lifecycle. The archive marker is kept outside the
// Prisma Exhibition model so existing status/visibility semantics remain
// unchanged. Archiving makes the exhibition private, preserving all related
// operational/financial rows; the archive record stores the exact previous
// visibility/status needed for a lossless restore.
router.delete("/:id", exhibitionMutationRateLimit, async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "exhibition:delete");
  const existing = organizerIds.length
    ? await prisma.exhibition.findFirst({ where: { id: req.params.id, organizerId: { in: organizerIds } } })
    : null;
  if (!existing) return res.status(404).json({ error: "Exhibition not found" });

  const alreadyArchived = await prisma.$queryRaw<{ exhibitionId: string }[]>`
    SELECT "exhibitionId" FROM "exhibition_archives" WHERE "exhibitionId" = ${existing.id} LIMIT 1
  `;
  if (alreadyArchived.length > 0) return res.status(409).json({ error: "Exhibition is already archived" });

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "exhibition_archives" ("exhibitionId", "archivedByUserId", "previousStatus", "previousVisibility")
      VALUES (${existing.id}, ${req.user!.id}, ${existing.status}, ${existing.visibility})
    `;
    await tx.exhibition.update({
      where: { id: existing.id },
      data: { visibility: "private" },
    });
  });

  await logAudit({
    actorUserId: req.user!.id,
    action: "exhibition.archived",
    entityType: "Exhibition",
    entityId: existing.id,
    metadata: {
      name: existing.name,
      statusAtArchive: existing.status,
      visibilityAtArchive: existing.visibility,
    },
  });

  res.status(204).end();
});

router.post("/:id/restore", exhibitionMutationRateLimit, async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "exhibition:delete");
  const existing = organizerIds.length
    ? await prisma.exhibition.findFirst({ where: { id: req.params.id, organizerId: { in: organizerIds } } })
    : null;
  if (!existing) return res.status(404).json({ error: "Exhibition not found" });

  const restored = await prisma.$transaction(async (tx) => {
    const archiveRows = await tx.$queryRaw<{ previousStatus: string; previousVisibility: string }[]>`
      SELECT "previousStatus", "previousVisibility"
      FROM "exhibition_archives"
      WHERE "exhibitionId" = ${existing.id}
      FOR UPDATE
    `;
    const archive = archiveRows[0];
    if (!archive) return null;

    await tx.$executeRaw`
      DELETE FROM "exhibition_archives" WHERE "exhibitionId" = ${existing.id}
    `;
    return tx.exhibition.update({
      where: { id: existing.id },
      data: {
        status: archive.previousStatus as "draft" | "live" | "paused" | "completed",
        visibility: archive.previousVisibility as "public" | "private",
      },
      include: { ticketTypes: true, stalls: true },
    });
  });

  if (!restored) return res.status(409).json({ error: "Exhibition is not archived" });

  await logAudit({
    actorUserId: req.user!.id,
    action: "exhibition.restored",
    entityType: "Exhibition",
    entityId: existing.id,
    metadata: { name: existing.name, statusAfterRestore: restored.status, visibilityAfterRestore: restored.visibility },
  });

  res.json({ exhibition: restored });
});

router.get("/archive-state", async (req, res) => {
  const organizerIds = await organizerIdsWithPermission(req.user!, "exhibition:view");
  if (organizerIds.length === 0) return res.json({ exhibitions: [] });

  const archived = await prisma.$queryRaw<{ exhibitionId: string; archivedAt: Date }[]>`
    SELECT ea."exhibitionId", ea."archivedAt"
    FROM "exhibition_archives" ea
    INNER JOIN "exhibitions" e ON e."id" = ea."exhibitionId"
    WHERE e."organizerId" IN (${Prisma.join(organizerIds)})
    ORDER BY ea."archivedAt" DESC
  `;

  res.json({ exhibitions: archived });
});

export default router;
