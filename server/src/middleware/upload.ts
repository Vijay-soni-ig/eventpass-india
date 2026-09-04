import multer from "multer";
import path from "path";
import fs from "fs";

function makeUploader(subfolder: string) {
  const dir = path.join(__dirname, "..", "..", "uploads", subfolder);
  fs.mkdirSync(dir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const userId = req.user?.id ?? "anon";
      cb(null, `${userId}-${Date.now()}${ext}`);
    },
  });

  return multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });
}

export const uploadLogo = makeUploader("business-logos");
export const uploadCover = makeUploader("exhibition-covers");
export const uploadFloorPlan = makeUploader("floor-plans");
export const uploadDocument = makeUploader("exhibitor-documents");

export function fileUrl(req: { protocol: string; get(name: string): string | undefined }, subfolder: string, filename: string) {
  return `${req.protocol}://${req.get("host")}/uploads/${subfolder}/${filename}`;
}
