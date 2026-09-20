import assert from "node:assert/strict";
import test from "node:test";
import {
  assertProductionStorageConfig,
  isPublicStorageKey,
  privateStoredFileReference,
  storageKey,
} from "../src/lib/storage";

test("storage keys are server-generated and constrained", () => {
  assert.equal(storageKey("organizer-gallery", "550e8400-e29b-41d4-a716-446655440000.jpg"), "organizer-gallery/550e8400-e29b-41d4-a716-446655440000.jpg");
  assert.throws(() => storageKey("../unsafe", "550e8400-e29b-41d4-a716-446655440000.jpg"));
  assert.throws(() => storageKey("organizer-gallery", "../unsafe.jpg"));
});

test("only explicitly public folders can use the public object proxy", () => {
  assert.equal(isPublicStorageKey("organizer-gallery/file.jpg"), true);
  assert.equal(isPublicStorageKey("exhibition-media/file.jpg"), true);
  assert.equal(isPublicStorageKey("exhibitor-documents/file.pdf"), false);
});

test("production rejects local storage configuration", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousProvider = process.env.STORAGE_PROVIDER;
  try {
    process.env.NODE_ENV = "production";
    process.env.STORAGE_PROVIDER = "local";
    assert.throws(() => assertProductionStorageConfig(), /STORAGE_PROVIDER=s3/);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousProvider === undefined) delete process.env.STORAGE_PROVIDER;
    else process.env.STORAGE_PROVIDER = previousProvider;
  }
});

test("private references never become public asset URLs", () => {
  const previousProvider = process.env.STORAGE_PROVIDER;
  try {
    process.env.STORAGE_PROVIDER = "local";
    assert.equal(privateStoredFileReference("exhibitor-documents", "550e8400-e29b-41d4-a716-446655440000.pdf"), "local://exhibitor-documents/550e8400-e29b-41d4-a716-446655440000.pdf");
  } finally {
    if (previousProvider === undefined) delete process.env.STORAGE_PROVIDER;
    else process.env.STORAGE_PROVIDER = previousProvider;
  }
});
