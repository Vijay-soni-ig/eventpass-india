import { Router } from "express";
import { z } from "zod";
import type { User } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireOrganizerAccess } from "../middleware/auth";
import { uploadOrganizerLogo, uploadOrganizerCover, fileUrl, handleUpload } from "../middleware/upload";
import { profileMutationRateLimit, uploadRateLimit } from "../middleware/rateLimit";
import { organizerIdsWithPermission, hasAnyOrganizerMembership } from "../lib/access";
import { resolveOrganizerId } from "../lib/organizer";
import { logAudit } from "../lib/audit";
import { generateFollowerNotifications } from "../lib/notificationService";

// Phase 22.1 — organizer self-service public profile management. Mirrors
// routes/business.ts's resolveManageableBusinessId pattern exactly: a
// member with the wrong role (e.g. scanner) is denied outright, never
// silently handed a freshly bootstrapped organizer as a side-channel.
async function resolveManageableOrganizerId(user: User): Promise<{ organizerId: string } | { error: string }> {
  const manageableIds = await organizerIdsWithPermission(user, "organizerProfile:manage");
  if (manageableIds.length > 0) return { organizerId: manageableIds[0] };
  if (await hasAnyOrganizerMembership(user.id)) {
    return { error: "You do not have permission to manage this organizer's profile" };
  }
  return { organizerId: await resolveOrganizerId(user.id) };
}

const RESERVED_SLUGS = new Set([
  "admin", "api", "public", "organizer", "organizers", "exhibitor", "exhibitors",
  "platform", "auth", "login", "signup", "dashboard", "settings", "uploads",
]);

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const slugSchema = z
  .string()
  .min(3)
  .max(50)
  .refine((s) => SLUG_PATTERN.test(s), "Slug must be lowercase letters, numbers, and hyphens only")
  .refine((s) => !RESERVED_SLUGS.has(s), "This slug is reserved");

const ALLOWED_URL_PREFIXES = ["http://", "https://"];
const BLOCKED_URL_PREFIXES = ["javascript:", "data:", "vbscript:"];

const safeUrlSchema = z.string().refine((url) => {
  const lower = url.trim().toLowerCase();
  if (BLOCKED_URL_PREFIXES.some((p) => lower.startsWith(p))) return false;
  return ALLOWED_URL_PREFIXES.some((p) => lower.startsWith(p));
}, "URL must start with http:// or https://");

const router = Router();

router.use(requireAuth, requireOrganizerAccess);

// Bank/tax identifiers are only returned to a caller who can also manage the
// profile (owner/admin) — mirrors business.ts's identical BANK_AND_TAX_FIELDS
// redaction for a lower-privilege organizer member (e.g. scanner) viewing
// their own organizer's profile in the dashboard.
const BANK_AND_TAX_FIELDS = ["bankAccountName", "bankAccountNumber", "bankIfsc", "gst", "pan"] as const;

router.get("/", async (req, res) => {
  const memberships = await prisma.organizerMembership.findMany({
    where: { userId: req.user!.id, status: "active", organizer: { suspended: false } },
    select: { organizerId: true },
  });
  const organizerId = memberships[0]?.organizerId;
  const organizer = organizerId
    ? await prisma.organizer.findUnique({
        where: { id: organizerId },
        include: { socialLinks: { orderBy: { sortOrder: "asc" } }, _count: { select: { follows: true } } },
      })
    : null;

  if (organizer) {
    const manageIds = await organizerIdsWithPermission(req.user!, "organizerProfile:manage");
    if (!manageIds.includes(organizer.id)) {
      for (const field of BANK_AND_TAX_FIELDS) {
        (organizer as Record<string, unknown>)[field] = null;
      }
    }
  }

  res.json({ organizer });
});

const upsertSchema = z.object({
  description: z.string().max(2000).optional(),
  website: z.string().optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  publicEmail: z.string().email().optional().or(z.literal("")),
  publicPhone: z.string().max(30).optional(),
  publicProfileEnabled: z.boolean().optional(),
  slug: slugSchema.optional(),
});

router.put("/", profileMutationRateLimit, async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const resolved = await resolveManageableOrganizerId(req.user!);
  if ("error" in resolved) return res.status(403).json({ error: resolved.error });

  const { publicEmail, ...rest } = parsed.data;
  const data = { ...rest, ...(publicEmail !== undefined ? { publicEmail: publicEmail || null } : {}) };

  try {
    const before = await prisma.organizer.findUniqueOrThrow({ where: { id: resolved.organizerId } });
    const organizer = await prisma.organizer.update({ where: { id: resolved.organizerId }, data });
    await logAudit({
      actorUserId: req.user!.id,
      action: "organizer.profile_updated",
      entityType: "Organizer",
      entityId: resolved.organizerId,
      metadata: { changedFields: Object.keys(data) },
    });
    await notifyFollowersOfProfileChange(before, organizer);
    res.json({ organizer });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ error: "This slug is already taken" });
    }
    throw err;
  }
});

