# ExhibitTix Production File Storage

## Current implementation

Uploads now pass through a storage adapter. Development/test environments continue to use the existing local filesystem path, while production startup fails closed unless `STORAGE_PROVIDER=s3` and the required S3-compatible credentials are configured. In S3 mode, validated uploads are written to temporary local storage only during request processing and then persisted to object storage; the production Docker Compose configuration no longer mounts an application upload volume.

## Production requirement

Before production launch, uploaded assets must move to durable object storage or an equivalent managed persistent file service. The selected provider must support:

- durable storage independent of the application host
- TLS in transit and encryption at rest
- private objects by default
- least-privilege application credentials
- lifecycle/retention controls
- versioning or an equivalent recovery mechanism for business-critical files
- operational monitoring and storage-capacity alerts
- documented backup/restore or provider-native durability guarantees

## Required application contract

The storage implementation must preserve the current security model:

1. Generate server-side object keys. Never use client filenames as object keys.
2. Validate MIME type and magic bytes before persistence.
3. Store an object key/provider identifier in the database rather than exposing filesystem paths.
4. Public assets may be delivered through a controlled public URL or CDN only where the product requires public visibility.
5. Exhibitor documents and other private assets must remain private and require authenticated, tenant-scoped access.
6. Deletes must remove or tombstone the object according to the provider retention policy and database lifecycle.
7. Storage credentials must come from the production secret manager and must never be committed to Git.

## Migration strategy

1. Provision the managed object-storage bucket/container.
2. Configure encryption, versioning, lifecycle rules, CORS, and least-privilege credentials.
3. Add a storage adapter and integration tests against an isolated bucket or local S3-compatible test service.
4. Migrate existing files using a checksum-verified batch process.
5. Update database records to provider object keys.
6. Verify public assets and private document authorization separately.
7. Keep the local-volume fallback only for development/test environments unless an explicit production exception is approved.
8. Remove the production dependency on the Docker host filesystem after migration verification.

## Verification status

**PARTIAL / BLOCKED FOR PRODUCTION:** the application-side object-storage adapter, production fail-closed configuration, public/private reference model, upload persistence path, private document retrieval, cleanup, and contract tests are implemented. A real durable-storage integration and migration drill are still blocked until a real S3-compatible bucket, credentials, encryption/versioning/lifecycle policy, and isolated production-like integration environment are provisioned.

The remaining production migration work is deliberately separate from this code PR: provision the bucket, configure least-privilege credentials and policies, run the checksum-verified migration for existing files, then verify public assets and private tenant-scoped documents end-to-end.