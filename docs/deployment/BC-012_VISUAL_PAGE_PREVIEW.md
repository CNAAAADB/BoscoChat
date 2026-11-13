# BC-012 — Private visual page previews (scoped MVP)

Date: 2026-11-13. Owner observed that clicking a search result shows only extracted OCR, not a visual rendering of the original PDF.

## Design
- Preserve originals in private `s3://boscochat-archivo-pdfs/originals/`; no public S3 URLs or whole-PDF bytes sent to the browser.
- An isolated Lambda container (Poppler, already used for ingest) renders **one physical page** into JPEG at 1400px max dimension.
- Unwatermarked renders are cached privately in `s3://boscochat-archivo-pdfs/previews/<year>/<original-etag>/<page>.jpg`, invalidating automatically when an original changes. S3 event ingestion only watches `originals/`.
- A new backend route `GET /api/archive/documents/{id}/pages/{number}/image` is guarded by the existing session authorization, strict positive numeric parameters, document/page existence checks, shared MySQL throttling (20 requests/IP/min), a required strong secret and IAM permission to invoke **only** the renderer.
- Backend inserts a user-associated invisible JPEG metadata trace marker into each response; it does not expose user identifiers or watermark secrets in the image metadata.
- React fetches the JPEG with session cookies, creates a short-lived local object URL, revokes it on navigation, and shows zoom and previous/next controls. The existing OCR page remains accessible as a fallback.
- Release flags: backend `ARCHIVE_PAGE_IMAGE_ENABLED=true`, frontend `VITE_ARCHIVE_PAGE_IMAGE=true`. **Do not turn on either until the renderer Lambda, IAM permissions and production positive/negative checks pass.** Preserve `ARCHIVE_PDF_VIEW_ENABLED=false` and `VITE_ARCHIVE_PDF_VIEW=false` to avoid direct PDF proxy exposure.

## Security and known limitations
- All originals and cache files remain private. The backend returns just JPEG page bytes after authentication. A screenshot of any browser image cannot be prevented.
- The JPEG metadata user trace is **not** a robust, tamper-resistant invisible watermark: metadata can be stripped. RF-DOC-03 remains a TRACE-GAP pending independent cybersecurity and watermark testing. The feature must not be marked BC-012 DONE from these tests alone.
- S3 image caching may consume extra storage and rendering creates S3 GET costs. First access to a large PDF can exceed the backend 15-second timeout; measure representative files and increase the backend timeout only if necessary, with a bounded API Gateway wait limit.
- Preview images are not semantic OCR correction and do not enhance indexing; they restore the visual layout of the original scanned page.

## Release checklist
1. Pass producer tests, frontend build/lint, and an independent security review of the worker inputs, cache policy, watermark, session route and IAM.
2. Publish immutable reviewed worker image to ECR via the existing `publish-pdf-worker.yml`; deploy `infra/archive-page-renderer.yaml` with the selected image URI, existing private subnets and security group.
3. Grant the existing backend Lambda execution role only `lambda:InvokeFunction` on `boscochat-pdf-page-renderer`; do not grant direct read of `previews/` to the public API.
4. In production, test a single annual PDF page by directly invoking the private renderer; verify a JPEG response and `previews/` object.
5. Provision a secret `ARCHIVE_WATERMARK_HMAC_KEY` (at least 32 bytes, unique to this purpose) and set backend `ARCHIVE_PAGE_IMAGE_ENABLED=true`. Confirm image route rejects anonymous requests (401), invalid IDs (400), missing pages (404), and returns a JPEG only for a valid logged-in user. Test 429 with controlled rate-limit tests and 502 on isolated renderer failure.
6. In Amplify set `VITE_ARCHIVE_PAGE_IMAGE=true` and redeploy `main`. Test the chosen source-page opening, zoom, navigation, mobile layout, session expiry, pages with weak OCR and large PDF sizes.
7. Rollback: set `ARCHIVE_PAGE_IMAGE_ENABLED=false` in Lambda and `VITE_ARCHIVE_PAGE_IMAGE=false` in Amplify; no original PDFs or archive DB records are modified by this feature.
