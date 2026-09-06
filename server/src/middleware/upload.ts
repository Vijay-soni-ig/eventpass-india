import multer from "multer";
import path from "path";
import fs from "fs";
import type { Request, Response, NextFunction, RequestHandler } from "express";

// Extension is derived from the verified MIME type, never from the
// attacker-controlled originalname — this closes the stored-XSS path where
// a file named "x.html"/"x.svg" would otherwise be written and later served
// by express.static with a script-executing Content-Type.
const IMAGE_MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const DOCUMENT_MIME_EXTENSIONS: Record<string, string> = {
  ...IMAGE_MIME_EXTENSIONS,
  "application/pdf": ".pdf",
};

function makeUploader(subfolder: string, allowedMimeExtensions: Record<string, string>) {
  const dir = path.join(__dirname, "..", "..", "uploads", subfolder);
  fs.mkdirSync(dir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dir),
    filename: (req, file, cb) => {
      const ext = allowedMimeExtensions[file.mimetype];
      const userId = req.user?.id ?? "anon";
      cb(null, `${userId}-${Date.now()}${ext}`);
    },
  });

  return multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (!allowedMimeExtensions[file.mimetype]) {
        cb(new Error("Unsupported file type"));
        return;
      }
      cb(null, true);
    },
  });
}

export const uploadLogo = makeUploader("business-logos", IMAGE_MIME_EXTENSIONS);
export const uploadCover = makeUploader("exhibition-covers", IMAGE_MIME_EXTENSIONS);
export const uploadFloorPlan = makeUploader("floor-plans", IMAGE_MIME_EXTENSIONS);
export const uploadDocument = makeUploader("exhibitor-documents", DOCUMENT_MIME_EXTENSIONS);
export const uploadOrganizerLogo = makeUploader("organizer-logos", IMAGE_MIME_EXTENSIONS);
export const uploadOrganizerCover = makeUploader("organizer-covers", IMAGE_MIME_EXTENSIONS);
export const uploadGalleryImage = makeUploader("organizer-gallery", IMAGE_MIME_EXTENSIONS);
export const uploadExhibitionMedia = makeUploader("exhibition-media", IMAGE_MIME_EXTENSIONS);

export function fileUrl(req: { protocol: string; get(name: string): string | undefined }, subfolder: string, filename: string) {
  return `${req.protocol}://${req.get("host")}/uploads/${subfolder}/${filename}`;
}

/**
 * Phase 21C (P2-4 fix): wraps a multer single-file middleware so a rejected
 * upload (unsupported file type, file too large) resolves to a clean 4xx
 * with a real, useful reason — never the generic 500 the global error
 * handler would otherwise flatten every 4xx-with-no-`.status` error into
 * (see app.ts). Handled entirely at the route boundary rather than by
 * attaching a `.status` to the fileFilter's Error and relying on the global
 * handler, so this can return the actual validation reason (a legitimate,
 * non-sensitive message — never a stack trace or internal detail) instead
 * of that handler's deliberately generic "Invalid request".
 */
export function handleUpload(uploader: multer.Multer, fieldName: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    uploader.single(fieldName)(req, res, (err: unknown) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        const message = err.code === "LIMIT_FILE_SIZE" ? "File is too large (max 5MB)" : "Upload rejected";
        return res.status(400).json({ error: message });
      }
      const message = err instanceof Error ? err.message : "Unsupported file type";
      return res.status(400).json({ error: message });
    });
  };
}
