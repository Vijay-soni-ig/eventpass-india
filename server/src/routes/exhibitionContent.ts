import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { uploadExhibitionMedia, fileUrl, handleUpload } from "../middleware/upload";
import { exhibitionMutationRateLimit, uploadRateLimit } from "../middleware/rateLimit";
import { organizerIdsWithPermission } from "../lib/access";
import { logAudit } from "../lib/audit";

// ---------------------------------------------------------------------------
// Phase 25 — organizer CRUD for the five Exhibition Details content types
// (media/schedule/FAQ/highlights/audience). One file, five near-identical
// sections, deliberately NOT collapsed into a generic factory: this
// codebase's existing convention (see routes/organizerGallery.ts vs
// organizerProfile.ts) is explicit per-entity routes even when repetitive,
// which keeps each entity's authorization/validation path independently
// readable and greppable rather than hidden behind shared generic plumbing.
//
// Every mutation follows the same ownership chain: requireAuth +
// requireOrganizerAccess (global middleware) establish a real, authenticated
// organizer-role user; loadOwnedExhibition() then re-derives which
// organizerIds this specific user's role actually grants "exhibition:update"
// on and requires the exhibitionId in the URL to belong to one of them —
// never trusting the exhibitionId alone. This is the same pattern
// routes/exhibitions.ts's own loadManaged() already uses; duplicated here
// (not imported) because that helper isn't exported and re-deriving six
// lines from the same already-audited organizerIdsWithPermission() call is
// safer than reaching into another route file's internals.
// ---------------------------------------------------------------------------

const router = Router({ mergeParams: true });
router.use(requireAuth, requireOrganizerAccess);

async function loadOwnedExhibition(exhibitionId: string, user: Express.Request["user"]) {
  const organizerIds = await organizerIdsWithPermission(user!, "exhibition:update");
  if (organizerIds.length === 0) return null;
  return prisma.exhibition.findFirst({ where: { id: exhibitionId, organizerId: { in: organizerIds } } });
}

function sendForbiddenOrNotFound(res: import("express").Response, exhibition: unknown) {
  // Same shape as the rest of this codebase's ownership checks: a
  // non-owned or nonexistent exhibition both 404 identically, never
  // revealing via a 403 that a given ID exists but belongs to someone else.
  if (!exhibition) return res.status(404).json({ error: "Exhibition not found" });
}

const reorderSchema = z.object({
  items: z.array(z.object({ id: z.string().uuid(), sortOrder: z.number().int().min(0) })).min(1).max(100),
});

// A small, deliberately loosely-typed helper shared by all five entities'
// reorder endpoints — Prisma's generated per-model delegate types are too
// specific to unify across five different models without `any` somewhere;
// every CALLER of this helper (below) still passes a concretely-typed
// `prisma.exhibitionX` delegate, so the loose typing is contained entirely
// to this one internal function, not exposed at any call site.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleReorder(
  req: import("express").Request,
  res: import("express").Response,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delegate: any,
  entityLabel: string,
  auditAction: string,
) {
  const parsed = reorderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const exhibition = await loadOwnedExhibition(req.params.exhibitionId, req.user);
  if (!exhibition) return sendForbiddenOrNotFound(res, exhibition);

  const ids = parsed.data.items.map((i) => i.id);
  const owned: { id: string }[] = await delegate.findMany({ where: { id: { in: ids }, exhibitionId: exhibition.id }, select: { id: true } });
  if (owned.length !== ids.length) {
    return res.status(403).json({ error: `One or more ${entityLabel} items do not belong to this exhibition` });
  }

  await prisma.$transaction(
    parsed.data.items.map((i) => delegate.update({ where: { id: i.id }, data: { sortOrder: i.sortOrder } }))
  );

  await logAudit({
    actorUserId: req.user!.id,
    action: auditAction,
    entityType: "Exhibition",
    entityId: exhibition.id,
    metadata: { count: ids.length },
  });
  res.status(204).send();
}

// =============================================================================
// MEDIA (gallery)
// =============================================================================

