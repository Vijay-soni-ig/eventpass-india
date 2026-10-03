import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import { test, before, after, beforeEach } from "node:test";
import { deleteStoredFile, getStoredObject, privateStoredFileReference, putStoredFile, signSigV4 } from "../src/lib/storage";

const EMPTY_HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const AWS_EXAMPLE_KEY = { accessKeyId: "AKIAIOSFODNN7EXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" };

// The two worked examples in AWS's "Signature Calculations for the Authorization Header" documentation
// for S3 (GET Object with a Range header, and PUT Object). They are published by AWS, so matching them
// shows the signing code agrees with S3 itself rather than only with itself.
test("signing matches AWS's documented GET Object example", () => {
  const { signature, authorization } = signSigV4({
    method: "GET",
    host: "examplebucket.s3.amazonaws.com",
    uri: "/test.txt",
    headers: { range: "bytes=0-9", "x-amz-content-sha256": EMPTY_HASH, "x-amz-date": "20130524T000000Z" },
    payloadHash: EMPTY_HASH,
    amzDate: "20130524T000000Z",
    region: "us-east-1",
    ...AWS_EXAMPLE_KEY,
  });
  assert.equal(signature, "f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41");
  assert.equal(
    authorization,
    "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
  );
});

test("signing matches AWS's documented PUT Object example", () => {
  const payloadHash = crypto.createHash("sha256").update("Welcome to Amazon S3.").digest("hex");
  assert.equal(payloadHash, "44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072");
  const { signature } = signSigV4({
    method: "PUT",
    host: "examplebucket.s3.amazonaws.com",
    uri: "/test%24file.text",
    headers: {
      date: "Fri, 24 May 2013 00:00:00 GMT",
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": "20130524T000000Z",
      "x-amz-storage-class": "REDUCED_REDUNDANCY",
    },
    payloadHash,
    amzDate: "20130524T000000Z",
    region: "us-east-1",
    ...AWS_EXAMPLE_KEY,
  });
  assert.equal(signature, "98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd");
});

// ---- a stand-in S3 endpoint that checks every request the way S3 would ----

type Received = { method: string; url: string; body: Buffer; headers: http.IncomingHttpHeaders; signatureValid: boolean };

const REGION = "us-east-1";
const BUCKET = "exhibittix-test";
const ACCESS = { accessKeyId: "TESTACCESSKEY", secretAccessKey: "test/secret+key" };
const objects = new Map<string, { body: Buffer; contentType: string }>();
let received: Received[] = [];
let script: Array<"ok" | "unavailable" | "forbidden" | "hang"> = [];
let server: http.Server;
let endpoint: string;

function verifySignature(req: http.IncomingMessage, body: Buffer): boolean {
  const authorization = String(req.headers.authorization ?? "");
  const match = /^AWS4-HMAC-SHA256 Credential=([^/]+)\/(\d{8})\/([^/]+)\/s3\/aws4_request, SignedHeaders=([^,]+), Signature=([0-9a-f]{64})$/.exec(authorization);
  if (!match) return false;
  const [, accessKeyId, , region, signedHeaders, signature] = match;
  if (accessKeyId !== ACCESS.accessKeyId || region !== REGION) return false;
  const headers: Record<string, string> = {};
  for (const name of signedHeaders.split(";")) {
    if (name !== "host") headers[name] = String(req.headers[name] ?? "");
  }
  const payloadHash = crypto.createHash("sha256").update(body).digest("hex");
  // S3 rejects a request whose declared payload hash is not the hash of the bytes it received.
  if (req.headers["x-amz-content-sha256"] !== payloadHash) return false;
  const expected = signSigV4({
    method: req.method ?? "",
    host: String(req.headers.host),
    uri: (req.url ?? "").split("?")[0],
    headers,
    payloadHash,
    amzDate: String(req.headers["x-amz-date"]),
    region,
    ...ACCESS,
  });
  return expected.signature === signature;
}

