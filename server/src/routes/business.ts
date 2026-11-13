import { eventMutationRateLimit, uploadRateLimit } from "../middleware/rateLimit";
import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import type { User } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireExhibitorBusinessAccess } from "../middleware/auth";
import { uploadLogo, fileUrl, handleUpload } from "../middleware/upload";
import { exhibitorBusinessIdsWithPermission, hasAnyExhibitorMembership } from "../lib/access";
import { resolveExhibitorBusinessId } from "../lib/exhibitorBusiness";
import { resolveActiveBusinessSelection } from "../lib/exhibitorBusinessSelection";
import { httpUrlOrEmpty } from "../lib/httpUrl";
import { deleteStoredFile, privateStoredFileReference } from "../lib/storage";

/**
 * Resolves which business a manage-level write (PUT /, POST /logo) should
 * target: the business they can already manage, or — only if they belong
 * to no exhibitor business at all — a freshly bootstrapped one. A user who
 * has a membership but the wrong role (e.g. staff) is denied outright,
 * never silently handed a brand-new business as a side-channel.
 */
async function resolveManageableBusinessId(
  user: User,
  requestedBusinessId?: string
): Promise<{ businessId: string } | { error: string; status: 400 | 403 | 404 }> {
  const manageableIds = await exhibitorBusinessIdsWithPermission(user, "exhibitorBusiness:manage");

  if (manageableIds.length > 0) {
    const selection = resolveActiveBusinessSelection(manageableIds, requestedBusinessId);
    return "error" in selection
      ? { error: selection.error, status: selection.status }
      : selection.businessId
        ? { businessId: selection.businessId }
        : { error: "Select an active exhibitor business before saving changes", status: 400 };
  }
  if (requestedBusinessId) {
    return { error: "You do not have permission to manage this business", status: 403 };
  }
  if (await hasAnyExhibitorMembership(user.id)) {
    return { error: "You do not have permission to manage this business" };
  }
  return { businessId: await resolveExhibitorBusinessId(user.id) };
}

async function requireBusinessManageBeforeUpload(req: Request, res: Response, next: NextFunction) {
  try {
    const resolved = await resolveManageableBusinessId(req.user!, req.get("X-Exhibitor-Business-Id")?.trim());
    if ("error" in resolved) return res.status(resolved.status).json({ error: resolved.error });
    return next();
  } catch (error) {
    return next(error);
  }
}

const router = Router();

router.use(requireAuth, requireExhibitorBusinessAccess);

// Bank account and tax identifiers are only returned to users who can also
// manage the business profile (owner/admin) — a lower-privilege "staff"
// member holding only exhibitorBusiness:view (e.g. booth scanning staff)
// has no operational need for the company's bank account number/IFSC/GST/PAN.
const BANK_AND_TAX_FIELDS = ["bankAccountName", "bankAccountNumber", "bankIfsc", "gst", "pan"] as const;

router.get("/", async (req, res) => {
  const viewIds = await exhibitorBusinessIdsWithPermission(req.user!, "exhibitorBusiness:view");
  const requestedBusinessId = req.get("X-Exhibitor-Business-Id")?.trim();

  const selection = resolveActiveBusinessSelection(viewIds, requestedBusinessId);
  if ("error" in selection) return res.status(selection.status).json({ error: selection.error });

  const selectedBusinessId = selection.businessId;
  const business = selectedBusinessId
    ? await prisma.exhibitorBusiness.findUnique({ where: { id: selectedBusinessId } })
    : null;

  if (business) {
    const manageIds = await exhibitorBusinessIdsWithPermission(req.user!, "exhibitorBusiness:manage");
    if (!manageIds.includes(business.id)) {
      for (const field of BANK_AND_TAX_FIELDS) {
        (business as Record<string, unknown>)[field] = null;
      }
    }
  }

  res.json({ business });
});

const upsertSchema = z.object({
  companyName: z.string().optional(),
  businessType: z.string().optional(),
  address: z.string().optional(),
  gst: z.string().optional(),
  pan: z.string().optional(),
  website: httpUrlOrEmpty(500).optional(),
  brandPrimaryColor: z.string().optional(),
  brandSecondaryColor: z.string().optional(),
  bankAccountName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  bankIfsc: z.string().optional(),
  taxCategory: z.string().optional(),
  invoicePreference: z.string().optional(),
});

router.put("/", eventMutationRateLimit, async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const resolved = await resolveManageableBusinessId(req.user!, req.get("X-Exhibitor-Business-Id")?.trim());
  if ("error" in resolved) return res.status(403).json({ error: resolved.error });
  const business = await prisma.exhibitorBusiness.update({ where: { id: resolved.businessId }, data: parsed.data });
  res.json({ business });
});

router.post("/logo", requireBusinessManageBeforeUpload, uploadRateLimit, handleUpload(uploadLogo, "logo"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  const logoUrl = fileUrl(req, "business-logos", req.file.filename);
  let businessId: string;
  let business: Awaited<ReturnType<typeof prisma.exhibitorBusiness.update>>;
  try {
    const resolved = await resolveManageableBusinessId(req.user!, req.get("X-Exhibitor-Business-Id")?.trim());
    if ("error" in resolved) {
      await deleteStoredFile(privateStoredFileReference("business-logos", req.file.filename));
      return res.status(resolved.status).json({ error: resolved.error });
    }
    businessId = resolved.businessId;
    business = await prisma.exhibitorBusiness.update({ where: { id: businessId }, data: { logoUrl } });
  } catch (error) {
    await deleteStoredFile(privateStoredFileReference("business-logos", req.file.filename)).catch((cleanupError) => {
      console.error("Failed to clean up rejected exhibitor business logo upload:", cleanupError);
    });
    throw error;
  }
  // The database now references this file. Do not remove it if response work
  // fails after persistence.
  res.json({ business });
});

export default router;
