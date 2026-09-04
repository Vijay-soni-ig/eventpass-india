import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireExhibitorBusinessAccess } from "../middleware/auth";
import { uploadDocument, fileUrl } from "../middleware/upload";
import { exhibitorBusinessIdsWithPermission } from "../lib/access";

const router = Router();

router.use(requireAuth, requireExhibitorBusinessAccess);

router.get("/", async (req, res) => {
  const businessIds = await exhibitorBusinessIdsWithPermission(req.user!, "document:view");
  const documents = businessIds.length
    ? await prisma.document.findMany({
        where: { exhibitorBusinessId: { in: businessIds } },
        orderBy: { createdAt: "desc" },
      })
    : [];
  res.json({ documents });
});

router.post("/", uploadDocument.single("file"), async (req, res) => {
  const businessIds = await exhibitorBusinessIdsWithPermission(req.user!, "document:manage");
  if (businessIds.length === 0) {
    return res.status(403).json({ error: "You do not have permission to upload documents" });
  }
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const name = (req.body.name as string | undefined)?.trim() || req.file.originalname;
  const fileUrlValue = fileUrl(req, "exhibitor-documents", req.file.filename);
  const document = await prisma.document.create({
    data: {
      exhibitorBusinessId: businessIds[0],
      uploadedByUserId: req.user!.id,
      name,
      fileUrl: fileUrlValue,
    },
  });
  res.status(201).json({ document });
});

router.delete("/:id", async (req, res) => {
  const businessIds = await exhibitorBusinessIdsWithPermission(req.user!, "document:manage");
  const document = businessIds.length
    ? await prisma.document.findFirst({ where: { id: req.params.id, exhibitorBusinessId: { in: businessIds } } })
    : null;
  if (!document) return res.status(404).json({ error: "Document not found" });

  await prisma.document.delete({ where: { id: document.id } });
  res.status(204).end();
});

export default router;
