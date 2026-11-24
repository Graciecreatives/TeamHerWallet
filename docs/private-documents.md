# Private paid PDF products

## Interfaces

- `POST /api/uploads/document`: signed-in creator cookie required, multipart field `document`, PDF signature checked, maximum 20 MiB. Returns `{ key, name, size, receipt }`. The receipt HMAC binds all metadata to the creator. Never expose the Worker secret.
- `POST /api/courses`: adds `productType: 'class' | 'pdf' | 'bundle'` and `document` containing the upload response for PDF/bundle. Existing course fields remain required. Class remains the default. Publishing verifies the receipt and strips it before storage.
- Public course responses include `productType` and `document: { name, size } | null`. They never contain R2 keys, receipts, or a download URL.
- `GET /api/courses/:id/document`: `Authorization: Bearer <existing paid access token>` required. Token must belong to this exact course. Streams the private PDF as an attachment. No token query parameters accepted and no new payment flow is introduced.
- Existing x402 `/access` settlement and entitlement issuance are unchanged. Download does not accept payment signatures or wallet addresses as authorization.

## Storage and rollout

Apply D1 migration `0007_documents.sql` with normal migration tooling. Create `learnpurse-private-documents` as a **private** R2 bucket, with r2.dev access disabled and no public custom domain. The image Worker now needs its `DOCUMENTS` binding to that bucket, separate from public covers in `IMAGES`. Do not place PDF objects in the covers bucket.

The Nuxt server uses existing `imageUploadUrl` and `imageUploadSecret` server-only settings. The Worker requires its existing `UPLOAD_SECRET` for every PDF upload/read, including HEAD. Authorized PDF responses use `private, no-store` and have no public CORS header. Public cover behavior is unchanged.

An upload alone does not publish or grant paid access. Unused uploads remain private and may be cleaned up operationally. Rotating the storage secret invalidates unpublished upload receipts, requiring creators to re-upload. Existing published metadata and paid access tokens remain usable.
