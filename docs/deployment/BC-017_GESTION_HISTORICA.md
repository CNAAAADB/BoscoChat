# BC-017 — Gestión histórica (MVP annual archive)

## Product scope

The public-facing label is **Gestión histórica**, visible only to an authenticated `administrator` or `documentary_manager`. This is separate from administrator user management.

This iteration supports the 92 known annual volumes of **Don Bosco en España** and recognizes new PDFs named `Don Bosco en España_YYYY.pdf` (1922–2100). The existing ingestion worker recognizes this exact convention. More publication families, descriptive metadata (authors/sections) and OCR correction require a subsequent catalog and SRS decision; they are not silently accepted as searchable.

### User flow

1. An authorized user opens **Gestión histórica** in the navigation.
2. A private S3 list displays filenames, year, original file size and SQL-backed indexing status/page count. A filename/year filter runs locally.
3. The user selects a PDF (max 350 MiB). Backend validates basename and byte count, checks S3 for an existing annual and returns a **five-minute** S3 POST policy limited to the exact object key, `application/pdf`, size range and SSE-S3. Browser sends PDF **directly** to the private bucket without passing a giant payload through API Gateway.
4. S3 Object Created -> EventBridge -> SQS -> existing ingestor. The user refreshes the management list to see indexing state.
5. For original downloads, a server-side authenticated role check, S3 object lookup and **60-second** SigV4 GET link allow managers to retrieve the source original. **This is an explicit privileged administrative download, not the public viewer.** The protected reader page image workflow remains unchanged.

### Security controls and known limitations

- Each endpoint independently uses `requireAuthorization(authService, {administrator, documentary_manager})`. A Free/Pro/Premium account gets 403, anonymous 401.
- No S3 objects are made public; Block Public Access remains enabled. Download links expire, but an authorized recipient can pass a live signed URL to another party until expiry. Do not log URLs.
- Exact filename validation prevents arbitrary S3 keys or path traversal; 350-MiB maximum is checked by the backend and the precise body Content-Length is signed. Worker verifies PDF format with Poppler on indexing.
- The API rejects issuing an upload permission for a year that already exists. S3 enforces atomic no-overwrite through the signed `If-None-Match: *` PUT request. Simultaneous writes to the same year must return HTTP 412 or 409 for one party; test this against real S3 before release.
- **Security release gate:** verify AWS-signed POST/GET on real S3 with a small synthetic PDF in a designated non-conflicting year; upload/delete test object only with appropriate approval and avoid overwriting historical originals. Confirm S3 CORS, IAM, audit/retention and anti-malware scanning policy. Independent FULL security review must be recorded before treating BC-017 as DONE.
- Existing originals remain private and untouched by this feature. No new schema migration is needed.

## AWS runtime requirements

Backend execution role `boscochat-backend-role-yvarjgvz`:

- `s3:ListBucket` on bucket `boscochat-archivo-pdfs` constrained by `s3:prefix=originals/*`
- `s3:GetObject`, `s3:PutObject` on `arn:aws:s3:::boscochat-archivo-pdfs/originals/*`
- Existing access to the RDS archive status tables.
- The Lambda execution environment already supplies temporary IAM credentials for signing; no static AWS key is required.

S3 CORS must allow the three actual hosting origins (`boscochat.com`, `www.boscochat.com`, default Amplify hostname), `PUT` uploads and `ETag` exposure. The bucket must remain blocked from public access. Confirm EventBridge notification is enabled.

**Release gates:** backend `HISTORICAL_MANAGEMENT_ENABLED=true` and Amplify build-time `VITE_HISTORICAL_MANAGEMENT=true` (defaults off). Configure IAM, bucket CORS and validate signed PUT/GET with a disposable test annual before enabling both. A production merge alone must not activate privileged upload/download routes. Amplify rebuilds `main` automatically and GitHub Actions publishes the backend on merge.

## Tests and acceptance

- Producer unit/integration tests: anonymous 401, free 403, manager/admin inventory and upload/download, safe signed policy, collision 409, invalid year/path/oversized rejection.
- Frontend lint/build, backend Node 22 + MySQL CI.
- Independent security review of conditional PUT signature, IAM and CORS, plus S3 upload and browsing session.
- Confirm existing search and visual PDF views remain unaffected.
