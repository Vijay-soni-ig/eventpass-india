# ExhibitTix — Production Object Storage Contract

## Purpose

ExhibitTix must not depend on container-local disk for production uploads. Production storage is S3-compatible object storage, while local filesystem storage remains available only for development.

The application already enforces this at startup: NODE_ENV=production requires STORAGE_PROVIDER=s3 and complete S3 credentials.

## Required production configuration

Set these values in the production secret/environment manager:

- STORAGE_PROVIDER=s3
- STORAGE_S3_REGION
- STORAGE_S3_BUCKET
- STORAGE_S3_ACCESS_KEY_ID
- STORAGE_S3_SECRET_ACCESS_KEY

Optional:

- STORAGE_S3_ENDPOINT for Cloudflare R2, MinIO, or another S3-compatible service.
- STORAGE_PUBLIC_BASE_URL when public assets should be served directly from a CDN/object-storage URL.

Never commit credentials or production .env files.

## Bucket layout

Application-generated keys use controlled prefixes:

- business-logos/
- exhibition-covers/
- floor-plans/
- organizer-logos/
- organizer-covers/
- organizer-gallery/
- exhibition-media/
- exhibitor-documents/ for private documents

Only the explicitly public prefixes are eligible for the public storage proxy. Exhibitor documents remain behind the authenticated document-download route.

## Security requirements

The production bucket should:

1. Use a dedicated ExhibitTix service identity, not a personal cloud account.
2. Block anonymous bucket writes.
3. Grant the application only the object operations it needs.
4. Encrypt objects at rest using the provider's managed encryption or an approved customer-managed key.
5. Keep private documents non-public.
6. Use HTTPS/TLS for all object-storage traffic.
7. Enable provider access/audit logging where available.
8. Configure lifecycle/retention rules only after confirming they do not remove active event assets.
9. Keep production and staging buckets separate.
10. Avoid putting secrets, payment data, or raw authentication credentials into uploaded files.

## Upload behavior

The API:

- accepts only the supported MIME types;
- limits uploads to 5 MB per request;
- checks file magic bytes against the declared MIME type;
- generates UUID-based filenames;
- writes to object storage before the request continues in S3 mode;
- removes temporary local files after successful persistence;
- fails the request if object-storage persistence fails.

This prevents a successful database record from being created when the object itself was not persisted.

## Public vs private assets

Public event/branding media can use fileUrl() and the configured public base URL or API storage proxy.

Private exhibitor documents must use privateStoredFileReference() and the authenticated /api/documents/:id/download endpoint. Do not expose s3:// references or private object keys to visitors.

## Provisioning checklist

Before calling production object storage ready:

- [ ] Production bucket created in the intended region.
- [ ] Dedicated service credentials created.
- [ ] Bucket write/read/delete permissions tested with the application identity.
- [ ] Public access disabled for private prefixes.
- [ ] Encryption enabled.
- [ ] HTTPS-only access enforced.
- [ ] Production and staging buckets are different.
- [ ] STORAGE_* values installed in the production secret manager.
- [ ] Application starts successfully with STORAGE_PROVIDER=s3.
- [ ] Upload a synthetic logo/image and verify it is retrievable.
- [ ] Upload a synthetic exhibitor PDF and verify authenticated download.
- [ ] Delete both test objects and verify deletion.
- [ ] Verify the database contains object-storage references rather than container-local /uploads URLs.
- [ ] Verify a container restart does not remove application assets.

## What is and is not complete

Repository readiness: implemented. The storage abstraction, S3-compatible upload/delete/read paths, production guard, private/public separation, and tests are in the codebase.

Infrastructure provisioning: external. The real production bucket, credentials, encryption/policy settings, and secret-manager values still have to be created and verified outside Git.

Do not mark P1-2 fully complete until the provisioning checklist has been executed against the real production environment.
