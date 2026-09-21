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

test("production storage config requires complete S3 settings", () => {
  const previous = {
    nodeEnv: process.env.NODE_ENV,
    provider: process.env.STORAGE_PROVIDER,
    region: process.env.STORAGE_S3_REGION,
    bucket: process.env.STORAGE_S3_BUCKET,
    accessKey: process.env.STORAGE_S3_ACCESS_KEY_ID,
    secretKey: process.env.STORAGE_S3_SECRET_ACCESS_KEY,
  };
  try {
    process.env.NODE_ENV = "production";
    process.env.STORAGE_PROVIDER = "s3";
    delete process.env.STORAGE_S3_REGION;
    delete process.env.STORAGE_S3_BUCKET;
    delete process.env.STORAGE_S3_ACCESS_KEY_ID;
    delete process.env.STORAGE_S3_SECRET_ACCESS_KEY;
    assert.throws(() => assertProductionStorageConfig(), /STORAGE_S3_REGION/);

    process.env.STORAGE_S3_REGION = "ap-south-1";
    process.env.STORAGE_S3_BUCKET = "exhibittix-production";
    process.env.STORAGE_S3_ACCESS_KEY_ID = "test-access-key";
    process.env.STORAGE_S3_SECRET_ACCESS_KEY = "test-secret-key";
    assert.doesNotThrow(() => assertProductionStorageConfig());
  } finally {
    if (previous.nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous.nodeEnv;
    if (previous.provider === undefined) delete process.env.STORAGE_PROVIDER; else process.env.STORAGE_PROVIDER = previous.provider;
    if (previous.region === undefined) delete process.env.STORAGE_S3_REGION; else process.env.STORAGE_S3_REGION = previous.region;
    if (previous.bucket === undefined) delete process.env.STORAGE_S3_BUCKET; else process.env.STORAGE_S3_BUCKET = previous.bucket;
    if (previous.accessKey === undefined) delete process.env.STORAGE_S3_ACCESS_KEY_ID; else process.env.STORAGE_S3_ACCESS_KEY_ID = previous.accessKey;
    if (previous.secretKey === undefined) delete process.env.STORAGE_S3_SECRET_ACCESS_KEY; else process.env.STORAGE_S3_SECRET_ACCESS_KEY = previous.secretKey;
  }
});