const MEDIA_MAX_PER_EXHIBITION = 20;
const CAPTION_MAX = 300;
const ALT_TEXT_MAX = 150;

router.get("/:exhibitionId/media", async (req, res) => {
  const exhibition = await loadOwnedExhibition(req.params.exhibitionId, req.user);
  if (!exhibition) return sendForbiddenOrNotFound(res, exhibition);
  const items = await prisma.exhibitionMedia.findMany({ where: { exhibitionId: exhibition.id }, orderBy: { sortOrder: "asc" } });
  res.json({ items });
});

const mediaMetaSchema = z.object({
  caption: z.string().max(CAPTION_MAX).optional(),
  altText: z.string().max(ALT_TEXT_MAX).optional(),
});

router.post("/:exhibitionId/media", uploadRateLimit, handleUpload(uploadExhibitionMedia, "image"), async (req, res) => {
  const parsed = mediaMetaSchema.safeParse({ caption: req.body?.caption || undefined, altText: req.body?.altText || undefined });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const exhibition = await loadOwnedExhibition(req.params.exhibitionId, req.user);
  if (!exhibition) return sendForbiddenOrNotFound(res, exhibition);

  const existingCount = await prisma.exhibitionMedia.count({ where: { exhibitionId: exhibition.id } });
  if (existingCount >= MEDIA_MAX_PER_EXHIBITION) {
    return res.status(400).json({ error: `An exhibition can have at most ${MEDIA_MAX_PER_EXHIBITION} gallery images` });
  }

  const imageUrl = fileUrl(req, "exhibition-media", req.file.filename);
  const maxSort = await prisma.exhibitionMedia.aggregate({ where: { exhibitionId: exhibition.id }, _max: { sortOrder: true } });

  const item = await prisma.exhibitionMedia.create({
    data: {
      exhibitionId: exhibition.id,
      imageUrl,
      caption: parsed.data.caption,
      altText: parsed.data.altText,
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
    },
  });

  await logAudit({
    actorUserId: req.user!.id,
    action: "exhibition.media_added",
    entityType: "ExhibitionMedia",
    entityId: item.id,
    metadata: { exhibitionId: exhibition.id },
  });
  res.status(201).json({ item });
});

// Registered BEFORE the generic PATCH /:id below — Express matches routes
// in registration order, and "/reorder" would otherwise be swallowed by
// "/:id" (treating the literal word "reorder" as an :id param and 404ing
// inside that handler instead of ever reaching this one). Same gotcha
// routes/organizerGallery.ts's own comment documents.
router.patch("/:exhibitionId/media/reorder", exhibitionMutationRateLimit, (req, res) =>
  handleReorder(req, res, prisma.exhibitionMedia, "gallery", "exhibition.media_reordered")
);