before(async () => {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      received.push({ method: req.method ?? "", url: req.url ?? "", body, headers: req.headers, signatureValid: verifySignature(req, body) });
      const step = script.shift() ?? "ok";
      if (step === "hang") return; // never answers
      if (step === "unavailable") return void res.writeHead(503).end("slow down");
      if (step === "forbidden" || !received[received.length - 1].signatureValid) return void res.writeHead(403).end("SignatureDoesNotMatch");

      const key = decodeURIComponent((req.url ?? "").replace(`/${BUCKET}/`, ""));
      if (req.method === "PUT") {
        objects.set(key, { body, contentType: String(req.headers["content-type"]) });
        return void res.writeHead(200).end();
      }
      if (req.method === "GET") {
        const object = objects.get(key);
        if (!object) return void res.writeHead(404).end("NoSuchKey");
        return void res.writeHead(200, { "Content-Type": object.contentType }).end(object.body);
      }
      if (req.method === "DELETE") {
        objects.delete(key);
        return void res.writeHead(204).end();
      }
      res.writeHead(405).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

after(async () => {
  await new Promise<void>((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  });
});

beforeEach(() => {
  objects.clear();
  received = [];
  script = [];
  process.env.STORAGE_PROVIDER = "s3";
  process.env.STORAGE_S3_REGION = REGION;
  process.env.STORAGE_S3_BUCKET = BUCKET;
  process.env.STORAGE_S3_ACCESS_KEY_ID = ACCESS.accessKeyId;
  process.env.STORAGE_S3_SECRET_ACCESS_KEY = ACCESS.secretAccessKey;
  process.env.STORAGE_S3_ENDPOINT = endpoint;
  process.env.STORAGE_S3_TIMEOUT_MS = "400";
});

const FILE = "0f8fad5b-d9cb-469f-a165-70867728950e.png";
const BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

test("an upload, read and delete round-trip with correctly signed requests", async () => {
  await putStoredFile("organizer-logos", FILE, BYTES, "image/png");
  assert.equal(received.length, 1);
  assert.equal(received[0].method, "PUT");
  assert.equal(received[0].url, `/${BUCKET}/organizer-logos/${FILE}`);
  assert.equal(received[0].signatureValid, true, "S3 would accept this signature");
  assert.equal(received[0].headers["content-type"], "image/png");
  assert.deepEqual(received[0].body, BYTES);

  const read = await getStoredObject(`s3://${BUCKET}/organizer-logos/${FILE}`);
  assert.deepEqual(read.body, BYTES);
  assert.equal(read.contentType, "image/png");
  assert.equal(received[1].signatureValid, true);

  await deleteStoredFile(privateStoredFileReference("organizer-logos", FILE));
  assert.equal(received[2].method, "DELETE");
  assert.equal(received[2].signatureValid, true);
  assert.equal(objects.size, 0);
});

test("a rejected signature or missing object surfaces as an error, and deleting a missing object is fine", async () => {
  script = ["forbidden"];
  await assert.rejects(putStoredFile("organizer-logos", FILE, BYTES, "image/png"), /upload failed \(403\)/);
  assert.equal(received.length, 1, "a 403 is not retried");

  await assert.rejects(getStoredObject(`s3://${BUCKET}/organizer-logos/${FILE}`), /read failed \(404\)/);
  await deleteStoredFile(`s3://${BUCKET}/organizer-logos/${FILE}`); // 204 for a key that is not there
  await assert.rejects(deleteStoredFile("s3://another-bucket/organizer-logos/x.png"), /bucket mismatch/);
});

test("a temporary 503 is retried once with a fresh request and then succeeds", async () => {
  script = ["unavailable", "ok"];
  await putStoredFile("organizer-logos", FILE, BYTES, "image/png");
  assert.equal(received.length, 2);
  assert.equal(received[1].signatureValid, true);
  assert.deepEqual(objects.get(`organizer-logos/${FILE}`)?.body, BYTES);
});

test("a storage service that keeps failing gives up after two attempts", async () => {
  script = ["unavailable", "unavailable"];
  await assert.rejects(putStoredFile("organizer-logos", FILE, BYTES, "image/png"), /upload failed \(503\)/);
  assert.equal(received.length, 2);
});

test("a storage service that never answers fails within the timeout instead of hanging", async () => {
  script = ["hang", "hang"];
  const started = Date.now();
  await assert.rejects(putStoredFile("organizer-logos", FILE, BYTES, "image/png"), /did not complete/);
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 3000, `took ${elapsed} ms`);
  assert.equal(received.length, 2, "tried twice");
});

test("an unreachable storage endpoint reports a clear error", async () => {
  process.env.STORAGE_S3_ENDPOINT = "http://127.0.0.1:1"; // nothing listens on port 1
  await assert.rejects(getStoredObject(`s3://${BUCKET}/organizer-logos/${FILE}`), /did not complete/);
});
