import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import type multer from "multer";
import { handleUpload } from "../src/middleware/upload";

function runUploadError(error: Error) {
  let statusCode = 0;
  let payload: unknown;
  let nextCalled = false;
  const response = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(body: unknown) {
      payload = body;
      return this;
    },
  } as unknown as Response;

  const uploader = {
    single: () => (_req: Request, _res: Response, callback: (err?: unknown) => void) => callback(error),
  } as unknown as multer.Multer;

  const middleware = handleUpload(uploader, "file");
  middleware({} as Request, response, (() => { nextCalled = true; }) as never);

  return { statusCode, payload, nextCalled };
}

test("unexpected upload middleware errors do not disclose internal paths or provider details", () => {
  const result = runUploadError(new Error("EACCES: permission denied, open '/srv/exhibittix/uploads/private.pdf'"));
  assert.equal(result.statusCode, 400);
  assert.deepEqual(result.payload, { error: "Upload rejected" });
  assert.equal(result.nextCalled, false);
});

test("unsupported file type keeps its safe validation message", () => {
  const result = runUploadError(new Error("Unsupported file type"));
  assert.equal(result.statusCode, 400);
  assert.deepEqual(result.payload, { error: "Unsupported file type" });
  assert.equal(result.nextCalled, false);
});