const mediaUpdateSchema = z.object({
  caption: z.string().max(CAPTION_MAX).nullable().optional(),
  altText: z.string().max(ALT_TEXT_MAX).nullable().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

router.patch("/:exhibitionId/media/:id", exhibitionMutationRateLimit, async (req, res) => {
  const parsed = mediaUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const exhibition = await loadOwnedExhibition(req.params.exhibitionId, req.user);
  if (!exhibition) return sendForbiddenOrNotFound(res, exhibition);

  const existing = await prisma.exhibitionMedia.findFirst({ where: { id: req.params.id, exhibitionId: exhibition.id } });
  if (!existing) return res.status(404).json({ error: "Gallery item not found" });

  const item = await prisma.exhibitionMedia.update({ where: { id: existing.id }, data: parsed.data });
  await logAudit({
    actorUserId: req.user!.id,
    action: "exhibition.media_updated",
    entityType: "ExhibitionMedia",
    entityId: item.id,
    metadata: { exhibitionId: exhibition.id, changedFields: Object.keys(parsed.data) },
  });
  res.json({ item });
});

router.delete("/:exhibitionId/media/:id", exhibitionMutationRateLimit, async (req, res) => {
  const exhibition = await loadOwnedExhibition(req.params.exhibitionId, req.user);
  if (!exhibition) return sendForbiddenOrNotFound(res, exhibition);

  const existing = await prisma.exhibitionMedia.findFirst({ where: { id: req.params.id, exhibitionId: exhibition.id } });
  if (!existing) return res.status(404).json({ error: "Gallery item not found" });

  const item = await prisma.exhibitionMedia.update({ where: { id: existing.id }, data: { active: false } });
  await logAudit({
    actorUserId: req.user!.id,
    action: "exhibition.media_archived",
    entityType: "ExhibitionMedia",
    entityId: item.id,
    metadata: { exhibitionId: exhibition.id },
  });
  res.status(204).send();
});

// =============================================================================
// SCHEDULE
// =============================================================================

const SCHEDULE_MAX_PER_EXHIBITION = 30;
const SCHEDULE_TITLE_MAX = 150;
const SCHEDULE_DESC_MAX = 1000;
const TIME_LABEL_MAX = 30;

router.get("/:exhibitionId/schedule", async (req, res) => {
  const exhibition = await loadOwnedExhibition(req.params.exhibitionId, req.user);
  if (!exhibition) return sendForbiddenOrNotFound(res, exhibition);
  const items = await prisma.exhibitionSchedule.findMany({ where: { exhibitionId: exhibition.id }, orderBy: [{ date: "asc" }, { sortOrder: "asc" }] });
  res.json({ items });
});

const scheduleCreateSchema = z.object({
  date: z.string().refine((v) => !Number.isNaN(new Date(v).getTime()), "Invalid date"),
  startTime: z.string().max(TIME_LABEL_MAX).optional(),
  endTime: z.string().max(TIME_LABEL_MAX).optional(),
  title: z.string().trim().min(1).max(SCHEDULE_TITLE_MAX),
  description: z.string().max(SCHEDULE_DESC_MAX).optional(),
});

router.post("/:exhibitionId/schedule", exhibitionMutationRateLimit, async (req, res) => {
  const parsed = scheduleCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const exhibition = await loadOwnedExhibition(req.params.exhibitionId, req.user);
  if (!exhibition) return sendForbiddenOrNotFound(res, exhibition);

  const scheduleDate = new Date(parsed.data.date);
  // Schedule is optional and not required to fall inside the exhibition's
  // own date range in the strict sense (an organizer may legitimately add a
  // pre-event setup day) — validated loosely: only rejected if the
  // exhibition has BOTH real start/end dates and this date falls clearly
  // outside a reasonable +/-3 day buffer around them.
  if (exhibition.startDate && exhibition.endDate) {
    const bufferMs = 3 * 24 * 60 * 60 * 1000;
    const min = exhibition.startDate.getTime() - bufferMs;
    const max = exhibition.endDate.getTime() + bufferMs;
    if (scheduleDate.getTime() < min || scheduleDate.getTime() > max) {
      return res.status(400).json({ error: "Schedule date is too far outside the exhibition's own dates" });
    }
  }

  const count = await prisma.exhibitionSchedule.count({ where: { exhibitionId: exhibition.id } });
  if (count >= SCHEDULE_MAX_PER_EXHIBITION) {
    return res.status(400).json({ error: `An exhibition can have at most ${SCHEDULE_MAX_PER_EXHIBITION} schedule entries` });
  }

  const maxSort = await prisma.exhibitionSchedule.aggregate({ where: { exhibitionId: exhibition.id }, _max: { sortOrder: true } });
  const item = await prisma.exhibitionSchedule.create({
    data: {
      exhibitionId: exhibition.id,
      date: scheduleDate,
      startTime: parsed.data.startTime,
      endTime: parsed.data.endTime,
      title: parsed.data.title,
      description: parsed.data.description,
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
    },
  });

  await logAudit({
    actorUserId: req.user!.id,
    action: "exhibition.schedule_added",
    entityType: "ExhibitionSchedule",
    entityId: item.id,
    metadata: { exhibitionId: exhibition.id },
  });
  res.status(201).json({ item });
});

const scheduleUpdateSchema = z.object({
  date: z.string().refine((v) => !Number.isNaN(new Date(v).getTime()), "Invalid date").optional(),
  startTime: z.string().max(TIME_LABEL_MAX).nullable().optional(),
  endTime: z.string().max(TIME_LABEL_MAX).nullable().optional(),
  title: z.string().trim().min(1).max(SCHEDULE_TITLE_MAX).optional(),
  description: z.string().max(SCHEDULE_DESC_MAX).nullable().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

// Registered before the generic PATCH /:id below — see the media section's
// identical comment for why.
router.patch("/:exhibitionId/schedule/reorder", exhibitionMutationRateLimit, (req, res) =>
  handleReorder(req, res, prisma.exhibitionSchedule, "schedule", "exhibition.schedule_reordered")
);

router.patch("/:exhibitionId/schedule/:id", exhibitionMutationRateLimit, async (req, res) => {
  const parsed = scheduleUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const exhibition = await loadOwnedExhibition(req.params.exhibitionId, req.user);
  if (!exhibition) return sendForbiddenOrNotFound(res, exhibition);

  const existing = await prisma.exhibitionSchedule.findFirst({ where: { id: req.params.id, exhibitionId: exhibition.id } });
  if (!existing) return res.status(404).json({ error: "Schedule item not found" });

  const { date, ...rest } = parsed.data;
  const item = await prisma.exhibitionSchedule.update({
    where: { id: existing.id },
    data: { ...rest, date: date ? new Date(date) : undefined },
  });
  await logAudit({
    actorUserId: req.user!.id,
    action: "exhibition.schedule_updated",
    entityType: "ExhibitionSchedule",
    entityId: item.id,
    metadata: { exhibitionId: exhibition.id, changedFields: Object.keys(parsed.data) },
  });
  res.json({ item });
});

router.delete("/:exhibitionId/schedule/:id", exhibitionMutationRateLimit, async (req, res) => {
  const exhibition = await loadOwnedExhibition(req.params.exhibitionId, req.user);
  if (!exhibition) return sendForbiddenOrNotFound(res, exhibition);

  const existing = await prisma.exhibitionSchedule.findFirst({ where: { id: req.params.id, exhibitionId: exhibition.id } });
  if (!existing) return res.status(404).json({ error: "Schedule item not found" });

  const item = await prisma.exhibitionSchedule.update({ where: { id: existing.id }, data: { active: false } });
  await logAudit({
    actorUserId: req.user!.id,
    action: "exhibition.schedule_archived",
    entityType: "ExhibitionSchedule",
    entityId: item.id,
    metadata: { exhibitionId: exhibition.id },
  });
  res.status(204).send();
});

// =============================================================================
// FAQ
// =============================================================================

const FAQ_MAX_PER_EXHIBITION = 20;
const FAQ_QUESTION_MAX = 200;
const FAQ_ANSWER_MAX = 2000;

router.get("/:exhibitionId/faqs", async (req, res) => {
  const exhibition = await loadOwnedExhibition(req.params.exhibitionId, req.user);
  if (!exhibition) return sendForbiddenOrNotFound(res, exhibition);
  const items = await prisma.exhibitionFAQ.findMany({ where: { exhibitionId: exhibition.id }, orderBy: { sortOrder: "asc" } });
  res.json({ items });
});

const faqCreateSchema = z.object({
  question: z.string().trim().min(1).max(FAQ_QUESTION_MAX),
  answer: z.string().trim().min(1).max(FAQ_ANSWER_MAX),
});

router.post("/:exhibitionId/faqs", exhibitionMutationRateLimit, async (req, res) => {
  const parsed = faqCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const exhibition = await loadOwnedExhibition(req.params.exhibitionId, req.user);
  if (!exhibition) return sendForbiddenOrNotFound(res, exhibition);

  const count = await prisma.exhibitionFAQ.count({ where: { exhibitionId: exhibition.id } });
  if (count >= FAQ_MAX_PER_EXHIBITION) {
    return res.status(400).json({ error: `An exhibition can have at most ${FAQ_MAX_PER_EXHIBITION} FAQs` });
  }

  const maxSort = await prisma.exhibitionFAQ.aggregate({ where: { exhibitionId: exhibition.id }, _max: { sortOrder: true } });
  const item = await prisma.exhibitionFAQ.create({
    data: {
      exhibitionId: exhibition.id,
      question: parsed.data.question,
      answer: parsed.data.answer,
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
    },
  });

  await logAudit({
    actorUserId: req.user!.id,
    action: "exhibition.faq_added",
    entityType: "ExhibitionFAQ",
    entityId: item.id,
    metadata: { exhibitionId: exhibition.id },
  });
  res.status(201).json({ item });
});

const faqUpdateSchema = z.object({
  question: z.string().trim().min(1).max(FAQ_QUESTION_MAX).optional(),
  answer: z.string().trim().min(1).max(FAQ_ANSWER_MAX).optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

// Registered before the generic PATCH /:id below — see the media section's
// identical comment for why.
router.patch("/:exhibitionId/faqs/reorder", exhibitionMutationRateLimit, (req, res) =>
  handleReorder(req, res, prisma.exhibitionFAQ, "FAQ", "exhibition.faq_reordered")
);

router.patch("/:exhibitionId/faqs/:id", exhibitionMutationRateLimit, async (req, res) => {
  const parsed = faqUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const exhibition = await loadOwnedExhibition(req.params.exhibitionId, req.user);
  if (!exhibition) return sendForbiddenOrNotFound(res, exhibition);

  const existing = await prisma.exhibitionFAQ.findFirst({ where: { id: req.params.id, exhibitionId: exhibition.id } });
  if (!existing) return res.status(404).json({ error: "FAQ not found" });

  const item = await prisma.exhibitionFAQ.update({ where: { id: existing.id }, data: parsed.data });
  await logAudit({
    actorUserId: req.user!.id,
    action: "exhibition.faq_updated",
    entityType: "ExhibitionFAQ",
    entityId: item.id,
    metadata: { exhibitionId: exhibition.id, changedFields: Object.keys(parsed.data) },
  });
  res.json({ item });
});

router.delete("/:exhibitionId/faqs/:id", exhibitionMutationRateLimit, async (req, res) => {
  const exhibition = await loadOwnedExhibition(req.params.exhibitionId, req.user);
  if (!exhibition) return sendForbiddenOrNotFound(res, exhibition);

  const existing = await prisma.exhibitionFAQ.findFirst({ where: { id: req.params.id, exhibitionId: exhibition.id } });
  if (!existing) return res.status(404).json({ error: "FAQ not found" });

  const item = await prisma.exhibitionFAQ.update({ where: { id: existing.id }, data: { active: false } });
  await logAudit({
    actorUserId: req.user!.id,
    action: "exhibition.faq_archived",
    entityType: "ExhibitionFAQ",
    entityId: item.id,
    metadata: { exhibitionId: exhibition.id },
  });
  res.status(204).send();
});

// =============================================================================
// HIGHLIGHTS ("What to Expect")
// =============================================================================

const HIGHLIGHT_MAX_PER_EXHIBITION = 8;
const HIGHLIGHT_TITLE_MAX = 80;
const HIGHLIGHT_DESC_MAX = 300;

// A controlled, curated set — never arbitrary organizer-supplied text —
// so the frontend can safely map each key to one known Lucide icon.
const HIGHLIGHT_ICON_KEYS = [
  "users", "store", "mic", "handshake", "award", "zap", "calendar", "ticket", "shield-check", "building2",
] as const;

router.get("/:exhibitionId/highlights", async (req, res) => {
  const exhibition = await loadOwnedExhibition(req.params.exhibitionId, req.user);
  if (!exhibition) return sendForbiddenOrNotFound(res, exhibition);
  const items = await prisma.exhibitionHighlight.findMany({ where: { exhibitionId: exhibition.id }, orderBy: { sortOrder: "asc" } });
  res.json({ items });
});

const highlightCreateSchema = z.object({
  title: z.string().trim().min(1).max(HIGHLIGHT_TITLE_MAX),
  description: z.string().max(HIGHLIGHT_DESC_MAX).optional(),
  iconKey: z.enum(HIGHLIGHT_ICON_KEYS).optional(),
});

router.post("/:exhibitionId/highlights", exhibitionMutationRateLimit, async (req, res) => {
  const parsed = highlightCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const exhibition = await loadOwnedExhibition(req.params.exhibitionId, req.user);
  if (!exhibition) return sendForbiddenOrNotFound(res, exhibition);

  const count = await prisma.exhibitionHighlight.count({ where: { exhibitionId: exhibition.id } });
  if (count >= HIGHLIGHT_MAX_PER_EXHIBITION) {
    return res.status(400).json({ error: `An exhibition can have at most ${HIGHLIGHT_MAX_PER_EXHIBITION} highlights` });
  }

  const maxSort = await prisma.exhibitionHighlight.aggregate({ where: { exhibitionId: exhibition.id }, _max: { sortOrder: true } });
  const item = await prisma.exhibitionHighlight.create({
    data: {
      exhibitionId: exhibition.id,
      title: parsed.data.title,
      description: parsed.data.description,
      iconKey: parsed.data.iconKey,
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
    },
  });

  await logAudit({
    actorUserId: req.user!.id,
    action: "exhibition.highlight_added",
    entityType: "ExhibitionHighlight",
    entityId: item.id,
    metadata: { exhibitionId: exhibition.id },
  });
  res.status(201).json({ item });
});

const highlightUpdateSchema = z.object({
  title: z.string().trim().min(1).max(HIGHLIGHT_TITLE_MAX).optional(),
  description: z.string().max(HIGHLIGHT_DESC_MAX).nullable().optional(),
  iconKey: z.enum(HIGHLIGHT_ICON_KEYS).nullable().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

// Registered before the generic PATCH /:id below — see the media section's
// identical comment for why.
router.patch("/:exhibitionId/highlights/reorder", exhibitionMutationRateLimit, (req, res) =>
  handleReorder(req, res, prisma.exhibitionHighlight, "highlight", "exhibition.highlight_reordered")
);

router.patch("/:exhibitionId/highlights/:id", exhibitionMutationRateLimit, async (req, res) => {
  const parsed = highlightUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const exhibition = await loadOwnedExhibition(req.params.exhibitionId, req.user);
  if (!exhibition) return sendForbiddenOrNotFound(res, exhibition);

  const existing = await prisma.exhibitionHighlight.findFirst({ where: { id: req.params.id, exhibitionId: exhibition.id } });
  if (!existing) return res.status(404).json({ error: "Highlight not found" });

  const item = await prisma.exhibitionHighlight.update({ where: { id: existing.id }, data: parsed.data });
  await logAudit({
    actorUserId: req.user!.id,
    action: "exhibition.highlight_updated",
    entityType: "ExhibitionHighlight",
    entityId: item.id,
    metadata: { exhibitionId: exhibition.id, changedFields: Object.keys(parsed.data) },
  });
  res.json({ item });
});

router.delete("/:exhibitionId/highlights/:id", exhibitionMutationRateLimit, async (req, res) => {
  const exhibition = await loadOwnedExhibition(req.params.exhibitionId, req.user);
  if (!exhibition) return sendForbiddenOrNotFound(res, exhibition);

  const existing = await prisma.exhibitionHighlight.findFirst({ where: { id: req.params.id, exhibitionId: exhibition.id } });
  if (!existing) return res.status(404).json({ error: "Highlight not found" });

  const item = await prisma.exhibitionHighlight.update({ where: { id: existing.id }, data: { active: false } });
  await logAudit({
    actorUserId: req.user!.id,
    action: "exhibition.highlight_archived",
    entityType: "ExhibitionHighlight",
    entityId: item.id,
    metadata: { exhibitionId: exhibition.id },
  });
  res.status(204).send();
});

// =============================================================================
// AUDIENCE ("Who Should Attend")
// =============================================================================

const AUDIENCE_MAX_PER_EXHIBITION = 10;
const AUDIENCE_NAME_MAX = 80;
const AUDIENCE_DESC_MAX = 200;

router.get("/:exhibitionId/audience", async (req, res) => {
  const exhibition = await loadOwnedExhibition(req.params.exhibitionId, req.user);
  if (!exhibition) return sendForbiddenOrNotFound(res, exhibition);
  const items = await prisma.exhibitionAudience.findMany({ where: { exhibitionId: exhibition.id }, orderBy: { sortOrder: "asc" } });
  res.json({ items });
});

const audienceCreateSchema = z.object({
  name: z.string().trim().min(1).max(AUDIENCE_NAME_MAX),
  description: z.string().max(AUDIENCE_DESC_MAX).optional(),
});

router.post("/:exhibitionId/audience", exhibitionMutationRateLimit, async (req, res) => {
  const parsed = audienceCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const exhibition = await loadOwnedExhibition(req.params.exhibitionId, req.user);
  if (!exhibition) return sendForbiddenOrNotFound(res, exhibition);

  const count = await prisma.exhibitionAudience.count({ where: { exhibitionId: exhibition.id } });
  if (count >= AUDIENCE_MAX_PER_EXHIBITION) {
    return res.status(400).json({ error: `An exhibition can have at most ${AUDIENCE_MAX_PER_EXHIBITION} audience entries` });
  }

  const maxSort = await prisma.exhibitionAudience.aggregate({ where: { exhibitionId: exhibition.id }, _max: { sortOrder: true } });
  const item = await prisma.exhibitionAudience.create({
    data: {
      exhibitionId: exhibition.id,
      name: parsed.data.name,
      description: parsed.data.description,
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
    },
  });

  await logAudit({
    actorUserId: req.user!.id,
    action: "exhibition.audience_added",
    entityType: "ExhibitionAudience",
    entityId: item.id,
    metadata: { exhibitionId: exhibition.id },
  });
  res.status(201).json({ item });
});

const audienceUpdateSchema = z.object({
  name: z.string().trim().min(1).max(AUDIENCE_NAME_MAX).optional(),
  description: z.string().max(AUDIENCE_DESC_MAX).nullable().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

// Registered before the generic PATCH /:id below — see the media section's
// identical comment for why.
router.patch("/:exhibitionId/audience/reorder", exhibitionMutationRateLimit, (req, res) =>
  handleReorder(req, res, prisma.exhibitionAudience, "audience", "exhibition.audience_reordered")
);

router.patch("/:exhibitionId/audience/:id", exhibitionMutationRateLimit, async (req, res) => {
  const parsed = audienceUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const exhibition = await loadOwnedExhibition(req.params.exhibitionId, req.user);
  if (!exhibition) return sendForbiddenOrNotFound(res, exhibition);

  const existing = await prisma.exhibitionAudience.findFirst({ where: { id: req.params.id, exhibitionId: exhibition.id } });
  if (!existing) return res.status(404).json({ error: "Audience entry not found" });

  const item = await prisma.exhibitionAudience.update({ where: { id: existing.id }, data: parsed.data });
  await logAudit({
    actorUserId: req.user!.id,
    action: "exhibition.audience_updated",
    entityType: "ExhibitionAudience",
    entityId: item.id,
    metadata: { exhibitionId: exhibition.id, changedFields: Object.keys(parsed.data) },
  });
  res.json({ item });
});

router.delete("/:exhibitionId/audience/:id", exhibitionMutationRateLimit, async (req, res) => {
  const exhibition = await loadOwnedExhibition(req.params.exhibitionId, req.user);
  if (!exhibition) return sendForbiddenOrNotFound(res, exhibition);

  const existing = await prisma.exhibitionAudience.findFirst({ where: { id: req.params.id, exhibitionId: exhibition.id } });
  if (!existing) return res.status(404).json({ error: "Audience entry not found" });

  const item = await prisma.exhibitionAudience.update({ where: { id: existing.id }, data: { active: false } });
  await logAudit({
    actorUserId: req.user!.id,
    action: "exhibition.audience_archived",
    entityType: "ExhibitionAudience",
    entityId: item.id,
    metadata: { exhibitionId: exhibition.id },
  });
  res.status(204).send();
});

export default router;
