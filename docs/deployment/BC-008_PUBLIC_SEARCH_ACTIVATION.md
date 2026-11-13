# BC-008 — Controlled production activation of archive keyword search

Status: **prepared, not deployed or independently verified** (2026-11-13).

## Owner-approved product behavior / SRS reconciliation

The owner expressly requests activation of public, read-only documentary discovery on boscochat.com. Anonymous users may execute a search and receive **at most 10 page previews**; opening the original source requires an authenticated session. This is a requested change to the existing RF-USER-03 / BC-009 baseline, which previously required login before search. **TRACE-GAP:** update and approve the SRS baseline and independent security review before public rollout. BC-008 remains BLOCKED until the tests and release checks below pass.

## Implemented guard

- Archive public search endpoint: `GET /api/archive/search?q=Bosco&year=1923`, routed only with `ARCHIVE_PUBLIC_SEARCH_ENABLED=true`.
- Distributed limit: **30 requests/IP/60 seconds**, using the existing MySQL `auth_rate_limits` table, with HMAC-hashed IP keys. No IP stored in plaintext by this limiter.
- If the shared store fails, the middleware returns an error rather than bypassing the limit.
- Public response is limited to 10 result previews, and caching disabled. Protected page/PDF endpoints remain authenticated; PDF viewing is **not** enabled by this rollout.
- The present input parser supports all-required terms and year filtering, **not** full phrase/OR syntax. Do not claim BC-008 DONE.

## Deployment steps — separate backend and frontend releases

1. Pass backend CI/tests and independent security/functional review of this PR. Verify shared MySQL table `auth_rate_limits` exists and the Lambda has `AUTH_RATE_LIMIT_HMAC_KEY` (>=32 bytes) configured privately. Review burst limits, CloudWatch alarms and API Gateway/WAF throttling separately. This middleware is not a substitute for upstream global throttling.
2. Deploy the reviewed backend commit to `boscochat-backend` using the established Lambda deployment mechanism (no production backend deployment workflow in this PR). Set Lambda environment `ARCHIVE_PUBLIC_SEARCH_ENABLED=true`. Retain the existing production DB/TLS settings and `ARCHIVE_PDF_VIEW_ENABLED=false`.
3. Probe `GET https://i40yd4xj1k.execute-api.us-east-1.amazonaws.com/api/archive/search?q=Bosco&year=1923`: status 200, JSON `results`, <=10 entries. Confirm 400 on malformed search input and 429 after 30 calls from one IP in 60 seconds (controlled staging test; avoid load tests against production). Confirm backend logs and index latency on representative documents; do not leak private PDF URLs.
4. In AWS Amplify for the `boscochat.com` frontend, set `VITE_ARCHIVE_SEARCH=true` and **rebuild/redeploy the frontend**. Preserve the existing correct `VITE_API_URL` value; Vite build-time variables do not change after an already-built release.
5. Visit `https://boscochat.com` in a private browser session: run an anonymous search, filter by year, see no more than 10 previews; click a result and confirm login is required before page text loads. Confirm cookies/CORS are valid from `boscochat.com`. If a deployed frontend is not configured for the production API, correct `VITE_API_URL` before enabling.
6. Check 5xx/429 CloudWatch metrics, API gateway traffic, query p95 (<2s objective), and DB connections. Rollback: disable `ARCHIVE_PUBLIC_SEARCH_ENABLED` in Lambda and redeploy the frontend with `VITE_ARCHIVE_SEARCH=false`.

## Explicitly outstanding

- This PR does **not** configure AWS credentials, mutate the live Lambda/Amplify environment, deploy artifacts or verify the live website.
- Independent FULL cybersecurity review, SRS revision for RF-USER-03, complete query syntax, result highlight/metadata and protected PDF viewing are still pending.
