import { Router } from "express";
import { z } from "zod";
import type { User } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireExhibitorBusinessAccess } from "../middleware/auth";
import { uploadLogo, fileUrl } from "../middleware/upload";
import { exhibitorBusinessIdsWithPermission, hasAnyExhibitorMembership } from "../lib/access";
import { resolveExhibitorBusinessId } from "../lib/exhibitorBusiness";

/**
 * Resolves which business a manage-level write (PUT /, POST /logo) should
 * target: the business they can already manage, or — only if they belong
 * to no exhibitor business at all — a freshly bootstrapped one. A user who
 * has a membership but the wrong role (e.g. staff) is denied outright,
 * never silently handed a brand-new business as a side-channel.
 */
async function resolveManageableBusinessId(user: User): Promise<{ businessId: string } | { error: string }> {
  const manageableIds = await exhibitorBusinessIdsWithPermission(user, "exhibitorBusiness:manage");
  if (manageableIds.length > 0) return { businessId: manageableIds[0] };
  if (await hasAnyExhibitorMembership(user.id)) {
    return { error: "You do not have permission to manage this business" };
  }
  return { businessId: await resolveExhibitorBusinessId(user.id) };
}

const router = Router();

router.use(requireAuth, requireExhibitorBusinessAccess);

router.get("/", async (req, res) => {
  const ids = await exhibitorBusinessIdsWithPermission(req.user!, "exhibitorBusiness:view");
  const business = ids.length
    ? await prisma.exhibitorBusiness.findFirst({ where: { id: { in: ids } } })
    : null;
  res.json({ business });
});

const upsertSchema = z.object({
  companyName: z.string().optional(),
  businessType: z.string().optional(),
  address: z.string().optional(),
  gst: z.string().optional(),
  pan: z.string().optional(),
  website: z.string().optional(),
  brandPrimaryColor: z.string().optional(),
  brandSecondaryColor: z.string().optional(),
  bankAccountName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  bankIfsc: z.string().optional(),
  taxCategory: z.string().optional(),
  invoicePreference: z.string().optional(),
});

router.put("/", async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const resolved = await resolveManageableBusinessId(req.user!);
  if ("error" in resolved) return res.status(403).json({ error: resolved.error });
  const business = await prisma.exhibitorBusiness.update({ where: { id: resolved.businessId }, data: parsed.data });
  res.json({ business });
});

router.post("/logo", uploadLogo.single("logo"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  const logoUrl = fileUrl(req, "business-logos", req.file.filename);
  const resolved = await resolveManageableBusinessId(req.user!);
  if ("error" in resolved) return res.status(403).json({ error: resolved.error });
  const business = await prisma.exhibitorBusiness.update({ where: { id: resolved.businessId }, data: { logoUrl } });
  res.json({ business });
});

export default router;
