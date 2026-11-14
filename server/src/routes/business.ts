import { eventMutationRateLimit, uploadRateLimit } from "../middleware/rateLimit";
import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import type { Prisma, User } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireExhibitorBusinessAccess } from "../middleware/auth";
import { uploadLogo, fileUrl, handleUpload } from "../middleware/upload";
import { exhibitorBusinessIdsWithPermission, hasAnyExhibitorMembership, isPlatformAdmin } from "../lib/access";
import { can, exhibitorRoleToRole } from "../lib/permissions";
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
    return { error: "You do not have permission to manage this business", status: 403 };
  }
  return { businessId: await resolveExhibitorBusinessId(user.id) };
}

/**
 * Revalidate manage permission inside the same transaction as the profile
 * write. Membership mutations lock the business row too, so a concurrent
 * revoke/demotion cannot slip between authorization and persistence.
 */
async function updateBusinessForManager(
  user: User,
  businessId: string,
  data: Prisma.ExhibitorBusinessUpdateInput
) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "exhibitor_businesses" WHERE "id" = ${businessId} FOR UPDATE`;

    if (!isPlatformAdmin(user)) {
      const membership = await tx.exhibitorMembership.findFirst({
        where: {
          exhibitorBusinessId: businessId,
          userId: user.id,
          status: "active",
          business: { suspended: false },
        },
        select: { role: true },
      });
      if (!membership || !can(exhibitorRoleToRole(membership.role), "exhibitorBusiness:manage")) {
        throw new Error("Business management permission changed; refresh and try again");
      }
    }

    return tx.exhibitorBusiness.update({ where: { id: businessId }, data });
  });
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
const BANK_AND_TAX_FIELDS = [
  "bankAccountName",
  "bankAccountNumber",
  "bankIfsc",
  "gst",
  "pan",
  "taxCategory",
  "invoicePreference",
  "bankVerified",
  "kycStatus",
] as const;

router.get("/", async (req, res) => {
  const viewIds = await exhibitorBusinessIdsWithPermission(req.user!, "exhibitorBusiness:view");
  const requestedBusinessId = req.get("X-Exhibitor-Business-Id")?.trim();

  const selection = resolveActiveBusinessSelection(viewIds, requestedBusinessId);
  if ("error" in selection) return res.status(selection.status).json({ error: selection.error });

  const selectedBusinessId = selection.businessId;
  const business = selectedBusinessId
    ? await prisma.$transaction(async (tx) => {
        // Serialize the profile read against membership revocation, role
        // changes, and business suspension using the same parent-row lock
        // acquired by exhibitor membership mutation routes.
        if (!isPlatformAdmin(req.user!)) {
          await tx.$queryRaw`SELECT "id" FROM "exhibitor_businesses" WHERE "id" = ${selectedBusinessId} FOR UPDATE`;
          const membership = await tx.exhibitorMembership.findFirst({
            where: {
              exhibitorBusinessId: selectedBusinessId,
              userId: req.user!.id,
              status: "active",
              business: { suspended: false },
            },
            select: { role: true },
          });
          if (!membership || !can(exhibitorRoleToRole(membership.role), "exhibitorBusiness:view")) {
            return null;
          }

          const currentBusiness = await tx.exhibitorBusiness.findUnique({ where: { id: selectedBusinessId } });
          if (!currentBusiness) return null;

          if (!can(exhibitorRoleToRole(membership.role), "exhibitorBusiness:manage")) {
            for (const field of BANK_AND_TAX_FIELDS) {
              (currentBusiness as Record<string, unknown>)[field] = null;
            }
          }
          return currentBusiness;
        }

        return tx.exhibitorBusiness.findUnique({ where: { id: selectedBusinessId } });
      })
    : null;

  res.json({ business });
});

const optionalTrimmedText = (max: number) => z.string().trim().max(max).optional();
const optionalIndiaIdentifier = (max: number, pattern: RegExp, label: string) =>
  z.string().trim().max(max).refine((value) => value === "" || pattern.test(value), {
    message: `Invalid ${label} format`,
  }).optional();

const upsertSchema = z.object({
  companyName: optionalTrimmedText(160),
  businessType: optionalTrimmedText(80),
  address: optionalTrimmedText(1000),
  gst: optionalIndiaIdentifier(15, /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i, "GSTIN"),
  pan: optionalIndiaIdentifier(10, /^[A-Z]{5}[0-9]{4}[A-Z]$/i, "PAN"),
  website: httpUrlOrEmpty(500).optional(),
  brandPrimaryColor: optionalTrimmedText(20),
  brandSecondaryColor: optionalTrimmedText(20),
  bankAccountName: optionalTrimmedText(100),
  bankAccountNumber: optionalIndiaIdentifier(18, /^[0-9]{6,18}$/, "bank account number"),
  bankIfsc: optionalIndiaIdentifier(11, /^[A-Z]{4}0[A-Z0-9]{6}$/i, "IFSC"),
  taxCategory: optionalTrimmedText(40),
  invoicePreference: optionalTrimmedText(40),
});

router.put("/", eventMutationRateLimit, async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const resolved = await resolveManageableBusinessId(req.user!, req.get("X-Exhibitor-Business-Id")?.trim());
  if ("error" in resolved) return res.status(resolved.status).json({ error: resolved.error });
  try {
    const business = await updateBusinessForManager(req.user!, resolved.businessId, parsed.data);
    res.json({ business });
  } catch (error) {
    if (error instanceof Error && error.message === "Business management permission changed; refresh and try again") {
      return res.status(403).json({ error: error.message });
    }
    throw error;
  }
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
    business = await updateBusinessForManager(req.user!, businessId, { logoUrl });
  } catch (error) {
    await deleteStoredFile(privateStoredFileReference("business-logos", req.file.filename)).catch((cleanupError) => {
      console.error("Failed to clean up rejected exhibitor business logo upload:", cleanupError);
    });
    if (error instanceof Error && error.message === "Business management permission changed; refresh and try again") {
      return res.status(403).json({ error: error.message });
    }
    throw error;
  }
  // The database now references this file. Do not remove it if response work
  // fails after persistence.
  res.json({ business });
});

export default router;
