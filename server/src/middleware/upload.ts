import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import type { Request, Response, NextFunction, RequestHandler } from "express";

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
    filename: (_req, file, cb) => {
      const ext = allowedMimeExtensions[file.mimetype];
      cb(null, `${crypto.randomUUID()}${ext}`);
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

function hasBytes(buffer: Buffer, offset: number, bytes: number[]) {
  return bytes.every((byte, index) => buffer[offset + index] === byte);
}

function matchesDeclaredMime(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === "image/jpeg") return hasBytes(buffer, 0, [0xff, 0xd8, 0xff]);
  if (mimeType === "image/png") return hasBytes(buffer, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (mimeType === "image/webp") {
    return hasBytes(buffer, 0, [0x52, 0x49, 0x46, 0x46]) && hasBytes(buffer, 8, [0x57, 0x45, 0x42, 0x50]);
  }
  if (mimeType === "application/pdf") return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  return false;
}

/**
 * Wraps multer so rejected uploads resolve to a clean 4xx response and the
 * file's declared MIME type is also checked against its actual magic bytes.
 * This prevents simple MIME spoofing from bypassing the allowlist.
 */
export function handleUpload(uploader: multer.Multer, fieldName: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    uploader.single(fieldName)(req, res, (err: unknown) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          const message = err.code === "LIMIT_FILE_SIZE" ? "File is too large (max 5MB)" : "Upload rejected";
          return res.status(400).json({ error: message });
        }
        const message = err instanceof Error ? err.message : "Unsupported file type";
        return res.status(400).json({ error: message });
      }

      if (!req.file) return next();

      try {
        const filePath = req.file.path;
        const buffer = fs.readFileSync(filePath);
        if (!matchesDeclaredMime(buffer, req.file.mimetype)) {
          fs.rmSync(filePath, { force: true });
          return res.status(400).json({ error: "File content does not match the declared type" });
        }
        return next();
      } catch {
        if (req.file.path) fs.rmSync(req.file.path, { force: true });
        return res.status(400).json({ error: "Upload could not be validated" });
      }
    });
  };
}
