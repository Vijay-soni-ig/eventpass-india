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
  "participant-media-public",
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

export type SigV4Input = {
  method: string;
  /** Host header value, including a non-default port. */
  host: string;
  /** Already URI-encoded path, signed exactly as given (S3 does not double-encode). */
  uri: string;
  /** Headers to sign besides `host`, names in lower case. */
  headers: Record<string, string>;
  payloadHash: string;
  amzDate: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
};

/** AWS Signature Version 4 for S3: returns the Authorization header value and the signed header list. */
export function signSigV4(input: SigV4Input): { authorization: string; signedHeaders: string; signature: string } {
  const headers: Record<string, string> = { ...input.headers, host: input.host };
  const names = Object.keys(headers).sort();
  const signedHeaders = names.join(";");
  const canonicalHeaders = names.map((name) => `${name}:${headers[name].trim()}\n`).join("");
  const canonicalRequest = [input.method, input.uri, "", canonicalHeaders, signedHeaders, input.payloadHash].join("\n");
  const date = input.amzDate.slice(0, 8);
  const credentialScope = `${date}/${input.region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", input.amzDate, credentialScope, sha256(canonicalRequest)].join("\n");
  const signature = crypto.createHmac("sha256", signingKey(input.secretAccessKey, date, input.region)).update(stringToSign).digest("hex");
  return {
    authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    signedHeaders,
    signature,
  };
}

function signedRequest(method: string, key: string, payload: Buffer | null, contentType?: string) {
  const config = s3Config();
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const uri = `/${encodeURIComponent(config.bucket)}/${encodeKey(key)}`;
  const host = new URL(config.endpoint).host;
  const headers: Record<string, string> = {
    "x-amz-content-sha256": payload ? sha256(payload) : sha256(""),
    "x-amz-date": amzDate,
  };
  if (contentType) headers["content-type"] = contentType;

  const { authorization } = signSigV4({
    method,
    host,
    uri,
    headers,
    payloadHash: headers["x-amz-content-sha256"],
    amzDate,
    region: config.region,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  });
  return { url: `${config.endpoint}${uri}`, headers: { ...headers, host, Authorization: authorization } };
}

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

function requestTimeoutMs(): number {
  const configured = Number(process.env.STORAGE_S3_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_REQUEST_TIMEOUT_MS;
}

/**
 * Sends one signed request with a timeout, and retries once if the storage service fails to answer or
 * answers 5xx. Uploads, reads and deletes of one fixed key are all safe to repeat. Without a timeout a
 * stalled storage endpoint would leave every upload waiting forever.
 */
async function sendSigned(method: string, key: string, payload: Buffer | null, contentType?: string): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    // Sign again on a retry: the signature carries a timestamp that S3 only accepts for a few minutes.
    const request = signedRequest(method, key, payload, contentType);
    try {
      const response = await fetch(request.url, {
        method,
        headers: request.headers,
        body: payload ?? undefined,
        signal: AbortSignal.timeout(requestTimeoutMs()),
      });
      if (response.status < 500 || attempt === 2) return response;
      await response.arrayBuffer().catch(() => undefined);
    } catch (error) {
      lastError = error;
      if (attempt === 2) throw new Error(`Object storage ${method.toLowerCase()} did not complete: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Object storage request failed");
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
  const response = await sendSigned("PUT", key, data, contentType);
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
    const response = await sendSigned("DELETE", key, null);
    if (!response.ok && response.status !== 404) throw new Error(`Object storage delete failed (${response.status})`);
    return;
  }

  try {
    if (reference.startsWith("local://")) {
      const relative = reference.slice("local://".length);
      const root = path.resolve(__dirname, "..", "..", "uploads");
      const filePath = path.resolve(root, relative);
      if (!filePath.startsWith(`${root}${path.sep}`)) throw new Error("Invalid storage path");
      await fs.promises.rm(filePath, { force: true });
      return;
    }
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
    // Local uploads are served through the same browser origin in development.
    // Returning a relative URL avoids persisting an unreachable `localhost:4000`
    // or internal proxy host when the API is accessed through Codespaces/Vite.
    return `/uploads/${key}`;
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
    let relative: string;
    if (referenceOrKey.startsWith("local://")) {
      relative = referenceOrKey.slice("local://".length);
    } else {
      const parsed = new URL(referenceOrKey);
      const parts = parsed.pathname.split("/").filter(Boolean);
      const uploadsIndex = parts.indexOf("uploads");
      if (uploadsIndex < 0) throw new Error("Invalid local storage reference");
      relative = parts.slice(uploadsIndex + 1).join("/");
    }
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
  const response = await sendSigned("GET", key, null);
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