// Phase 22.3 — ORGANIZER_PROFILE_UPDATED fires only when a field a public
// visitor can actually see changes (description/website/location), only
// while the profile is publicly visible, and only if a slug exists to link
// to (the public profile route is slug-only — see routes/public.ts). Never
// fires for private/internal fields (gst/pan/bank*/suspended/etc — those
// aren't even in this route's upsertSchema to begin with).
async function notifyFollowersOfProfileChange(
  before: { description: string | null; website: string | null; city: string | null; state: string | null; country: string | null },
  after: { id: string; name: string; slug: string | null; publicProfileEnabled: boolean; description: string | null; website: string | null; city: string | null; state: string | null; country: string | null; updatedAt: Date }
) {
  if (!after.publicProfileEnabled || !after.slug) return;

  const meaningfulChanged =
    before.description !== after.description ||
    before.website !== after.website ||
    before.city !== after.city ||
    before.state !== after.state ||
    before.country !== after.country;
  if (!meaningfulChanged) return;

  await generateFollowerNotifications({
    organizerId: after.id,
    type: "ORGANIZER_PROFILE_UPDATED",
    title: `${after.name} updated their profile`,
    message: "Check out what's new on their public profile.",
    entityType: "Organizer",
    entityId: after.id,
    actionUrl: `/organizers/${after.slug}`,
    sourceVersion: after.updatedAt.toISOString(),
  });
}

router.post("/logo", uploadRateLimit, handleUpload(uploadOrganizerLogo, "logo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const logoUrl = fileUrl(req, "organizer-logos", req.file.filename);
  const resolved = await resolveManageableOrganizerId(req.user!);
  if ("error" in resolved) return res.status(403).json({ error: resolved.error });
  const organizer = await prisma.organizer.update({ where: { id: resolved.organizerId }, data: { logoUrl } });
  await logAudit({ actorUserId: req.user!.id, action: "organizer.logo_updated", entityType: "Organizer", entityId: resolved.organizerId });
  res.json({ organizer });
});

router.post("/cover", uploadRateLimit, handleUpload(uploadOrganizerCover, "cover"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const coverImageUrl = fileUrl(req, "organizer-covers", req.file.filename);
  const resolved = await resolveManageableOrganizerId(req.user!);
  if ("error" in resolved) return res.status(403).json({ error: resolved.error });
  const organizer = await prisma.organizer.update({ where: { id: resolved.organizerId }, data: { coverImageUrl } });
  await logAudit({ actorUserId: req.user!.id, action: "organizer.cover_updated", entityType: "Organizer", entityId: resolved.organizerId });
  res.json({ organizer });
});

const ALLOWED_PLATFORMS = new Set(["instagram", "facebook", "linkedin", "twitter", "youtube", "other"]);
const MAX_SOCIAL_LINKS = 8;

const socialLinkSchema = z.object({
  platform: z.string().refine((p) => ALLOWED_PLATFORMS.has(p), "Unsupported platform"),
  url: safeUrlSchema,
});

router.post("/social-links", profileMutationRateLimit, async (req, res) => {
  const parsed = socialLinkSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const resolved = await resolveManageableOrganizerId(req.user!);
  if ("error" in resolved) return res.status(403).json({ error: resolved.error });

  const count = await prisma.organizerSocialLink.count({ where: { organizerId: resolved.organizerId } });
  if (count >= MAX_SOCIAL_LINKS) {
    return res.status(400).json({ error: `You can add up to ${MAX_SOCIAL_LINKS} social links` });
  }

  const socialLink = await prisma.organizerSocialLink.create({
    data: { organizerId: resolved.organizerId, platform: parsed.data.platform, url: parsed.data.url, sortOrder: count },
  });
  await logAudit({ actorUserId: req.user!.id, action: "organizer.social_link_added", entityType: "Organizer", entityId: resolved.organizerId, metadata: { socialLinkId: socialLink.id, platform: socialLink.platform } });
  res.status(201).json({ socialLink });
});

const socialLinkPatchSchema = z.object({
  url: safeUrlSchema.optional(),
  sortOrder: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
});

router.patch("/social-links/:id", profileMutationRateLimit, async (req, res) => {
  const parsed = socialLinkPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const resolved = await resolveManageableOrganizerId(req.user!);
  if ("error" in resolved) return res.status(403).json({ error: resolved.error });

  const existing = await prisma.organizerSocialLink.findFirst({ where: { id: req.params.id, organizerId: resolved.organizerId } });
  if (!existing) return res.status(404).json({ error: "Social link not found" });

  const socialLink = await prisma.organizerSocialLink.update({ where: { id: existing.id }, data: parsed.data });
  await logAudit({ actorUserId: req.user!.id, action: "organizer.social_link_updated", entityType: "Organizer", entityId: resolved.organizerId, metadata: { socialLinkId: socialLink.id } });
  res.json({ socialLink });
});

router.delete("/social-links/:id", profileMutationRateLimit, async (req, res) => {
  const resolved = await resolveManageableOrganizerId(req.user!);
  if ("error" in resolved) return res.status(403).json({ error: resolved.error });

  const existing = await prisma.organizerSocialLink.findFirst({ where: { id: req.params.id, organizerId: resolved.organizerId } });
  if (!existing) return res.status(404).json({ error: "Social link not found" });

  await prisma.organizerSocialLink.delete({ where: { id: existing.id } });
  await logAudit({ actorUserId: req.user!.id, action: "organizer.social_link_removed", entityType: "Organizer", entityId: resolved.organizerId, metadata: { socialLinkId: existing.id } });
  res.status(204).send();
});

export default router;
