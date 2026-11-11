# BoscoChat Progress

## Current focus
- BC-002 — PR #17 merged to `main` on 2026-11-10 with the shared MySQL/HMAC authentication limiter and passing producer CI, but with zero submitted reviews and while its recorded gate said `BLOCKED / TRACE-GAP — do not merge`. The story remains `BLOCKED`.
- BC-003 — Query usage logging and quotas remains `BLOCKED` after merge pending independent gates and policy approval.
- BC-006 — PR #17–#21 and #23 placed catalog hashes, AWS planning evidence, annual-key parsing, a disabled S3 probe, archive schema/import/search components and a disabled PDF proxy on `main`. No real Lambda `GetObject`, archive migration, ingestion, representative AWS read or independent FULL review is evidenced; BC-006 remains `BLOCKED`.
- BC-007, BC-008, BC-009 and BC-012 — Partial product artifacts were merged in PR #20/#23 but remain disabled by default or unexecuted. Their completion and activation are blocked by dependencies, representative environment evidence, independent review and, for anonymous search, an SRS baseline conflict.

## In progress
- PR #24 is open as a draft documentation-only reconciliation of the externally merged PR #17–#21 and #23 artifacts. It is mergeable and conflict-free, but remains `BLOCKED / TRACE-GAP` until an independent reviewer verifies the exact head.

## Blocked
- BC-002 — Required: representative staging/distributed-load validation; distinct independent FULL security and functional review; deployment provisioning for `AUTH_RATE_LIMIT_HMAC_KEY`; approved access/retention/deletion policy for `admin_audit_logs`.
- BC-003 — Required: independent functional verification, independent FULL security confirmation of the CWE-400 remediation in `c74dce1`, and explicit approval or exception acceptance for production quota/reset values and query-log retention.
- BC-006 — Required: approved storage/encryption/privacy baseline; independently verified S3/KMS/IAM/backend/IaC deployment; positive and negative AWS access tests; real Lambda document read; retention/antimalware/audit/RPO-RTO decisions; independent FULL review. Owner-supplied screenshots indicate S3 with SSE-S3, while the proposal still requires SSE-KMS.
- BC-007 — Parser, schema and one-PDF importer exist, but archive migration/ingestion has not run in a representative AWS/RDS environment. Upload authorization, retry/diagnostics, OCR correction and correction audit trail remain unevidenced.
- BC-008 — Word-search/annual-filter preview code exists behind disabled flags, but no real indexed corpus, performance proof, exact-phrase/AND/OR coverage, public anti-abuse control or independent review exists. Anonymous execution conflicts with RF-USER-03.
- BC-009 — The merged flow retains a selected document/page through login, not the entered query required by RF-USER-03; anonymous execution conflicts with the approved baseline.
- BC-012 — Page-text retrieval and a PDF range-proxy prototype exist behind disabled flags; real S3/API Gateway behavior, cookies/CSP, large-PDF handling, source-page navigation and watermarking remain unverified.
- Production release/deployment only: rotate or revoke the database credential previously committed to Git history and validate backup/restore plus the authentication migration on representative staging data. Per project-owner direction on 2026-09-15, this operational action is deferred and does not block unrelated development stories.

## Ready but not executable
- BC-004 depends on BC-003, which is not `DONE`.
- BC-010 has only a partial annual filter and depends on blocked BC-008.
- BC-011 has only a partial result preview and depends on blocked BC-008 plus incomplete BC-010.
- No `READY` story is currently executable.

## In review
- PR #24 — Draft documentation reconciliation. No workflow applies to its documentation-only diff; independent review on the exact head is pending. Merged artifacts with unsatisfied gates remain `BLOCKED`, not `DONE`.

## Product / requirements review
- PR #20 records an owner-conversation claim that archive discovery should be anonymous and return at most ten previews. This conflicts with RF-USER-03 and BC-008/BC-009, which prohibit unauthenticated search execution. Treat the behavior as `TRACE-GAP` and keep it disabled until the approved SRS/backlog baseline is reconciled.
- BC-014 — User profile management and BC-015 — Email verification/controlled email change remain separate non-executable `IDEA` stories with measurable criteria and `TRACE-GAP`.

## Recently merged artifacts
- PR #17 — Merged 2026-11-10 with passing producer workflows, zero submitted reviews and an explicit blocking gate. Remediations and catalog hashes are on `main`; BC-002 and BC-006 remain blocked.
- PR #18 — Documentation-only AWS/S3 plan and owner-supplied console observations; merged with no workflow or submitted review.
- PR #19 — Annual archive-key parser only; producer CI passed, no submitted review.
- PR #20 — Archive schema/import/search/viewer modules and frontend prototype; producer CI passed, no submitted review. Migration, ingestion and AWS deployment were not executed; feature flags remain off.
- PR #21 — Disabled-by-default administrator S3 header probe; producer CI passed, no submitted review and no real probe result.
- PR #22 — Closed without merge as superseded.
- PR #23 — Mounted archive search/document routes into the current backend and retained disabled flags; producer CI passed, no submitted review.

## Recently completed
- AWS MVP authentication runtime validated end-to-end on 2026-09-15: Amplify frontend, API Gateway HTTP API, Lambda/Express via Lambda Web Adapter, private RDS MySQL, verified RDS TLS, exact-origin CORS, registration, login, persisted session/reload and logout. Architecture and deployment evidence were documented in PR #8 and merged to `main`.
- BC-001 — User registration and authentication. PR #4 merged on 2026-09-14. Independent code/functional verification and FULL source-based security review recorded in PR #5. Acceptance criteria pass; release constraints remain listed separately above.
