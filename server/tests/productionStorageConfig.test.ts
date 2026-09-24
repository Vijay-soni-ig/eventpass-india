import assert from "node:assert/strict";
import test from "node:test";

import { assertProductionStorageConfig } from "../src/lib/storage";

const storageEnvKeys = [
  "STORAGE_PROVIDER",
  "STORAGE_S3_REGION",
  "STORAGE_S3_BUCKET",
  "STORAGE_S3_ACCESS_KEY_ID",
  "STORAGE_S3_SECRET_ACCESS_KEY",
  "STORAGE_PUBLIC_BASE_URL",
] as const;

function withProductionEnv(overrides: Record<string, string | undefined>, run: () => void) {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousValues = Object.fromEntries(storageEnvKeys.map((key) => [key, process.env[key]]));

  process.env.NODE_ENV = "production";
  for (const key of storageEnvKeys) delete process.env[key];
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    run();
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    for (const key of storageEnvKeys) {
      const value = previousValues[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("production rejects local filesystem storage", () => {
  withProductionEnv({ STORAGE_PROVIDER: "local" }, () => {
    assert.throws(
      () => assertProductionStorageConfig(),
      /STORAGE_PROVIDER=s3 is required in production/,
    );
  });
});

test("production requires all S3 credentials", () => {
  withProductionEnv({ STORAGE_PROVIDER: "s3" }, () => {
    assert.throws(
      () => assertProductionStorageConfig(),
      /Missing required storage configuration: STORAGE_S3_REGION/,
    );
  });
});

test("production accepts a complete S3 storage configuration", () => {
  withProductionEnv(
    {
      STORAGE_PROVIDER: "s3",
      STORAGE_S3_REGION: "ap-south-1",
      STORAGE_S3_BUCKET: "exhibittix-production",
      STORAGE_S3_ACCESS_KEY_ID: "test-access-key",
      STORAGE_S3_SECRET_ACCESS_KEY: "test-secret-key",
      STORAGE_PUBLIC_BASE_URL: "https://cdn.example.com",
    },
    () => {
      const config = assertProductionStorageConfig();
      assert.deepEqual(config, {
        region: "ap-south-1",
        bucket: "exhibittix-production",
        accessKeyId: "test-access-key",
        secretAccessKey: "test-secret-key",
        endpoint: "https://s3.ap-south-1.amazonaws.com",
      });
    },
  );
});
