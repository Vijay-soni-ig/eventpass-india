import { Router } from "express";
import { z } from "zod";
import type { User } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { uploadGalleryImage, fileUrl, handleUpload } from "../middleware/upload";
import { profileMutationRateLimit, uploadRateLimit } from "../middleware/rateLimit";
import { organizerIdsWithPermission, hasAnyOrganizerMembership } from "../lib/access";
import { resolveOrganizerId } from "../lib/organizer";
import { logAudit } from "../lib/audit";

// Phase 22.2 — organizer gallery/media management. Mirrors
// routes/organizerProfile.ts's resolveManageableOrganizerId pattern exactly
// (same bootstrap-fallback semantics), scoped to the new
// "organizerGallery:manage" permission instead.
async function resolveManageableOrganizerId(user: User): Promise<{ organizerId: string } | { error: string }> {
  const manageableIds = await organizerIdsWithPermission(user, "organizerGallery:manage");
  if (manageableIds.length > 0) return { organizerId: manageableIds[0] };
  if (await hasAnyOrganizerMembership(user.id)) {
    return { error: "You do not have permission to manage this organizer's gallery" };
  }
  return { organizerId: await resolveOrganizerId(user.id) };
}

// Read access (list/detail in the dashboard) is available to ANY active
// organizer member, not just owner/admin — mirrors organizerProfile.ts's
// GET / resolution (any active membership), since a gallery item carries no
// private/sensitive fields that would need role-based redaction the way
// bank/tax fields do on the Organizer profile itself.
async function resolveViewableOrganizerId(user: User): Promise<string | null> {
  const membership = await prisma.organizerMembership.findFirst({
    where: { userId: user.id, status: "active", organizer: { suspended: false } },
    select: { organizerId: true },
  });
  return membership?.organizerId ?? null;
}

const router = Router();

router.use(requireAuth, requireOrganizerAccess);

const CAPTION_MAX = 300;
const ALT_TEXT_MAX = 150;

const filterSchema = z.enum(["all", "active", "inactive", "archived", "featured"]).default("all");
const sortSchema = z.enum(["custom", "newest", "oldest"]).default("custom");

router.get("/", async (req, res) => {
  const organizerId = await resolveViewableOrganizerId(req.user!);
  if (!organizerId) return res.json({ items: [] });

  const filter = filterSchema.safeParse(req.query.filter).data ?? "all";
  const sort = sortSchema.safeParse(req.query.sort).data ?? "custom";
  const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 200) : undefined;

  const where = {
    organizerId,
    ...(filter === "active" ? { active: true, archivedAt: null } : {}),
    ...(filter === "inactive" ? { active: false, archivedAt: null } : {}),
    ...(filter === "archived" ? { archivedAt: { not: null } } : {}),
    ...(filter === "featured" ? { isFeatured: true, archivedAt: null } : {}),
    ...(search ? { caption: { contains: search, mode: "insensitive" as const } } : {}),
  };

  const orderBy =
    sort === "newest" ? { createdAt: "desc" as const } : sort === "oldest" ? { createdAt: "asc" as const } : { sortOrder: "asc" as const };

  const items = await prisma.organizerGalleryMedia.findMany({ where, orderBy });
  res.json({ items });
});

router.get("/:id", async (req, res) => {
  const organizerId = await resolveViewableOrganizerId(req.user!);
  const item = organizerId
    ? await prisma.organizerGalleryMedia.findFirst({ where: { id: req.params.id, organizerId } })
    : null;
  if (!item) return res.status(404).json({ error: "Gallery item not found" });
  res.json({ item });
});

const createMetaSchema = z.object({
  caption: z.string().max(CAPTION_MAX).optional(),
  altText: z.string().max(ALT_TEXT_MAX).optional(),
});

