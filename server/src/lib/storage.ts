import crypto from "crypto";
import fs from "fs";
import path from "path";
import { URL } from "url";

export type StorageProvider = "local" | "s3";

const PUBLIC_SUBFOLDERS = new Set([
  "business-logos",
  "exhibition-covers",
  "floor-plans",
  "organizer-logos",
  "organizer-covers",
  "organizer-gallery",
  "exhibition-media",
]);

function provider(): StorageProvider {
  const configured = process.env.STORAGE_PROVIDER?.trim().toLowerCase();
  if (configured === "s3") return "s3";
  return "local";
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required storage configuration: ${name}`);
  return value;
}

function s3Config() {
  const region = required("STORAGE_S3_REGION");
  const bucket = required("STORAGE_S3_BUCKET");
  const accessKeyId = required("STORAGE_S3_ACCESS_KEY_ID");
  const secretAccessKey = required("STORAGE_S3_SECRET_ACCESS_KEY");
  const endpoint = (process.env.STORAGE_S3_ENDPOINT?.trim() || `https://s3.${region}.amazonaws.com`).replace(/\/$/, "");
  return { region, bucket, accessKeyId, secretAccessKey, endpoint };
}

export function assertProductionStorageConfig() {
  if (process.env.NODE_ENV !== "production") return;
  if (provider() !== "s3") {
    throw new Error("STORAGE_PROVIDER=s3 is required in production; local filesystem storage is not production-safe");
  }
  const config = s3Config();
  if (!process.env.STORAGE_PUBLIC_BASE_URL?.trim()) {
    console.warn("STORAGE_PUBLIC_BASE_URL is not configured; public assets will be served through the API storage proxy");
  }
  return config;
}

function encodeKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac("sha256", key).update(data).digest();
}

function sha256(data: Buffer | string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function signingKey(secret: string, date: string, region: string): Buffer {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, date), region), "s3"), "aws4_request");
}

function signedRequest(method: string, key: string, payload: Buffer | null, contentType?: string) {
  const config = s3Config();
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const uri = `/${encodeURIComponent(config.bucket)}/${encodeKey(key)}`;
  const host = new URL(config.endpoint).host;
  const payloadHash = payload ? sha256(payload) : sha256("");
  const headers: Record<string, string> = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (contentType) headers["content-type"] = contentType;

  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers).sort().map((name) => `${name}:${headers[name].trim()}\n`).join("");
  const canonicalRequest = [
    method,
    uri,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const credentialScope = `${date}/${config.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");
  const signature = crypto.createHmac("sha256", signingKey(config.secretAccessKey, date, config.region))
    .update(stringToSign)
    .digest("hex");

  return {
    url: `${config.endpoint}${uri}`,
    headers: {
      ...headers,
      Authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

function objectKey(subfolder: string, filename: string): string {
  if (!/^[a-z0-9-]+$/.test(subfolder)) throw new Error("Invalid storage subfolder");
  if (!/^[a-f0-9-]+\.(jpg|png|webp|pdf)$/.test(filename)) throw new Error("Invalid storage filename");
  return `${subfolder}/${filename}`;
}

export function storageKey(subfolder: string, filename: string): string {
  return objectKey(subfolder, filename);
}

export function isS3Storage(): boolean {
  return provider() === "s3";
}

export async function putStoredFile(subfolder: string, filename: string, data: Buffer, contentType: string) {
  if (provider() === "local") return;
  const key = objectKey(subfolder, filename);
  const request = signedRequest("PUT", key, data, contentType);
  const response = await fetch(request.url, { method: "PUT", headers: request.headers, body: data });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Object storage upload failed (${response.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
}

export async function deleteStoredFile(reference: string): Promise<void> {
  if (reference.startsWith("s3://")) {
    const withoutScheme = reference.slice("s3://".length);
    const slash = withoutScheme.indexOf("/");
    if (slash <= 0) throw new Error("Invalid S3 storage reference");
    const config = s3Config();
    if (withoutScheme.slice(0, slash) !== config.bucket) throw new Error("Storage bucket mismatch");
    const key = withoutScheme.slice(slash + 1);
    const request = signedRequest("DELETE", key, null);
    const response = await fetch(request.url, { method: "DELETE", headers: request.headers });
    if (!response.ok && response.status !== 404) throw new Error(`Object storage delete failed (${response.status})`);
    return;
  }

  try {
    const parsed = new URL(reference);
    const filename = path.basename(parsed.pathname);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const uploadsIndex = parts.indexOf("uploads");
    if (uploadsIndex >= 0) {
      const relative = parts.slice(uploadsIndex + 1).join("/");
      const filePath = path.join(__dirname, "..", "..", "uploads", relative);
      await fs.promises.rm(filePath, { force: true });
      void filename;
    }
  } catch {
    // Deletion is intentionally idempotent for legacy/local references.
  }
}

export function storedFileReference(req: { protocol: string; get(name: string): string | undefined }, subfolder: string, filename: string): string {
  const key = objectKey(subfolder, filename);
  if (provider() === "local") {
    return `${req.protocol}://${req.get("host")}/uploads/${key}`;
  }
  const publicBase = process.env.STORAGE_PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
  if (publicBase) return `${publicBase}/${key.split("/").map(encodeURIComponent).join("/")}`;
  return `${req.protocol}://${req.get("host")}/api/storage/public/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export function privateStoredFileReference(subfolder: string, filename: string): string {
  const key = objectKey(subfolder, filename);
  if (provider() === "local") return `local://${key}`;
  return `s3://${s3Config().bucket}/${key}`;
}

export async function getStoredObject(referenceOrKey: string): Promise<{ body: Buffer; contentType?: string }> {
  if (provider() === "local") {
    const key = referenceOrKey.startsWith("storage://") ? "" : referenceOrKey;
    if (!key) throw new Error("Local storage does not support storage references");
    const parsed = new URL(key);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const uploadsIndex = parts.indexOf("uploads");
    if (uploadsIndex < 0) throw new Error("Invalid local storage reference");
    const relative = parts.slice(uploadsIndex + 1).join("/");
    const root = path.resolve(__dirname, "..", "..", "uploads");
    const filePath = path.resolve(root, relative);
    if (!filePath.startsWith(`${root}${path.sep}`)) throw new Error("Invalid storage path");
    return { body: await fs.promises.readFile(filePath) };
  }

  let key = referenceOrKey;
  if (key.startsWith("s3://")) {
    const value = key.slice("s3://".length);
    const slash = value.indexOf("/");
    if (slash <= 0) throw new Error("Invalid S3 storage reference");
    const config = s3Config();
    if (value.slice(0, slash) !== config.bucket) throw new Error("Storage bucket mismatch");
    key = value.slice(slash + 1);
  }
  const request = signedRequest("GET", key, null);
  const response = await fetch(request.url, { method: "GET", headers: request.headers });
  if (!response.ok) throw new Error(`Object storage read failed (${response.status})`);
  return {
    body: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") ?? undefined,
  };
}

export function isPublicStorageKey(key: string): boolean {
  const first = key.split("/")[0];
  return PUBLIC_SUBFOLDERS.has(first);
}
