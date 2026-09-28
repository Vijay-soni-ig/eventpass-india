import assert from "node:assert/strict";
import { test } from "node:test";
import { assertProductionStorageConfig } from "../src/lib/storage";

const storageEnvKeys = [
  "NODE_ENV",
  "STORAGE_PROVIDER",
  "STORAGE_S3_REGION",
  "STORAGE_S3_BUCKET",
  "STORAGE_S3_ACCESS_KEY_ID",
  "STORAGE_S3_SECRET_ACCESS_KEY",
  "STORAGE_S3_ENDPOINT",
  "STORAGE_PUBLIC_BASE_URL",
] as const;

function withStorageEnv(overrides: Partial<Record<(typeof storageEnvKeys)[number], string | undefined>>, fn: () => void) {
  const previous = new Map<string, string | undefined>();
  for (const key of storageEnvKeys) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    fn();
  } finally {
    for (const key of storageEnvKeys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("production storage rejects local filesystem storage", () => {
  withStorageEnv(
    { NODE_ENV: "production", STORAGE_PROVIDER: "local" },
    () => {
      assert.throws(
        () => assertProductionStorageConfig(),
        /STORAGE_PROVIDER=s3 is required in production/,
      );
    },
  );
});

test("production storage requires the complete S3 configuration", () => {
  withStorageEnv(
    {
      NODE_ENV: "production",
      STORAGE_PROVIDER: "s3",
      STORAGE_S3_REGION: "ap-south-1",
      STORAGE_S3_BUCKET: "exhibittix-test",
      STORAGE_S3_ACCESS_KEY_ID: undefined,
      STORAGE_S3_SECRET_ACCESS_KEY: undefined,
    },
    () => {
      assert.throws(
        () => assertProductionStorageConfig(),
        /Missing required storage configuration: STORAGE_S3_ACCESS_KEY_ID/,
      );
    },
  );
});

test("production storage accepts a complete S3 configuration without contacting the provider", () => {
  withStorageEnv(
    {
      NODE_ENV: "production",
      STORAGE_PROVIDER: "s3",
      STORAGE_S3_REGION: "ap-south-1",
      STORAGE_S3_BUCKET: "exhibittix-test",
      STORAGE_S3_ACCESS_KEY_ID: "test-access-key",
      STORAGE_S3_SECRET_ACCESS_KEY: "test-secret-key",
      STORAGE_S3_ENDPOINT: "https://s3.example.test",
      STORAGE_PUBLIC_BASE_URL: "https://cdn.example.test",
    },
    () => {
      const config = assertProductionStorageConfig();
      assert.deepEqual(config, {
        region: "ap-south-1",
        bucket: "exhibittix-test",
        accessKeyId: "test-access-key",
        secretAccessKey: "test-secret-key",
        endpoint: "https://s3.example.test",
      });
    },
  );
});