router.post("/", uploadRateLimit, handleUpload(uploadGalleryImage, "image"), async (req, res) => {
  const parsed = createMetaSchema.safeParse({
    caption: req.body?.caption || undefined,
    altText: req.body?.altText || undefined,
  });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const resolved = await resolveManageableOrganizerId(req.user!);
  if ("error" in resolved) return res.status(403).json({ error: resolved.error });

  const imageUrl = fileUrl(req, "organizer-gallery", req.file.filename);
  const maxSort = await prisma.organizerGalleryMedia.aggregate({
    where: { organizerId: resolved.organizerId },
    _max: { sortOrder: true },
  });

  const item = await prisma.organizerGalleryMedia.create({
    data: {
      organizerId: resolved.organizerId,
      imageUrl,
      caption: parsed.data.caption,
      altText: parsed.data.altText,
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      createdByUserId: req.user!.id,
    },
  });

  await logAudit({
    actorUserId: req.user!.id,
    action: "organizer.gallery_item_added",
    entityType: "OrganizerGalleryMedia",
    entityId: item.id,
    metadata: { organizerId: resolved.organizerId },
  });
  res.status(201).json({ item });
});

const reorderSchema = z.object({
  items: z.array(z.object({ id: z.string().uuid(), sortOrder: z.number().int().min(0) })).min(1).max(500),
});

// Registered BEFORE the generic PATCH /:id below — Express matches routes in
// registration order, and "/reorder"/"/bulk" would otherwise be swallowed by
// "/:id" (treating the literal word "reorder"/"bulk" as an :id param and
// 404ing inside that handler instead of ever reaching these).
router.patch("/reorder", profileMutationRateLimit, async (req, res) => {
  const parsed = reorderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const resolved = await resolveManageableOrganizerId(req.user!);
  if ("error" in resolved) return res.status(403).json({ error: resolved.error });

  const ids = parsed.data.items.map((i) => i.id);
  const owned = await prisma.organizerGalleryMedia.findMany({
    where: { id: { in: ids }, organizerId: resolved.organizerId },
    select: { id: true },
  });
  if (owned.length !== ids.length) {
    return res.status(403).json({ error: "One or more gallery items do not belong to your organizer" });
  }

  await prisma.$transaction(
    parsed.data.items.map((i) => prisma.organizerGalleryMedia.update({ where: { id: i.id }, data: { sortOrder: i.sortOrder } }))
  );

  await logAudit({
    actorUserId: req.user!.id,
    action: "organizer.gallery_item_reordered",
    entityType: "Organizer",
    entityId: resolved.organizerId,
    metadata: { count: ids.length },
  });

  const items = await prisma.organizerGalleryMedia.findMany({ where: { organizerId: resolved.organizerId }, orderBy: { sortOrder: "asc" } });
  res.json({ items });
});

const bulkSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  action: z.enum(["activate", "deactivate", "archive"]),
});

router.patch("/bulk", profileMutationRateLimit, async (req, res) => {
  const parsed = bulkSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const resolved = await resolveManageableOrganizerId(req.user!);
  if ("error" in resolved) return res.status(403).json({ error: resolved.error });

  const owned = await prisma.organizerGalleryMedia.findMany({
    where: { id: { in: parsed.data.ids }, organizerId: resolved.organizerId },
    select: { id: true },
  });
  if (owned.length !== parsed.data.ids.length) {
    return res.status(403).json({ error: "One or more gallery items do not belong to your organizer" });
  }

  const data =
    parsed.data.action === "activate"
      ? { active: true }
      : parsed.data.action === "deactivate"
      ? { active: false }
      : { active: false, archivedAt: new Date(), isFeatured: false };

  await prisma.organizerGalleryMedia.updateMany({ where: { id: { in: parsed.data.ids } }, data });

  await logAudit({
    actorUserId: req.user!.id,
    action: `organizer.gallery_bulk_${parsed.data.action}`,
    entityType: "Organizer",
    entityId: resolved.organizerId,
    metadata: { ids: parsed.data.ids, count: parsed.data.ids.length },
  });

  const items = await prisma.organizerGalleryMedia.findMany({ where: { organizerId: resolved.organizerId }, orderBy: { sortOrder: "asc" } });
  res.json({ items });
});

