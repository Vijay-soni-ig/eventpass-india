import { Router } from "express";
import { getStoredObject, isPublicStorageKey, isS3Storage } from "../lib/storage";

const router = Router();

router.get("/public/:key(*)", async (req, res) => {
  const key = req.params.key;
  if (!isS3Storage() || !isPublicStorageKey(key) || key.includes("..") || key.startsWith("/")) {
    return res.status(404).json({ error: "Not found" });
  }

  try {
    const object = await getStoredObject(`s3://${process.env.STORAGE_S3_BUCKET}/${key}`);
    if (object.contentType) res.setHeader("Content-Type", object.contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.send(object.body);
  } catch {
    return res.status(404).json({ error: "Not found" });
  }
});

export default router;