const updateSchema = z.object({
  caption: z.string().max(CAPTION_MAX).nullable().optional(),
  altText: z.string().max(ALT_TEXT_MAX).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

router.patch("/:id", profileMutationRateLimit, async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const resolved = await resolveManageableOrganizerId(req.user!);
  if ("error" in resolved) return res.status(403).json({ error: resolved.error });

  const existing = await prisma.organizerGalleryMedia.findFirst({ where: { id: req.params.id, organizerId: resolved.organizerId } });
  if (!existing) return res.status(404).json({ error: "Gallery item not found" });

  const item = await prisma.organizerGalleryMedia.update({ where: { id: existing.id }, data: parsed.data });
  await logAudit({
    actorUserId: req.user!.id,
    action: "organizer.gallery_item_updated",
    entityType: "OrganizerGalleryMedia",
    entityId: item.id,
    metadata: { organizerId: resolved.organizerId, changedFields: Object.keys(parsed.data) },
  });
  res.json({ item });
});

const statusSchema = z.object({ active: z.boolean() });

router.patch("/:id/status", profileMutationRateLimit, async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const resolved = await resolveManageableOrganizerId(req.user!);
  if ("error" in resolved) return res.status(403).json({ error: resolved.error });

  const existing = await prisma.organizerGalleryMedia.findFirst({ where: { id: req.params.id, organizerId: resolved.organizerId } });
  if (!existing) return res.status(404).json({ error: "Gallery item not found" });

  const item = await prisma.organizerGalleryMedia.update({ where: { id: existing.id }, data: { active: parsed.data.active } });
  await logAudit({
    actorUserId: req.user!.id,
    action: parsed.data.active ? "organizer.gallery_item_activated" : "organizer.gallery_item_deactivated",
    entityType: "OrganizerGalleryMedia",
    entityId: item.id,
    metadata: { organizerId: resolved.organizerId },
  });
  res.json({ item });
});

const featureSchema = z.object({ featured: z.boolean() });

/**
 * Only one active featured image per organizer is enforced transactionally,
 * not via a partial unique index (see the schema.prisma doc comment on
 * OrganizerGalleryMedia for why). A `SELECT ... FOR UPDATE` on the parent
 * Organizer row serializes concurrent feature requests for the SAME
 * organizer — two transactions racing to feature different images for the
 * same organizer cannot both read-then-write past each other, because the
 * second blocks on the row lock until the first commits. This is the
 * standard Postgres technique for a "only one X per group" invariant when a
 * partial unique index isn't modeled in the schema.
 */
async function setFeatured(organizerId: string, mediaId: string, featured: boolean) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM organizers WHERE id = ${organizerId} FOR UPDATE`;
    if (featured) {
      await tx.organizerGalleryMedia.updateMany({
        where: { organizerId, isFeatured: true, id: { not: mediaId } },
        data: { isFeatured: false },
      });
    }
    return tx.organizerGalleryMedia.update({ where: { id: mediaId }, data: { isFeatured: featured } });
  });
}

router.patch("/:id/feature", profileMutationRateLimit, async (req, res) => {
  const parsed = featureSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const resolved = await resolveManageableOrganizerId(req.user!);
  if ("error" in resolved) return res.status(403).json({ error: resolved.error });

  const existing = await prisma.organizerGalleryMedia.findFirst({ where: { id: req.params.id, organizerId: resolved.organizerId } });
  if (!existing) return res.status(404).json({ error: "Gallery item not found" });

  const item = await setFeatured(resolved.organizerId, existing.id, parsed.data.featured);
  await logAudit({
    actorUserId: req.user!.id,
    action: parsed.data.featured ? "organizer.gallery_item_featured" : "organizer.gallery_item_unfeatured",
    entityType: "OrganizerGalleryMedia",
    entityId: item.id,
    metadata: { organizerId: resolved.organizerId },
  });
  res.json({ item });
});

router.delete("/:id", profileMutationRateLimit, async (req, res) => {
  const resolved = await resolveManageableOrganizerId(req.user!);
  if ("error" in resolved) return res.status(403).json({ error: resolved.error });

  const existing = await prisma.organizerGalleryMedia.findFirst({ where: { id: req.params.id, organizerId: resolved.organizerId } });
  if (!existing) return res.status(404).json({ error: "Gallery item not found" });

  const item = await prisma.organizerGalleryMedia.update({
    where: { id: existing.id },
    data: { archivedAt: existing.archivedAt ?? new Date(), active: false, isFeatured: false },
  });

  await logAudit({
    actorUserId: req.user!.id,
    action: "organizer.gallery_item_archived",
    entityType: "OrganizerGalleryMedia",
    entityId: item.id,
    metadata: { organizerId: resolved.organizerId },
  });
  res.status(204).send();
});

export default router;
